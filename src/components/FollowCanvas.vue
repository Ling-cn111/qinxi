<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { buildKeyboardLayout, KEYBED_WIDTH_PERCENT, WHITE_KEY_COUNT } from '@/keyboard/layout';
import { themeId } from '@/theme/useTheme';
import type { NoteEvent } from '@/types';
import type { Grade } from '@/game/judge';

/**
 * 下落音符画布（Canvas 2D，rAF 逐帧绘制，禁用一切 DOM/CSS 动画）。
 *
 * ## 摆放
 *
 * 占据钢琴上方「音符频谱」同一条带的位置（跟弹播放时把频谱整体替换掉，
 * 由 App 控制 v-if / v-else），所以宽度 = 琴键视口宽度（90% 页面宽）。
 * 音符的 x 坐标按键床几何换算再减去键床的滚动量 —— 音区切换、手动滚动都对得上。
 *
 * ## 时间 → 纵向位置
 *
 * 判定线在画布**底边**（键盘顶部）。音符块底边在 `startBeat` 那一刻触线：
 *
 * ```
 * y(beat) = lineY − (beat − currentBeat) × pxPerBeat
 * ```
 *
 * `pxPerBeat = 画布高 / 预备拍数`，预备拍数由固定预备秒数（2s）按 BPM 折算 ——
 * BPM 越高每拍像素越少、下落越快，速度与 BPM 严格匹配。
 *
 * ## 颜色
 *
 * `NoteEvent.hand` 有左右手信息时：右手 = 主题强调色、左手 = 亮墨色；
 * 没有 hand 信息（内置谱就没有）→ 回落按黑白键区分：白键 = 强调色、黑键 = 亮墨 + 亮边。
 * 已判定的音符沉成暗灰，不再抢视线。
 *
 * ## 数据流（低耦合）
 *
 * - 拍位通过 `getBeat()` 回调每帧取（App 传 `transport.rawBeat`，音频时钟同源）；
 * - 已判定集合 `judged` 是**可变对象**，判定引擎那边原地写，这边每帧读 ——
 *   不走 Vue 响应式（判定频率高，没必要让 props 抖动）；
 * - `playing` 变化才启停 rAF 循环；暂停 / 停止时补画一帧静止画面。
 */
const props = defineProps<{
  /** 谱面音符（下标与 judged 的键对应） */
  notes: readonly NoteEvent[];
  /** 音符下标 → 判定等级（App 里判定后原地写入） */
  judged: ReadonlyMap<number, Grade>;
  /** 每帧取当前拍位（未钳制） */
  getBeat: () => number;
  /** 播放中才跑 rAF 循环 */
  playing: boolean;
  /** 当前 BPM（决定下落速度） */
  bpm: number;
}>();

/** 音符提前多久出现在画布顶部（秒）——固定秒数按 BPM 折算成预备拍数 */
const LEAD_SECONDS = 2;
/** 音符块最小像素高度（16 分音很短，别画成一条线） */
const MIN_HEIGHT_PX = 6;

const canvasRef = ref<HTMLCanvasElement | null>(null);
let ctx: CanvasRenderingContext2D | null = null;
let rafId = 0;
let resizeObserver: ResizeObserver | null = null;

/** 键床几何：pitch → 位置（单位 = 白键宽） */
const geometry = new Map<number, { left: number; width: number; isBlack: boolean }>();
for (const key of buildKeyboardLayout()) {
  geometry.set(key.pitch, { left: key.left, width: key.width, isBlack: key.isBlack });
}

/** 键床横向滚动容器（.piano-key-wrap）：每帧读 scrollLeft 对齐琴键 */
let scroller: Element | null = null;

/**
 * 配色跟着外观主题走（从 `<html>` 读 CSS 变量，见 src/theme/themes.ts）：
 * 右手 / 白键 = 强调色，左手 / 黑键 = 亮墨色。
 */
const palette = {
  accent: '207, 164, 106',
  ink: '231, 227, 220',
  white: '255, 255, 255',
};

function readPalette(): void {
  if (typeof window === 'undefined') return;
  const styles = window.getComputedStyle(document.documentElement);
  const pick = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
  palette.accent = pick('--qin-accent-rgb', palette.accent);
  palette.ink = pick('--qin-ink-rgb', palette.ink);
  palette.white = pick('--qin-w-rgb', palette.white);
}

function resize(): void {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (width === 0 || height === 0) return;
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  ctx = canvas.getContext('2d');
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}

