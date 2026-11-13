<script setup lang="ts">
import { computed } from 'vue';
import { INSTRUMENTS } from '@/data/instruments';

/**
 * 「声音」页：乐器列表 + 音量。
 * 乐器格子是给多音色预留的骨架，当前只有 AutoPiano 采样可用，
 * 其余条目标为待接入（点击无效），接入后只需改 `data/instruments.ts`。
 */
const instrument = defineModel<string>('instrument', { required: true });
const volume = defineModel<number>('volume', { required: true });

const availableCount = computed(() => INSTRUMENTS.filter((item) => item.available).length);
const pendingCount = computed(() => INSTRUMENTS.length - availableCount.value);
const volumeText = computed(() => (volume.value / 100).toFixed(2));
const fillStyle = computed(() => ({ '--fill': `${volume.value}%` }));
</script>

<template>
  <section class="panel">
    <div class="panel-head">
      <h3 class="panel-title"><span class="panel-title__num">1</span>乐器</h3>
      <span class="panel-count">{{ INSTRUMENTS.length }} 种 · 已接入 {{ availableCount }}</span>
    </div>

    <div class="inst-grid">
      <button
        v-for="item in INSTRUMENTS"
        :key="item.id"
        type="button"
        class="inst"
        :class="{ 'is-active': item.id === instrument, 'is-locked': !item.available }"
        :disabled="!item.available"
        :aria-pressed="item.id === instrument"
        @click="instrument = item.id"
      >
        <span class="inst__text">
          <span class="inst__name">{{ item.name }}</span>
          <span class="inst__latin">{{ item.latin }}</span>
        </span>
        <span v-if="item.badge" class="inst__badge">{{ item.badge }}</span>
      </button>
    </div>

    <p class="panel-desc">
      另外 {{ pendingCount }} 种音色为后续扩展预留，接入采样后即可在这里切换。
    </p>

    <div class="panel-head panel-head--gap">
      <h3 class="panel-title"><span class="panel-title__num">2</span>音量</h3>
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
  </section>
</template>

<style scoped>
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.panel-head--gap {
  margin-top: 26px;
}

.panel-count {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11px;
  letter-spacing: 0.06em;
  color: rgba(231, 227, 220, 0.34);
}

.inst-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(196px, 1fr));
  gap: 10px;
}

.inst {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 54px;
  padding: 9px 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 2px;
  background: #202020;
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 120ms ease,
    background 120ms ease,
    color 120ms ease;
}

.inst:hover:not(:disabled) {
  border-color: rgba(207, 164, 106, 0.42);
  background: #242424;
}

.inst.is-active {
  border-color: rgba(207, 164, 106, 0.62);
  background: #241b12;
  box-shadow: inset 3px 0 0 #cfa46a;
}

.inst.is-locked {
  cursor: not-allowed;
  background: #1c1c1c;
}

.inst__text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.inst__name {
  font-size: 13px;
  line-height: 1.1;
  color: rgba(231, 227, 220, 0.88);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.inst__latin {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 10px;
  line-height: 1.1;
  letter-spacing: 0.02em;
  color: rgba(231, 227, 220, 0.3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.inst.is-locked .inst__name {
  color: rgba(231, 227, 220, 0.46);
}

.inst.is-active .inst__name {
  color: #e5c79a;
}

.inst__badge {
  flex: 0 0 auto;
  padding: 2px 5px;
  border: 1px solid rgba(207, 164, 106, 0.4);
  border-radius: 2px;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 9px;
  letter-spacing: 0.06em;
  color: #cfa46a;
}

/* ------------------------------------------------------------------ 音量 */
.volume {
  display: flex;
  align-items: center;
  gap: 14px;
  max-width: 520px;
  color: rgba(231, 227, 220, 0.5);
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
  color: rgba(231, 227, 220, 0.42);
}

.volume__value {
  flex: 0 0 auto;
  width: 34px;
  text-align: right;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11.5px;
  letter-spacing: 0.04em;
  color: rgba(231, 227, 220, 0.42);
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
    #b98d55 0,
    #b98d55 var(--fill),
    rgba(255, 255, 255, 0.14) var(--fill),
    rgba(255, 255, 255, 0.14) 100%
  );
}

.volume__range::-webkit-slider-thumb {
  appearance: none;
  width: 12px;
  height: 12px;
  margin-top: -4.5px;
  border-radius: 50%;
  background: #e7e3dc;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
}

.volume__range::-moz-range-track {
  height: 3px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.14);
}

.volume__range::-moz-range-progress {
  height: 3px;
  border-radius: 2px;
  background: #b98d55;
}

.volume__range::-moz-range-thumb {
  width: 12px;
  height: 12px;
  border: 0;
  border-radius: 50%;
  background: #e7e3dc;
}
</style>
