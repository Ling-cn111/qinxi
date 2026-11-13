<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import PianoKeyboard from '@/components/PianoKeyboard.vue';
import { PianoEngine, type EngineStatus } from '@/audio/PianoEngine';
import { getKeyMap, modifierFromEvent } from '@/keyboard/keyMap';
import { midiToName } from '@/audio/note';

const engine = new PianoEngine();
const keyMap = getKeyMap();

const pressed = reactive(new Set<number>());
const status = ref<EngineStatus>(engine.status);
const volume = ref(75);
const showLabels = ref(true);
const panelOpen = ref(false);
const recent = ref<string[]>([]);

/** 记录物理按键当前锁定的音高，避免 Shift 状态变化导致"松不掉" */
const heldKeys = new Map<string, number>();

let unsubscribeStatus: (() => void) | null = null;

const statusTone = computed(() => {
  if (status.value.source === 'autopiano') return 'ready';
  if (status.value.source === 'salamander') return 'fallback';
  if (status.value.source === 'synth') return 'fallback';
  return 'idle';
});

const sourceLabel = computed(() => {
  switch (status.value.source) {
    case 'autopiano':
      return 'AutoPiano 采样';
    case 'salamander':
      return '降级采样';
    case 'synth':
      return '合成音色';
    default:
      return '音频待启用';
  }
});

const loadedText = computed(() =>
  status.value.total > 0 ? `${status.value.loaded}/${status.value.total}` : '—',
);

const rangeText = computed(() => {
  const pitches = keyMap.pitches;
  if (pitches.length === 0) return '—';
  return `${midiToName(pitches[0])} – ${midiToName(pitches[pitches.length - 1])}`;
});

function pressPitch(pitch: number, velocity = 100): void {
  void engine.start();
  if (pressed.has(pitch)) return;
  pressed.add(pitch);
  engine.noteOn(pitch, velocity);
  recent.value = [midiToName(pitch), ...recent.value].slice(0, 8);
}

function releasePitch(pitch: number): void {
  if (!pressed.has(pitch)) return;
  pressed.delete(pitch);
  engine.noteOff(pitch);
}

function releaseAll(): void {
  for (const pitch of [...pressed]) releasePitch(pitch);
  heldKeys.clear();
}

function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  const tag = element.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || element.isContentEditable;
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.repeat || isTypingTarget(event.target)) return;
  const modifier = modifierFromEvent(event);
  if (!modifier) return;
  const binding = keyMap.lookup(event.code, modifier);
  if (!binding) return;

  event.preventDefault();
  const keyId = `${modifier}:${event.code}`;
  if (heldKeys.has(keyId)) return;
  heldKeys.set(keyId, binding.pitch);
  pressPitch(binding.pitch);
}

function onKeyUp(event: KeyboardEvent): void {
  const entries = [...heldKeys.entries()].filter(([keyId]) => keyId.endsWith(`:${event.code}`));
  for (const [keyId, pitch] of entries) {
    heldKeys.delete(keyId);
    releasePitch(pitch);
  }
}

function onBlur(): void {
  releaseAll();
}

function onVolumeInput(event: Event): void {
  const value = Number((event.target as HTMLInputElement).value);
  volume.value = value;
  engine.setVolume(value / 100);
}

onMounted(() => {
  unsubscribeStatus = engine.onStatus((next) => {
    status.value = { ...next };
  });
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
});

onBeforeUnmount(() => {
  unsubscribeStatus?.();
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', onKeyUp);
  window.removeEventListener('blur', onBlur);
  void engine.dispose();
});
</script>