function draw(): void {
  const canvas = canvasRef.value;
  if (!canvas || !ctx) return;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (width === 0 || height === 0) return;

  ctx.clearRect(0, 0, width, height);
  const lineY = height;
  // 键床 px 宽 = 视口宽 × 144.3%；1 白键 = 键床宽 / 52
  const unit = (width * KEYBED_WIDTH_PERCENT) / 100 / WHITE_KEY_COUNT;
  const scrollLeft = scroller?.scrollLeft ?? 0;
  const pxPerBeat = height / ((LEAD_SECONDS * props.bpm) / 60);
  const beat = props.getBeat();

  // ---------------------------------------------------------- 音符块
  for (let index = 0; index < props.notes.length; index += 1) {
    const item = props.notes[index];
    const geo = geometry.get(item.pitch);
    if (!geo) continue;

    const yBottom = lineY - (item.startBeat - beat) * pxPerBeat;
    const yTopRaw = lineY - (item.startBeat + item.durationBeats - beat) * pxPerBeat;
    // 已经过线太远（正在被按住 / 已经判定完沉底）的不用再画
    if (yTopRaw > lineY + 4 || yBottom < -40) continue;

    const x = geo.left * unit - scrollLeft;
    const w = geo.width * unit;
    if (x + w < 0 || x > width) continue; // 滚出视口的键不画

    const yTop = Math.max(0, yTopRaw);
    const h = Math.max(MIN_HEIGHT_PX, yBottom - Math.min(yTop, lineY));
    const judgedGrade = props.judged.get(index);

    // 左右手优先；谱面没写 hand 时按黑白键区分
    let fill: string;
    if (judgedGrade) {
      fill = `rgba(${palette.white}, 0.16)`;
    } else if (item.hand === 'left') {
      fill = `rgba(${palette.ink}, 0.88)`;
    } else if (item.hand === 'right' || !geo.isBlack) {
      fill = `rgba(${palette.accent}, 0.9)`;
    } else {
      fill = `rgba(${palette.ink}, 0.88)`;
    }
    ctx.fillStyle = fill;

    // 顶部圆角矩形：贴判定线的底边是平的（齐线落键的观感）
    const radius = Math.min(4, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + 1, lineY - h + radius);
    ctx.quadraticCurveTo(x + 1, lineY - h, x + 1 + radius, lineY - h);
    ctx.lineTo(x + w - 1 - radius, lineY - h);
    ctx.quadraticCurveTo(x + w - 1, lineY - h, x + w - 1, lineY - h + radius);
    ctx.lineTo(x + w - 1, lineY);
    ctx.lineTo(x + 1, lineY);
    ctx.closePath();
    ctx.fill();

    // 黑键音符（无 hand 回落时）描一圈亮边，和白键块区分得更清楚
    if (!item.hand && geo.isBlack && !judgedGrade) {
      ctx.strokeStyle = `rgba(${palette.white}, 0.5)`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  // ---------------------------------------------------------- 判定线
  ctx.save();
  ctx.shadowColor = `rgba(${palette.accent}, 0.55)`;
  ctx.shadowBlur = 8;
  ctx.fillStyle = `rgba(${palette.accent}, 0.95)`;
  ctx.fillRect(0, lineY - 2, width, 2);
  ctx.restore();
}

function frame(): void {
  draw();
  rafId = props.playing ? requestAnimationFrame(frame) : 0;
}

function startLoop(): void {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(frame);
}

function stopLoop(): void {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
  draw(); // 补一帧静止画面（暂停 / 停止后的残影清掉）
}

watch(
  () => props.playing,
  (on) => (on ? startLoop() : stopLoop()),
);

// 谱面换了 / BPM 变了：静止时也重画一次
watch(
  () => [props.notes, props.bpm] as const,
  () => {
    if (!props.playing) draw();
  },
);

watch(themeId, () => {
  readPalette();
  draw();
});

onMounted(() => {
  readPalette();
  scroller = document.querySelector('.piano-key-wrap');
  resize();
  resizeObserver = new ResizeObserver(() => resize());
  if (canvasRef.value) resizeObserver.observe(canvasRef.value);
  if (props.playing) startLoop();
});

onBeforeUnmount(() => {
  stopLoop();
  resizeObserver?.disconnect();
  resizeObserver = null;
  scroller = null;
});
</script>

<template>
  <div class="follow-viz" aria-hidden="true">
    <canvas ref="canvasRef" class="follow-viz__canvas"></canvas>
  </div>
</template>

<style scoped>
/* 与音符频谱（NoteVisualizer .viz）同一条带：同宽同高，替换时布局不跳动 */
.follow-viz {
  width: 90%;
  height: 96px;
  margin: 12px auto -12px;
  pointer-events: none;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.12), rgba(0, 0, 0, 0.34));
  /* 顶部渐隐，音符冲进顶端不会撞出一条硬边 */
  mask-image: linear-gradient(to top, rgba(0, 0, 0, 1) 62%, rgba(0, 0, 0, 0) 100%);
  -webkit-mask-image: linear-gradient(to top, rgba(0, 0, 0, 1) 62%, rgba(0, 0, 0, 0) 100%);
}

.follow-viz__canvas {
  display: block;
  width: 100%;
  height: 100%;
}

@media (max-width: 820px) {
  .follow-viz {
    width: 92%;
    height: 84px;
  }
}
</style>
