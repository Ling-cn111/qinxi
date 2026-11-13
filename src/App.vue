<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue';
import PianoKeyboard from '@/components/PianoKeyboard.vue';
import ControlDeck from '@/components/ControlDeck.vue';
import NoteVisualizer from '@/components/NoteVisualizer.vue';
import { PianoEngine, type EngineStatus } from '@/audio/PianoEngine';
import {
  isBindableCode,
  modifierFromEvent,
  PianoKeyMap,
  resolveBinding,
  type CustomBinding,
  type KeymapPresetId,
} from '@/keyboard/keyMap';
import {
  clearCustomBindings,
  loadCustomBindings,
  loadKeymapPreset,
  saveCustomBindings,
  saveKeymapPreset,
} from '@/keyboard/customKeymap';
import { midiToName } from '@/audio/note';
import type { NoteLabelMode } from '@/keyboard/labels';
import { DEFAULT_INSTRUMENT_ID } from '@/data/instruments';
import { DEFAULT_VIEWPORT_ID, PIANO_VIEWPORTS, type PianoViewport } from '@/keyboard/layout';
import type { DeckTab } from '@/types';

const engine = new PianoEngine();

const customBindings = ref<CustomBinding[]>(loadCustomBindings());
const keymapPreset = ref<KeymapPresetId>(loadKeymapPreset());

function createKeyMap(): PianoKeyMap {
  return new PianoKeyMap({ preset: keymapPreset.value, custom: customBindings.value });
}

const keyMap = shallowRef(createKeyMap());

const pressed = reactive(new Set<number>());
const status = ref<EngineStatus>(engine.status);
const volume = ref(100);
const viewportId = ref<PianoViewport['id']>(DEFAULT_VIEWPORT_ID);
const recent = ref<string[]>([]);
const visualizer = ref<InstanceType<typeof NoteVisualizer> | null>(null);

// 控制台状态
const deckTab = ref<DeckTab>('display');
const showHints = ref(true);
const showNoteNames = ref(true);
const showSolfege = ref(false);
const instrument = ref(DEFAULT_INSTRUMENT_ID);
const diagramMode = ref<'char' | 'note'>('note');

// 自定义键位
const editMode = ref(false);
const editPitch = ref<number | null>(null);
const lastAction = ref('');
let lastActionTimer: number | undefined;

const noteMode = computed<NoteLabelMode>(() => {
  if (showSolfege.value) return 'solfege';
  if (showNoteNames.value) return 'note';
  return 'none';
});

const customCount = computed(() => keyMap.value.customCount);

/** 记录物理按键当前锁定的音高，避免 Shift 状态变化导致"松不掉" */
const heldKeys = new Map<string, number>();

let unsubscribeStatus: (() => void) | null = null;

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
  status.value.total > 0 ? `${status.value.loaded}/${status.value.total}` : '',
);

const currentViewport = computed(
  () => PIANO_VIEWPORTS.find((item) => item.id === viewportId.value) ?? PIANO_VIEWPORTS[1],
);

function flash(message: string): void {
  lastAction.value = message;
  window.clearTimeout(lastActionTimer);
  lastActionTimer = window.setTimeout(() => {
    lastAction.value = '';
  }, 4000);
}

function applyCustomBindings(next: CustomBinding[]): void {
  customBindings.value = next;
  saveCustomBindings(next);
  keyMap.value = createKeyMap();
}

function startEdit(): void {
  editMode.value = true;
  editPitch.value = null;
  lastAction.value = '';
}

function exitEdit(): void {
  editMode.value = false;
  editPitch.value = null;
}

function toggleEdit(): void {
  if (editMode.value) exitEdit();
  else startEdit();
}