<template>
  <div class="app">
    <header class="bar">
      <div class="bar__brand">
        <span class="bar__name">琴习</span>
        <span class="bar__latin">QINXI</span>
      </div>

      <div class="bar__right">
        <div class="source" :data-state="statusTone">
          <span class="source__dot" aria-hidden="true"></span>
          <span class="source__label">{{ sourceLabel }}</span>
          <span v-if="status.total > 0" class="source__count">{{ loadedText }}</span>
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
            <path
              d="M10.3 6.1a3.1 3.1 0 0 1 0 3.8"
              fill="none"
              stroke="currentColor"
              stroke-width="1.15"
              stroke-linecap="round"
            />
            <path
              d="M12.2 4.6a5.1 5.1 0 0 1 0 6.8"
              fill="none"
              stroke="currentColor"
              stroke-width="1.15"
              stroke-linecap="round"
            />
          </svg>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            :value="volume"
            aria-label="主音量"
            @input="onVolumeInput"
          />
        </div>
      </div>
    </header>

    <main class="stage">
      <div class="stage__head">
        <h1>自由弹奏</h1>

        <div class="stage__tools">
          <span class="meta">可弹 <b>{{ rangeText }}</b></span>
          <span class="rule" aria-hidden="true"></span>
          <label class="toggle">
            <input v-model="showLabels" type="checkbox" />
            <span>键位标注</span>
          </label>
          <span class="rule" aria-hidden="true"></span>
          <button type="button" class="flat" @click="releaseAll">全部松开</button>
        </div>
      </div>

      <PianoKeyboard
        :pressed="pressed"
        :key-map="keyMap"
        :show-labels="showLabels"
        @press="pressPitch"
        @release="releasePitch"
      />

      <div class="stage__foot">
        <div class="readout">
          <span class="readout__label">最近</span>
          <span class="readout__notes">{{ recent.length ? recent.join('  ') : '—' }}</span>
        </div>
        <p class="hint">{{ status.message }}</p>
      </div>
    </main>

    <section class="panel" :class="{ 'is-open': panelOpen }">
      <button type="button" class="panel__head" @click="panelOpen = !panelOpen">
        <svg class="panel__chev" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M2.2 3.8 5 6.6l2.8-2.8" fill="none" stroke="currentColor" stroke-width="1.1" />
        </svg>
        <span>键盘映射</span>
        <span class="panel__sub">白键四排 · 黑键 Shift</span>
      </button>

      <div v-show="panelOpen" class="panel__body">
        <div class="row">
          <span class="row__key">下排</span>
          <span class="row__val">Z X C V B N M , . /</span>
          <span class="row__note">C2 起</span>
        </div>
        <div class="row">
          <span class="row__key">中排</span>
          <span class="row__val">A S D F G H J K L ; '</span>
          <span class="row__note">F3 起</span>
        </div>
        <div class="row">
          <span class="row__key">上排</span>
          <span class="row__val">Q W E R T Y U I O P [ ]</span>
          <span class="row__note">C5 起</span>
        </div>
        <div class="row">
          <span class="row__key">数字排</span>
          <span class="row__val">1 2 3 4 5 6 7 8 9 0</span>
          <span class="row__note">A6 起</span>
        </div>
        <div class="row">
          <span class="row__key">黑键</span>
          <span class="row__val">Shift + 左侧白键（⌥ + 右侧白键同义）</span>
          <span class="row__note">如 ⇧Z = C♯2</span>
        </div>
        <p class="panel__foot">
          键位表定义在 <code>src/keyboard/keyMap.ts</code>；超出 C2–C8 的音用相邻采样移调发声。
        </p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

/* ------------------------------------------------------------------ 顶栏 */
.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 16px clamp(18px, 4vw, 46px);
  border-bottom: 1px solid rgba(231, 227, 220, 0.07);
}

.bar__brand {
  display: flex;
  align-items: baseline;
  gap: 9px;
}

.bar__name {
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.1em;
  color: #e7e3dc;
}

.bar__latin {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 9.5px;
  letter-spacing: 0.3em;
  color: rgba(231, 227, 220, 0.28);
}

.bar__right {
  display: flex;
  align-items: center;
  gap: 22px;
}

.source {
  display: flex;
  align-items: baseline;
  gap: 7px;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 10.5px;
  letter-spacing: 0.06em;
  color: rgba(231, 227, 220, 0.42);
}

.source__dot {
  width: 5px;
  height: 5px;
  background: rgba(231, 227, 220, 0.22);
  transition: background 200ms ease, box-shadow 200ms ease;
}

.source[data-state='ready'] .source__dot {
  background: #c99a52;
  box-shadow: 0 0 0 2px rgba(201, 154, 82, 0.16);
}

.source[data-state='fallback'] .source__dot {
  background: #8a6a3c;
}

.source[data-state='ready'] .source__label {
  color: rgba(231, 227, 220, 0.72);
}

.source__count {
  color: rgba(231, 227, 220, 0.26);
}

.volume {
  display: flex;
  align-items: center;
  gap: 10px;
  color: rgba(231, 227, 220, 0.5);
}

.volume__icon {
  width: 17px;
  height: 17px;
  display: block;
}

.volume input[type='range'] {
  appearance: none;
  width: 104px;
  height: 14px;
  background: transparent;
  cursor: pointer;
}

.volume input[type='range']::-webkit-slider-runnable-track {
  height: 1px;
  background: rgba(231, 227, 220, 0.3);
}

.volume input[type='range']::-webkit-slider-thumb {
  appearance: none;
  width: 9px;
  height: 9px;
  margin-top: -4px;
  border-radius: 50%;
  background: #cfa46a;
}

.volume input[type='range']::-moz-range-track {
  height: 1px;
  background: rgba(231, 227, 220, 0.22);
}

.volume input[type='range']::-moz-range-thumb {
  width: 9px;
  height: 9px;
  border: 0;
  border-radius: 50%;
  background: #cfa46a;
}

