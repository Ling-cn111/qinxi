<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { buildKeyboardLayout, WHITE_KEY_COUNT } from '@/keyboard/layout';
import { themeId } from '@/theme/useTheme';
import type { NoteEvent } from '@/types';
import type { Grade } from '@/game/judge';

/**
 * 下落音符画布（Canvas 2D，rAF 逐帧绘制，禁用一切 DOM/CSS 动画）。
 *
 * ## 摆放与坐标
 *
 * 组件被放进 `PianoKeyboard` 的 `.keybed`（通过 overlay 插槽），绝对定位铺满键床上部 ——
 * 所以它**跟着键床一起横向滚动**，音符的 x 坐标直接用键床几何
 * （`buildKeyboardLayout()`，单位 = 白键宽），和琴键 1:1 对齐，不需要关心视口滚到哪。
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

/**
 * 配色跟着外观主题走：白键音符用主题强调色，黑键音符用亮墨色，
 * 判定线用强调色（从 `<html>` 读 CSS 变量，见 src/theme/themes.ts）。
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
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (width === 0 || height === 0) return;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
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
  const unit = width / WHITE_KEY_COUNT;
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

    const x = geo.left * unit;
    const w = geo.width * unit;
    const yTop = Math.max(0, yTopRaw);
    const h = Math.max(MIN_HEIGHT_PX, yBottom - Math.min(yTop, lineY));
    const judgedGrade = props.judged.get(index);

    if (judgedGrade) {
      // 已判定：沉成暗灰，不再抢视线
      ctx.fillStyle = `rgba(${palette.white}, 0.16)`;
    } else if (geo.isBlack) {
      ctx.fillStyle = `rgba(${palette.ink}, 0.88)`;
    } else {
      ctx.fillStyle = `rgba(${palette.accent}, 0.9)`;
    }

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

    // 黑键音符描一圈亮边，和白键块区分得更清楚
    if (geo.isBlack && !judgedGrade) {
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
  resize();
  resizeObserver = new ResizeObserver(() => resize());
  if (canvasRef.value) resizeObserver.observe(canvasRef.value);
  if (props.playing) startLoop();
});

onBeforeUnmount(() => {
  stopLoop();
  resizeObserver?.disconnect();
  resizeObserver = null;
});
</script>

<template>
  <canvas ref="canvasRef" class="follow-canvas" aria-hidden="true"></canvas>
</template>

<style scoped>
/* 绝对定位铺满键床上部：跟键床一起横向滚动，坐标与琴键 1:1。
   pointer-events 必须关掉 —— 底下是可点的琴键。 */
.follow-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 62%;
  z-index: 3;
  pointer-events: none;
}
</style>
