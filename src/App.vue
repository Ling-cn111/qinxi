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
const recent = ref<string[]>([]);

/** 记录物理按键当前锁定的音高，避免 Shift 状态变化导致"松不掉" */
const heldKeys = new Map<string, number>();

let unsubscribeStatus: (() => void) | null = null;

const statusTone = computed(() => {
  if (status.value.source === 'autopiano') return 'ok';
  if (status.value.source === 'salamander' || status.value.source === 'synth') return 'warn';
  return 'idle';
});

const statusLabel = computed(() => {
  switch (status.value.source) {
    case 'autopiano':
      return 'AutoPiano 钢琴采样';
    case 'salamander':
      return '降级采样（加染色）';
    case 'synth':
      return '内置合成音色';
    default:
      return '音频待启用';
  }
});

const loadedText = computed(() =>
  status.value.total > 0 ? `${status.value.loaded}/${status.value.total}` : '',
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
  recent.value = [midiToName(pitch), ...recent.value].slice(0, 12);
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
    <header class="topbar">
      <div class="brand">
        <span class="brand__mark">琴</span>
        <div class="brand__text">
          <strong>琴习</strong>
          <em>QinXi</em>
        </div>
      </div>

      <div class="topbar__right">
        <div class="status" :data-tone="statusTone">
          <span class="status__dot"></span>
          <span class="status__label">{{ statusLabel }}</span>
          <span v-if="loadedText" class="status__count">{{ loadedText }}</span>
        </div>

        <label class="volume">
          <span>音量</span>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            :value="volume"
            aria-label="主音量"
            @input="onVolumeInput"
          />
        </label>
      </div>
    </header>

    <main class="main">
      <section class="stage">
        <div class="stage__head">
          <div>
            <h1>自由弹奏</h1>
            <p class="stage__desc">
              88 键钢琴，支持电脑键盘与鼠标 / 触屏。第一次按键即可启用音频引擎。
            </p>
          </div>
          <div class="stage__meta">
            <span class="chip">可弹音域 <b>{{ rangeText }}</b></span>
            <label class="switch">
              <input v-model="showLabels" type="checkbox" />
              <span>显示键位</span>
            </label>
            <button type="button" class="ghost" @click="releaseAll">全部松开</button>
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
          <div class="recent">
            <span class="recent__title">最近音符</span>
            <div class="recent__list">
              <span v-for="(note, index) in recent" :key="`${note}-${index}`" class="note-chip">
                {{ note }}
              </span>
              <span v-if="recent.length === 0" class="recent__empty">按下琴键开始</span>
            </div>
          </div>
          <p class="status-text">{{ status.message }}</p>
        </div>
      </section>

      <section class="legend">
        <h2>键盘映射</h2>
        <ul>
          <li><b>白键</b>四排由低到高：<code>Z X C V B N M , . /</code> → <code>A S D F G H J K L ; '</code> → <code>Q W E R T Y U I O P [ ]</code> → <code>1 2 3 4 5 6 7 8 9 0</code>（C2–C8）</li>
          <li><b>黑键</b>用 <code>Shift</code> + 左侧白键（如 <code>Shift+Z</code> = C♯2），也接受 <code>Alt</code> + 右侧白键作为同义写法。</li>
          <li>键位表定义在 <code>src/keyboard/keyMap.ts</code>，可自行调整。</li>
        </ul>
      </section>
    </main>
  </div>
</template>

<style scoped>
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.topbar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px clamp(16px, 4vw, 44px);
  background: rgba(250, 248, 243, 0.82);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(43, 29, 25, 0.08);
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand__mark {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 11px;
  background: linear-gradient(160deg, #43302a, #241a17);
  color: #f3e3c3;
  font-family: 'Songti SC', 'Noto Serif SC', serif;
  font-size: 20px;
  box-shadow: 0 4px 12px rgba(43, 29, 25, 0.25);
}

.brand__text {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.brand__text strong {
  font-size: 18px;
  letter-spacing: 0.08em;
  color: #2b1d19;
}

.brand__text em {
  font-style: normal;
  font-size: 12px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: rgba(43, 29, 25, 0.45);
}

.topbar__right {
  display: flex;
  align-items: center;
  gap: 18px;
}

.status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 12px;
  color: rgba(43, 29, 25, 0.72);
  background: rgba(43, 29, 25, 0.05);
  border: 1px solid rgba(43, 29, 25, 0.08);
}

.status__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #b8afa2;
}

.status[data-tone='ok'] .status__dot {
  background: #2f8f6b;
  box-shadow: 0 0 0 3px rgba(47, 143, 107, 0.16);
}

.status[data-tone='warn'] .status__dot {
  background: #c08a3e;
  box-shadow: 0 0 0 3px rgba(192, 138, 62, 0.16);
}

.status__count {
  font-variant-numeric: tabular-nums;
  color: rgba(43, 29, 25, 0.42);
}

.volume {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: rgba(43, 29, 25, 0.55);
}

.volume input {
  width: 110px;
  accent-color: #8a5a2b;
}

.main {
  width: 100%;
  max-width: 1360px;
  margin: 0 auto;
  padding: clamp(20px, 3vw, 36px) clamp(16px, 4vw, 44px) 56px;
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.stage {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.stage__head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
}

.stage__head h1 {
  margin: 0 0 6px;
  font-size: clamp(22px, 2.4vw, 28px);
  letter-spacing: 0.02em;
  color: #241a17;
}

.stage__desc {
  margin: 0;
  font-size: 13.5px;
  color: rgba(43, 29, 25, 0.55);
}

.stage__meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.chip {
  padding: 6px 11px;
  border-radius: 999px;
  font-size: 12px;
  color: rgba(43, 29, 25, 0.66);
  background: #fffdf8;
  border: 1px solid rgba(43, 29, 25, 0.1);
}

.chip b {
  color: #8a5a2b;
  font-variant-numeric: tabular-nums;
}

.switch {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 6px 11px;
  border-radius: 999px;
  font-size: 12px;
  color: rgba(43, 29, 25, 0.66);
  background: #fffdf8;
  border: 1px solid rgba(43, 29, 25, 0.1);
  cursor: pointer;
}

.switch input {
  accent-color: #8a5a2b;
}

.ghost {
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 12px;
  color: rgba(43, 29, 25, 0.66);
  background: transparent;
  border: 1px solid rgba(43, 29, 25, 0.16);
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
}

.ghost:hover {
  background: rgba(43, 29, 25, 0.06);
  color: #2b1d19;
}

.stage__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.recent {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 26px;
}

.recent__title {
  font-size: 11px;
  letter-spacing: 0.16em;
  color: rgba(43, 29, 25, 0.35);
  text-transform: uppercase;
}

.recent__list {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.note-chip {
  padding: 3px 9px;
  border-radius: 7px;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
  color: #6b4423;
  background: rgba(192, 138, 62, 0.14);
}

.recent__empty {
  font-size: 12px;
  color: rgba(43, 29, 25, 0.3);
}

.status-text {
  margin: 0;
  font-size: 12px;
  color: rgba(43, 29, 25, 0.4);
}

.legend {
  padding: 20px 22px;
  border-radius: 14px;
  background: rgba(255, 253, 248, 0.7);
  border: 1px solid rgba(43, 29, 25, 0.08);
}

.legend h2 {
  margin: 0 0 10px;
  font-size: 13px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(43, 29, 25, 0.45);
}

.legend ul {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 7px;
  font-size: 13px;
  line-height: 1.7;
  color: rgba(43, 29, 25, 0.62);
}

.legend code {
  padding: 1px 6px;
  border-radius: 5px;
  background: rgba(43, 29, 25, 0.06);
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
}
</style>