/** 把当前选中的音绑到某个物理键上：同一个键、同一个音都只保留一条 */
function bindSelected(code: string, modifier: 'none' | 'shift' | 'alt'): void {
  const pitch = editPitch.value;
  if (pitch === null) return;
  const next = customBindings.value.filter(
    (item) => !(item.code === code && item.modifier === modifier) && item.pitch !== pitch,
  );
  next.push({ code, modifier, pitch });
  applyCustomBindings(next);
  flash(`已把 ${midiToName(pitch)} 绑到 ${keyMap.value.labelFor(pitch) ?? code}`);
  editPitch.value = null;
}

/** 取消该音的自定义，回到默认键位 */
function restoreSelected(): void {
  const pitch = editPitch.value;
  if (pitch === null) return;
  const next = customBindings.value.filter((item) => item.pitch !== pitch);
  if (next.length === customBindings.value.length) {
    flash(`${midiToName(pitch)} 本来就是默认键位`);
    return;
  }
  applyCustomBindings(next);
  flash(`${midiToName(pitch)} 已恢复默认键位`);
}

function resetBindings(): void {
  clearCustomBindings();
  applyCustomBindings([]);
  editPitch.value = null;
  flash('已恢复全部默认键位');
}

function pressPitch(pitch: number, velocity = 100): void {
  void engine.start();
  if (editMode.value) editPitch.value = pitch;
  if (pressed.has(pitch)) return;
  pressed.add(pitch);
  engine.noteOn(pitch, velocity);
  visualizer.value?.trigger(pitch, velocity);
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

  // 自定义键位：按键用于「绑定」而不是「演奏」
  if (editMode.value) {
    if (event.code === 'Escape') {
      event.preventDefault();
      exitEdit();
      return;
    }
    if (editPitch.value === null) return;
    event.preventDefault();
    if (event.code === 'Backspace' || event.code === 'Delete') {
      restoreSelected();
      return;
    }
    if (!isBindableCode(event.code)) return;
    const modifier = modifierFromEvent(event);
    if (!modifier) return;
    bindSelected(event.code, modifier);
    return;
  }

  const modifier = modifierFromEvent(event);
  if (!modifier) return;
  const binding = resolveBinding(keyMap.value, event.code, modifier);
  if (!binding) return;

  event.preventDefault();
  const keyId = `${binding.modifier}:${event.code}`;
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

watch(volume, (value) => {
  engine.setVolume(Math.min(1, Math.max(0, value / 100)));
});

// 换方案要重建映射表；自定义绑定原样保留
watch(keymapPreset, (next) => {
  saveKeymapPreset(next);
  keyMap.value = createKeyMap();
  editPitch.value = null;
});

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
  window.clearTimeout(lastActionTimer);
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
        <span class="brand__name">琴习</span>
        <span class="brand__latin">QINXI</span>
      </div>

      <div class="topbar__right">
        <span class="source">{{ sourceLabel }}<template v-if="loadedText"> {{ loadedText }}</template></span>

        <label class="volume">
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
          </svg>
          <input v-model.number="volume" type="range" min="0" max="100" step="1" aria-label="主音量" />
        </label>
      </div>
    </header>

    <main class="stage">
      <div class="controls">
        <div class="ranges" role="group" aria-label="音域视口">
          <button
            v-for="item in PIANO_VIEWPORTS"
            :key="item.id"
            type="button"
            class="range"
            :class="{ 'is-active': item.id === viewportId }"
            @click="viewportId = item.id"
          >
            {{ item.label }}<span>{{ item.span }}</span>
          </button>
        </div>

        <div class="tools">
          <button type="button" class="text-btn" @click="releaseAll">全部松开</button>
        </div>
      </div>

      <NoteVisualizer ref="visualizer" />

      <PianoKeyboard
        :pressed="pressed"
        :key-map="keyMap"
        :show-hints="showHints"
        :note-mode="noteMode"
        :viewport="viewportId"
        :edit-mode="editMode"
        :edit-pitch="editPitch"
        @press="pressPitch"
        @release="releasePitch"
      />

      <ControlDeck
        v-model:tab="deckTab"
        v-model:show-hints="showHints"
        v-model:note-names="showNoteNames"
        v-model:solfege="showSolfege"
        v-model:instrument="instrument"
        v-model:volume="volume"
        v-model:diagram-mode="diagramMode"
        v-model:edit-mode="editMode"
        v-model:preset="keymapPreset"
        :key-map="keyMap"
        :pressed="pressed"
        :edit-pitch="editPitch"
        :custom-count="customCount"
        :last-action="lastAction"
        @toggle-edit="toggleEdit"
        @restore="restoreSelected"
        @reset="resetBindings"
      />

      <div class="foot">
        <span class="foot__item">最近音符 <b>{{ recent.length ? recent.join(' ') : '—' }}</b></span>
        <span class="foot__item">视口 <b>{{ currentViewport.label }} {{ currentViewport.span }}</b></span>
        <span class="foot__item foot__item--state">{{ status.message }}</span>
      </div>
    </main>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

/* ------------------------------------------------------------------ 顶栏 */
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 14px 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
}

