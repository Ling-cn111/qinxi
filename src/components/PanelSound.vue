<script setup lang="ts">
import { computed } from 'vue';

/**
 * 「声音」页：只有主音量。
 *
 * 音色目录（原 28 条 GM 占位）已删掉 —— 当前只接了 AutoPiano 原版采样这一种音源，
 * 摆一排点不动的音色没有意义。以后真接入多音色时，再按当时的采样重新设计这一页。
 */
const volume = defineModel<number>('volume', { required: true });

const volumeText = computed(() => (volume.value / 100).toFixed(2));
const fillStyle = computed(() => ({ '--fill': `${volume.value}%` }));
</script>

<template>
  <section class="panel">
    <div class="panel-head">
      <h3 class="panel-title"><span class="panel-title__num">1</span>音量</h3>
      <span class="panel-count">主输出 · 0–100</span>
    </div>

    <div class="volume">
      <svg class="volume__icon" viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M2.6 6.2h2.2L8.2 3.4v9.2L4.8 9.8H2.6z"
          fill="none"
          stroke="currentColor"
          stroke-width="1.15"
          stroke-linejoin="round"
        />
      </svg>
      <input
        v-model.number="volume"
        class="volume__range"
        type="range"
        min="0"
        max="100"
        step="1"
        :style="fillStyle"
        aria-label="主音量"
      />
      <svg class="volume__icon" viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M2.6 6.2h2.2L8.2 3.4v9.2L4.8 9.8H2.6z"
          fill="none"
          stroke="currentColor"
          stroke-width="1.15"
          stroke-linejoin="round"
        />
        <path
          d="M10.2 6.1a3.1 3.1 0 0 1 0 3.8M12.1 4.6a5.4 5.4 0 0 1 0 6.8"
          fill="none"
          stroke="currentColor"
          stroke-width="1.15"
          stroke-linecap="round"
        />
      </svg>
      <span class="volume__value">{{ volumeText }}</span>
    </div>

    <p class="panel-desc">
      音源固定为 AutoPiano 原版单音采样（C2–C7 全半音 61 个 mp3），采样范围外靠移调补齐；
      音量同时作用于总线，与顶栏滑块是同一个值。
    </p>
  </section>
</template>

<style scoped>
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.panel-count {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11px;
  letter-spacing: 0.06em;
  color: rgba(var(--qin-ink-rgb), 0.34);
}

/* ------------------------------------------------------------------ 音量 */
.volume {
  display: flex;
  align-items: center;
  gap: 14px;
  max-width: 520px;
  color: rgba(var(--qin-ink-rgb), 0.5);
}

.volume__icon {
  width: 17px;
  height: 17px;
  display: block;
  flex: 0 0 auto;
}

.volume__value {
  flex: 0 0 auto;
  width: 34px;
  text-align: right;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11.5px;
  letter-spacing: 0.04em;
  color: rgba(var(--qin-ink-rgb), 0.42);
}

.volume__range {
  appearance: none;
  flex: 1;
  height: 18px;
  background: transparent;
  cursor: pointer;
}

.volume__range::-webkit-slider-runnable-track {
  height: 3px;
  border-radius: 2px;
  background: linear-gradient(
    to right,
    var(--qin-accent-dim) 0,
    var(--qin-accent-dim) var(--fill),
    rgba(var(--qin-w-rgb), 0.14) var(--fill),
    rgba(var(--qin-w-rgb), 0.14) 100%
  );
}

.volume__range::-webkit-slider-thumb {
  appearance: none;
  width: 12px;
  height: 12px;
  margin-top: -4.5px;
  border-radius: 50%;
  background: rgb(var(--qin-ink-rgb));
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
}

.volume__range::-moz-range-track {
  height: 3px;
  border-radius: 2px;
  background: rgba(var(--qin-w-rgb), 0.14);
}

.volume__range::-moz-range-progress {
  height: 3px;
  border-radius: 2px;
  background: var(--qin-accent-dim);
}

.volume__range::-moz-range-thumb {
  width: 12px;
  height: 12px;
  border: 0;
  border-radius: 50%;
  background: rgb(var(--qin-ink-rgb));
}
</style>
