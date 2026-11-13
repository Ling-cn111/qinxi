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
 * 判定线在画布**底边**（键盘顶部）。每颗音是一根**紧凑的小长条**，从画布顶端入场、
 * 匀速下落，**底边在 `startBeat` 那一刻正好压到判定线**——触线的瞬间就是弹奏时机；
 * 过线后继续往下走出画布，不贴线残留：
 *
 * ```
 * yBottom(beat) = lineY − (startBeat − currentBeat) × pxPerBeat
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
/** 下落小长条的像素厚度（细条，底边对齐判定线） */
const STRIP_HEIGHT = 8;
/** 命中闪光的持续时长（秒） */
const FLASH_SECONDS = 0.38;

/** 一次命中闪光：在哪根键的 x 上、什么时候、什么档位 */
interface HitFlash {
  pitch: number;
  born: number;
  grade: Grade;
}

const flashes: HitFlash[] = [];

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
  gold: '255, 198, 92',
  red: '255, 110, 92',
};

/** '#rrggbb' → 'r, g, b'（读主题的强调亮色当金色） */
function hexToRgb(hex: string): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return '';
  const value = Number.parseInt(match[1], 16);
  return `${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}`;
}

function readPalette(): void {
  if (typeof window === 'undefined') return;
  const styles = window.getComputedStyle(document.documentElement);
  const pick = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
  palette.accent = pick('--qin-accent-rgb', palette.accent);
  palette.ink = pick('--qin-ink-rgb', palette.ink);
  palette.white = pick('--qin-w-rgb', palette.white);
  palette.gold = hexToRgb(pick('--qin-accent-strong', '#ffc65c')) || palette.gold;
  palette.red = pick('--qin-danger-rgb', palette.red);
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

  // ---------------------------------------------------------- 下落小长条
  for (let index = 0; index < props.notes.length; index += 1) {
    const item = props.notes[index];
    const geo = geometry.get(item.pitch);
    if (!geo) continue;

    // 长条底边的纵坐标：startBeat 那一刻正好压在判定线上
    const yBottom = lineY - (item.startBeat - beat) * pxPerBeat;
    // 还在高空没入场 / 已完全滑出判定线的都不画
    if (yBottom < -STRIP_HEIGHT || yBottom - STRIP_HEIGHT > lineY) continue;

    const x = geo.left * unit - scrollLeft;
    const w = geo.width * unit;
    if (x + w < 0 || x > width) continue; // 滚出视口的键不画

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

    // 紧凑小长条：整块下落，底边触线的瞬间 = 弹奏时机；
    // 过线后继续往下走出画布（被画布边缘裁掉），不贴线残留
    const y = yBottom - STRIP_HEIGHT;
    const radius = 3;
    ctx.beginPath();
    ctx.roundRect(x + 1, y, w - 2, STRIP_HEIGHT, radius);
    ctx.fill();

    // 黑键音符（无 hand 回落时）描一圈亮边，和白键条区分得更清楚
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

  // ---------------------------------------------------------- 命中闪光（弹对时判定线上的反馈）
  const nowMs = performance.now();
  for (let i = flashes.length - 1; i >= 0; i -= 1) {
    const hit = flashes[i];
    const age = (nowMs - hit.born) / 1000;
    if (age > FLASH_SECONDS) {
      flashes.splice(i, 1);
      continue;
    }
    const geo = geometry.get(hit.pitch);
    if (!geo) continue;
    const x = (geo.left + geo.width / 2) * unit - scrollLeft;
    const t = age / FLASH_SECONDS;
    // 配色：Perfect 金光、Good 白光、Miss 红光
    const color =
      hit.grade === 'perfect' ? palette.gold
      : hit.grade === 'miss' ? palette.red
      : palette.white;
    const strength = hit.grade === 'perfect' ? 1 : hit.grade === 'good' ? 0.7 : 0.75;
    const alpha = (1 - t) * strength;

    // 判定线上的一小段亮条，向两边收
    const halfWidth = (geo.width * unit) / 2 * (1 - 0.35 * t);
    ctx.save();
    ctx.shadowColor = `rgba(${color}, ${alpha})`;
    ctx.shadowBlur = 10;
    ctx.fillStyle = `rgba(${color}, ${alpha})`;
    ctx.fillRect(x - halfWidth, lineY - 3, halfWidth * 2, 3);
    // 向上散开的光点
    ctx.beginPath();
    ctx.arc(x, lineY - 4, 4 + 14 * t, Math.PI, 0);
    ctx.closePath();
    ctx.fillStyle = `rgba(${color}, ${alpha * 0.55})`;
    ctx.fill();
    ctx.restore();
  }

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
  flashes.length = 0; // 暂停 / 停止时清掉未散尽的命中闪光
  draw(); // 补一帧静止画面（暂停 / 停止后的残影清掉）
}

/** 判定后在判定线上闪一下（App 判定完成就调用，Miss 闪红光） */
function flash(pitch: number, grade: Grade): void {
  flashes.push({ pitch, born: performance.now(), grade });
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

defineExpose({ flash });

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
  /* 不做顶部渐隐：小长条必须能看见「从空中入场」，遮了就像从半空冒出来 */
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
