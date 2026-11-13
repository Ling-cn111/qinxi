<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { MAX_MIDI, MIN_MIDI } from '@/audio/note';

/**
 * 钢琴上方的音符可视化。
 *
 * 一个音出手时，除了它自己的柱子，还会点亮几条泛音柱（八度、五度、双八度…），
 * 看起来才像频谱而不是孤零零一根线。每根柱子按指数衰减（约 0.6s 掉一半），
 * 叠加一点相位抖动，形成"跳动"的观感。88 个半音均分画布宽度，左低右高。
 *
 * 只在有活跃音符时跑 requestAnimationFrame，松手安静后自动停下。
 */
const canvasRef = ref<HTMLCanvasElement | null>(null);

const CAPACITY = MAX_MIDI + 1;
const levels = new Float32Array(CAPACITY);
const phases = new Float32Array(CAPACITY);
const DECAY_SECONDS = 0.95;

let ctx: CanvasRenderingContext2D | null = null;
let observer: ResizeObserver | null = null;
let frameId = 0;
let lastTime = 0;
let width = 0;
let height = 0;

/**
 * 柱子的渐变按「这一根自己的高度」建：柱尖永远是最亮的米色。
 * 如果整块画布共用一条渐变，矮柱子只能取到中间那段橙色，看起来发闷。
 */
function barGradient(context: CanvasRenderingContext2D, top: number, level: number): CanvasGradient {
  const next = context.createLinearGradient(0, top, 0, height);
  next.addColorStop(0, `rgba(255, 233, 200, ${0.55 + 0.45 * level})`);
  next.addColorStop(0.5, `rgba(224, 160, 90, ${0.45 + 0.4 * level})`);
  next.addColorStop(1, 'rgba(126, 70, 26, 0.72)');
  return next;
}

function draw(): void {
  if (!ctx || width === 0) return;
  ctx.clearRect(0, 0, width, height);

  const span = MAX_MIDI - MIN_MIDI + 1;
  const cell = width / span;
  const barWidth = Math.max(3, Math.min(10, cell * 0.62));
  const radius = Math.min(barWidth / 2, 2.5);
  const now = performance.now() / 1000;

  for (let pitch = MIN_MIDI; pitch <= MAX_MIDI; pitch += 1) {
    const level = levels[pitch];
    if (level <= 0.004) continue;

    const wobble = 1 + 0.14 * Math.sin(now * 8.5 + phases[pitch]);
    const barHeight = Math.min(height, Math.pow(level, 1.04) * height * wobble);
    const x = (pitch - MIN_MIDI + 0.5) * cell - barWidth / 2;
    const y = height - barHeight;

    ctx.fillStyle = barGradient(ctx, y, level);
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, barWidth, barHeight, [radius, radius, 0, 0]);
    ctx.fill();
  }
}

function frame(time: number): void {
  const dt = lastTime ? Math.min(0.05, (time - lastTime) / 1000) : 0.016;
  lastTime = time;

  const damp = Math.exp(-dt / DECAY_SECONDS);
  let alive = false;
  for (let pitch = MIN_MIDI; pitch <= MAX_MIDI; pitch += 1) {
    if (levels[pitch] === 0) continue;
    levels[pitch] *= damp;
    if (levels[pitch] < 0.004) levels[pitch] = 0;
    else alive = true;
  }

  draw();

  if (alive) {
    frameId = requestAnimationFrame(frame);
  } else {
    frameId = 0;
    lastTime = 0;
  }
}

/** 泛音柱：[半音偏移, 相对强度] */
const HARMONICS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [12, 0.5],
  [19, 0.34],
  [24, 0.24],
  [28, 0.16],
];

/** 在音符按下时调用 */
function trigger(pitch: number, velocity = 100): void {
  if (pitch < MIN_MIDI || pitch > MAX_MIDI) return;
  const strength = Math.min(1, Math.max(0, velocity / 127));
  const peak = 0.72 + 0.28 * strength;

  for (const [offset, gain] of HARMONICS) {
    const target = pitch + offset;
    if (target > MAX_MIDI) continue;
    levels[target] = Math.max(levels[target], peak * gain);
    phases[target] = Math.random() * Math.PI * 2;
  }

  if (!frameId) {
    lastTime = 0;
    frameId = requestAnimationFrame(frame);
  }
}

function resize(): void {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = rect.width;
  height = rect.height;
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  const context = canvas.getContext('2d');
  if (!context) return;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx = context;
  draw();
}

onMounted(() => {
  resize();
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => resize());
    if (canvasRef.value) observer.observe(canvasRef.value);
  }
  window.addEventListener('resize', resize);
});

onBeforeUnmount(() => {
  if (frameId) cancelAnimationFrame(frameId);
  frameId = 0;
  observer?.disconnect();
  observer = null;
  window.removeEventListener('resize', resize);
});

defineExpose({ trigger });
</script>

<template>
  <div class="viz" aria-hidden="true">
    <canvas ref="canvasRef" class="viz__canvas"></canvas>
  </div>
</template>

<style scoped>
.viz {
  width: 90%;
  height: 116px;
  margin: 14px auto -14px;
  pointer-events: none;
  /* 顶部渐隐，柱子冲到顶端不会撞出一条硬边 */
  mask-image: linear-gradient(to top, rgba(0, 0, 0, 1) 62%, rgba(0, 0, 0, 0) 100%);
  -webkit-mask-image: linear-gradient(to top, rgba(0, 0, 0, 1) 62%, rgba(0, 0, 0, 0) 100%);
}

.viz__canvas {
  display: block;
  width: 100%;
  height: 100%;
}

@media (max-width: 820px) {
  .viz {
    width: 92%;
    height: 84px;
  }
}
</style>