.brand {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.brand__name {
  font-size: 14px;
  letter-spacing: 0.12em;
  color: #e6e2da;
}

.brand__latin {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 9.5px;
  letter-spacing: 0.3em;
  color: rgba(255, 255, 255, 0.26);
}

.topbar__right {
  display: flex;
  align-items: center;
  gap: 20px;
}

.source {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 10.5px;
  letter-spacing: 0.06em;
  color: rgba(255, 255, 255, 0.42);
}

.volume {
  display: flex;
  align-items: center;
  gap: 9px;
  color: rgba(255, 255, 255, 0.45);
}

.volume__icon {
  width: 16px;
  height: 16px;
  display: block;
}

.volume input[type='range'] {
  appearance: none;
  width: 100px;
  height: 14px;
  background: transparent;
  cursor: pointer;
}

.volume input[type='range']::-webkit-slider-runnable-track {
  height: 1px;
  background: rgba(255, 255, 255, 0.3);
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
  background: rgba(255, 255, 255, 0.3);
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
  display: flex;
  flex-direction: column;
  /* AutoPiano 的钢琴是 margin:20px auto 贴着内容流排的，不做垂直居中 */
  padding-top: 10px;
  padding-bottom: 28px;
}

/* 控制栏：深色底 + 细分割线 + 纯文本，宽度与钢琴一致 */
.controls {
  width: 90%;
  margin: 4px auto 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.ranges {
  display: flex;
}

.range {
  padding: 9px 14px 8px;
  border: 0;
  border-bottom: 1px solid transparent;
  background: transparent;
  color: rgba(255, 255, 255, 0.42);
  font-family: inherit;
  font-size: 12px;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition: color 120ms ease, border-color 120ms ease;
}

.range:hover {
  color: rgba(255, 255, 255, 0.72);
}

.range.is-active {
  color: #fff;
  border-bottom-color: #cfa46a;
}

.range span {
  margin-left: 6px;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 9.5px;
  color: rgba(255, 255, 255, 0.26);
}

.tools {
  display: flex;
  align-items: center;
  gap: 16px;
}

.text-btn {
  padding: 0;
  border: 0;
  background: transparent;
  color: rgba(255, 255, 255, 0.42);
  font-family: inherit;
  font-size: 12px;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition: color 120ms ease;
}

.text-btn:hover {
  color: rgba(255, 255, 255, 0.8);
}

/* 控制台下方的纯文本行 */
.foot {
  width: 90%;
  margin: 14px auto 0;
  display: flex;
  align-items: baseline;
  gap: 24px;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 10.5px;
  letter-spacing: 0.05em;
  color: rgba(255, 255, 255, 0.28);
}

.foot__item b {
  font-weight: 400;
  color: rgba(255, 255, 255, 0.6);
  letter-spacing: 0.1em;
}

.foot__item--state {
  margin-left: auto;
  color: rgba(255, 255, 255, 0.22);
}

@media (max-width: 820px) {
  .controls,
  .foot {
    width: 92%;
  }

  .range span,
  .foot__item:nth-child(2) {
    display: none;
  }
}
</style>