/* ------------------------------------------------------------------ 舞台 */
.stage {
  flex: 1;
  width: 100%;
  max-width: 1420px;
  margin: 0 auto;
  padding: clamp(22px, 3.4vw, 40px) clamp(18px, 4vw, 46px) 18px;
  display: flex;
  flex-direction: column;
  /* 垂直居中，避免宽屏下舞台下方留出大片死区 */
  justify-content: center;
  gap: 14px;
}

.stage__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  flex-wrap: wrap;
}

.stage__head h1 {
  margin: 0;
  font-size: 16px;
  font-weight: 500;
  letter-spacing: 0.02em;
  color: #ded9d0;
}

.stage__tools {
  display: flex;
  align-items: center;
  gap: 12px;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 10.5px;
  letter-spacing: 0.06em;
  color: rgba(231, 227, 220, 0.36);
}

.stage__tools b {
  font-weight: 400;
  color: rgba(231, 227, 220, 0.62);
}

.rule {
  width: 1px;
  height: 10px;
  background: rgba(231, 227, 220, 0.14);
}

.toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  color: rgba(231, 227, 220, 0.42);
}

.toggle input {
  appearance: none;
  width: 24px;
  height: 13px;
  border: 1px solid rgba(231, 227, 220, 0.2);
  background: rgba(231, 227, 220, 0.06);
  position: relative;
  cursor: pointer;
  transition: background 140ms ease, border-color 140ms ease;
}

.toggle input::after {
  content: '';
  position: absolute;
  top: 1px;
  left: 1px;
  width: 9px;
  height: 9px;
  background: rgba(231, 227, 220, 0.4);
  transition: transform 140ms ease, background 140ms ease;
}

.toggle input:checked {
  background: rgba(201, 154, 82, 0.16);
  border-color: rgba(201, 154, 82, 0.5);
}

.toggle input:checked::after {
  transform: translateX(11px);
  background: #cfa46a;
}

.flat {
  padding: 5px 11px;
  border: 1px solid rgba(231, 227, 220, 0.16);
  background: transparent;
  color: rgba(231, 227, 220, 0.5);
  font-family: inherit;
  font-size: 10.5px;
  letter-spacing: 0.08em;
  cursor: pointer;
  transition: color 140ms ease, border-color 140ms ease, background 140ms ease;
}

.flat:hover {
  color: #ded9d0;
  border-color: rgba(231, 227, 220, 0.32);
  background: rgba(231, 227, 220, 0.05);
}

.stage__foot {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  padding-top: 4px;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 10.5px;
  letter-spacing: 0.06em;
}

.readout {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-height: 14px;
}

.readout__label {
  color: rgba(231, 227, 220, 0.24);
}

.readout__notes {
  color: rgba(222, 217, 208, 0.62);
  letter-spacing: 0.14em;
}

.hint {
  margin: 0;
  color: rgba(231, 227, 220, 0.26);
  text-align: right;
}

/* -------------------------------------------------------------- 键位面板 */
.panel {
  border-top: 1px solid rgba(231, 227, 220, 0.07);
  background: rgba(0, 0, 0, 0.24);
}

.panel__head {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 11px clamp(18px, 4vw, 46px);
  border: 0;
  background: transparent;
  color: rgba(231, 227, 220, 0.46);
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 10.5px;
  letter-spacing: 0.1em;
  text-align: left;
  cursor: pointer;
  transition: color 140ms ease;
}

.panel__head:hover {
  color: rgba(231, 227, 220, 0.72);
}

.panel__chev {
  width: 9px;
  height: 9px;
  transition: transform 160ms ease;
}

.panel.is-open .panel__chev {
  transform: rotate(180deg);
}

.panel__sub {
  margin-left: auto;
  color: rgba(231, 227, 220, 0.2);
  letter-spacing: 0.08em;
}

.panel__body {
  padding: 0 clamp(18px, 4vw, 46px) 18px;
}

.row {
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr) 136px;
  gap: 16px;
  align-items: baseline;
  padding: 8px 0;
  border-top: 1px solid rgba(231, 227, 220, 0.06);
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11px;
}

.row__key {
  color: rgba(231, 227, 220, 0.26);
  letter-spacing: 0.14em;
}

.row__val {
  color: rgba(222, 217, 208, 0.68);
  letter-spacing: 0.12em;
  word-break: break-word;
}

.row__note {
  color: rgba(231, 227, 220, 0.32);
  text-align: right;
  letter-spacing: 0.06em;
}

.panel__foot {
  margin: 12px 0 0;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 10px;
  letter-spacing: 0.04em;
  color: rgba(231, 227, 220, 0.3);
}

.panel__foot code {
  color: rgba(231, 227, 220, 0.4);
}

@media (max-width: 720px) {
  .row {
    grid-template-columns: 52px minmax(0, 1fr);
  }

  .row__note {
    display: none;
  }

  .stage__tools .rule {
    display: none;
  }
}
</style>
