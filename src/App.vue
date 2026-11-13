<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue';
import PianoKeyboard from '@/components/PianoKeyboard.vue';
import ControlDeck from '@/components/ControlDeck.vue';
import NoteVisualizer from '@/components/NoteVisualizer.vue';
import ThemeMenu from '@/components/ThemeMenu.vue';
import UiToggle from '@/components/UiToggle.vue';
import { PianoEngine, type EngineStatus } from '@/audio/PianoEngine';
import {
  BASE_START_MIDI,
  isBindableCode,
  modifierFromEvent,
  PianoKeyMap,
  resolveBinding,
  type CustomBinding,
} from '@/keyboard/keyMap';
import {
  clearCustomBindings,
  loadCustomBindings,
  saveCustomBindings,
} from '@/keyboard/customKeymap';
import {
  bindingsSignature,
  loadKeymapSchemes,
  MAX_SCHEME_NAME,
  newSchemeId,
  saveKeymapSchemes,
  type KeymapScheme,
} from '@/keyboard/keymapSchemes';
import { midiToName } from '@/audio/note';
import { BUILT_IN_SCORES, DEFAULT_SCORE_ID, findScore, loadScore } from '@/data/scores';
import { activeNotesAt, samePitchSet } from '@/transport/activeNotes';
import { Transport, type TransportSnapshot } from '@/transport/transport';
import type { NoteEvent } from '@/types';
import type { NoteLabelMode } from '@/keyboard/labels';
import { DEFAULT_VIEWPORT_ID, PIANO_VIEWPORTS, type PianoViewport } from '@/keyboard/layout';
import type { DeckTab } from '@/types';

const engine = new PianoEngine();

const customBindings = ref<CustomBinding[]>(loadCustomBindings());
const schemes = ref<KeymapScheme[]>(loadKeymapSchemes());

const viewportId = ref<PianoViewport['id']>(DEFAULT_VIEWPORT_ID);
/**
 * 键位跟随音区：开的时候，切换视口会把整组键位跟着挪一个八度，
 * 让同一套按键弹到当前看得见的那段琴键上（关着时键位固定在 C2–C7）。
 */
const followViewport = ref(false);

/** 映射起点：跟随模式对齐视口最左侧的音（C1 / C2 / C3），否则固定在 C2 */
function keymapStartMidi(): number {
  if (!followViewport.value) return BASE_START_MIDI;
  const target = PIANO_VIEWPORTS.find((item) => item.id === viewportId.value);
  return target?.startPitch ?? BASE_START_MIDI;
}

/**
 * 编辑时点到的音高是琴键上的绝对值，落盘要换回默认布局（C2 起）的坐标 ——
 * 这样自定义键位会跟着音区一起平移，而不是留在一个绝对音高上。
 */
function toBasePitch(pitch: number): number {
  return pitch - (keymapStartMidi() - BASE_START_MIDI);
}

function createKeyMap(): PianoKeyMap {
  return new PianoKeyMap({ startMidi: keymapStartMidi(), custom: customBindings.value });
}

const keyMap = shallowRef(createKeyMap());

/**
 * 当前键位对应哪个方案：把改动列表拼成签名，和每个方案比一次。
 * 这样无论从哪条路径改键位（绑定 / 空置 / 恢复），标签高亮都自动正确，
 * 也不需要额外存「上次应用了哪个方案」。
 */
const activeSchemeId = computed<string | null>(() => {
  const current = bindingsSignature(customBindings.value);
  const hit = schemes.value.find((item) => bindingsSignature(item.bindings) === current);
  if (hit) return hit.id;
  return current === '' ? 'default' : null;
});

const pressed = reactive(new Set<number>());
const status = ref<EngineStatus>(engine.status);
const volume = ref(100);
const recent = ref<string[]>([]);
const visualizer = ref<InstanceType<typeof NoteVisualizer> | null>(null);

// 控制台状态
const deckTab = ref<DeckTab>('display');
const showHints = ref(true);
const showNoteNames = ref(true);
const showSolfege = ref(false);
const diagramMode = ref<'char' | 'note'>('note');

// 自定义键位
const editMode = ref(false);

// ---------------------------------------------------------------- 自动播放
/** 选中的内置曲谱 */
const scoreId = ref<string>(DEFAULT_SCORE_ID);
/** idle = 没在播；playing / paused 对应 Transport 的状态 */
const playState = ref<'idle' | 'playing' | 'paused'>('idle');
/** 自动播放正在响的音（琴键高亮的数据源，渲染循环里更新） */
const autoPressed = ref<ReadonlySet<number>>(new Set());
const playProgressText = ref('');
/** 谱面按「默认布局（C2 起）+ 用户自定义」解释，不跟随音区视口 —— 换音区不能让曲子变调 */
const baseKeyMap = computed(() => new PianoKeyMap({ custom: customBindings.value }));
let currentNotes: NoteEvent[] = [];
let renderRafId = 0;

/**
 * 播放时间轴：时钟只有一个（engine.now() = AudioContext.currentTime）。
 * onNote 只管把音按绝对时刻交给引擎发声；琴键高亮不在 onNote 里做 ——
 * 那时离发声还有约 100ms，会提前亮。高亮由渲染循环按 Transport 的拍位推。
 */
const transport = new Transport({
  now: () => engine.now(),
  bpm: 96,
  callbacks: {
    onNote: (item) => engine.playNote(item.pitch, item.when, item.duration, item.velocity),
    onCancelAll: () => engine.stopAll(),
    onTick: (snapshot) => updateProgress(snapshot),
    onEnd: () => onPlaybackEnd(),
  },
});

function updateProgress(snapshot: TransportSnapshot): void {
  playProgressText.value = `${snapshot.beat.toFixed(1)} / ${snapshot.totalBeats.toFixed(1)} 拍`;
}

/** 渲染循环：每帧从拍位推出「此刻该亮的键」，集合没变就不动 DOM（CSS 类切换交给 PianoKeyboard） */
function renderAutoplayKeys(): void {
  // rawBeat 不做钳制：留白期是负数，此时不该有任何音亮着
  const beat = transport.rawBeat;
  const active = activeNotesAt(currentNotes, beat);
  const next = new Set(active.map((note) => note.pitch));
  const previous = autoPressed.value;
  if (!samePitchSet(next, previous)) {
    autoPressed.value = next;
    for (const note of active) {
      if (!previous.has(note.pitch)) visualizer.value?.trigger(note.pitch, 100);
    }
  }
  renderRafId = playState.value === 'playing' ? requestAnimationFrame(renderAutoplayKeys) : 0;
}

function startRenderLoop(): void {
  if (renderRafId) cancelAnimationFrame(renderRafId);
  renderRafId = requestAnimationFrame(renderAutoplayKeys);
}

function stopRenderLoop(): void {
  if (renderRafId) cancelAnimationFrame(renderRafId);
  renderRafId = 0;
}

function startPlayback(): void {
  const score = findScore(scoreId.value);
  if (!score) return;
  if (editMode.value) exitEdit();
  // 用户手势里启动音频上下文；AudioContext 在 start() 里同步创建，engine.now() 随即可用
  void engine.start();
  const parsed = loadScore(score, baseKeyMap.value);
  if (parsed.warnings.length > 0) {
    console.warn('[琴习] 谱面解析有警告：', parsed.warnings);
  }
  currentNotes = parsed.notes;
  transport.load(parsed.notes, { bpm: score.bpm });
  transport.play();
  playState.value = 'playing';
  startRenderLoop();
}

function togglePlay(): void {
  if (playState.value === 'playing') {
    transport.pause();
    playState.value = 'paused';
    stopRenderLoop();
    autoPressed.value = new Set();
    return;
  }
  if (playState.value === 'paused') {
    transport.play();
    playState.value = 'playing';
    startRenderLoop();
    return;
  }
  startPlayback();
}

function stopPlayback(): void {
  transport.stop();
  playState.value = 'idle';
  stopRenderLoop();
  autoPressed.value = new Set();
  updateProgress(transport.snapshot);
}

function onPlaybackEnd(): void {
  playState.value = 'idle';
  stopRenderLoop();
  autoPressed.value = new Set();
  updateProgress({ ...transport.snapshot, beat: 0 });
}

// 换曲目：正在播/暂停中都先停，避免「暂停在 A 曲第 3 拍、切到 B 曲接着放」的怪状态
watch(scoreId, () => {
  if (playState.value !== 'idle') stopPlayback();
});

// 进自定义键位编辑时，自动播放让位（两套高亮叠在一起没法看）
watch(editMode, (on) => {
  if (on && playState.value !== 'idle') stopPlayback();
});

/** 用户按的键 + 自动播放的键，合并给琴键做高亮 */
const combinedPressed = computed<ReadonlySet<number>>(() => {
  if (autoPressed.value.size === 0) return pressed;
  const merged = new Set(pressed);
  for (const pitch of autoPressed.value) merged.add(pitch);
  return merged;
});

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
  const base = toBasePitch(pitch);
  const next = customBindings.value.filter(
    (item) => !(item.code === code && item.modifier === modifier) && item.pitch !== base,
  );
  next.push({ code, modifier, pitch: base });
  applyCustomBindings(next);
  flash(`已把 ${midiToName(pitch)} 绑到 ${keyMap.value.labelFor(pitch) ?? code}`);
  editPitch.value = null;
}

/** 取消该音的自定义，回到默认键位 */
function restoreSelected(): void {
  const pitch = editPitch.value;
  if (pitch === null) return;
  const base = toBasePitch(pitch);
  const next = customBindings.value.filter((item) => item.pitch !== base);
  if (next.length === customBindings.value.length) {
    flash(`${midiToName(pitch)} 本来就是默认键位`);
    return;
  }
  applyCustomBindings(next);
  flash(`${midiToName(pitch)} 已恢复默认键位`);
}

/**
 * 空置：这个音不绑任何键。
 *
 * 默认布局里它本来有键，所以要写一条「空置」记录压住默认绑定；
 * 这条记录同样要落盘，否则刷新之后键位又回来了。
 */
function clearSelected(): void {
  const pitch = editPitch.value;
  if (pitch === null) return;
  if (keyMap.value.clearedPitches.has(pitch) && keyMap.value.bindingsForPitch(pitch).length === 0) {
    flash(`${midiToName(pitch)} 已经是空置状态`);
    return;
  }
  const base = toBasePitch(pitch);
  const next = customBindings.value.filter((item) => item.pitch !== base);
  next.push({ code: null, modifier: 'none', pitch: base });
  applyCustomBindings(next);
  flash(`${midiToName(pitch)} 已空置，不绑定任何键`);
  editPitch.value = null;
}

function resetBindings(): void {
  clearCustomBindings();
  applyCustomBindings([]);
  editPitch.value = null;
  flash('已恢复全部默认键位，空置的音也一并恢复');
}

/** 应用方案：`default` 是内置的 C 大调，其余是保存过的快照 */
function applyScheme(id: string): void {
  if (id === 'default') {
    if (customBindings.value.length === 0) {
      flash('当前就是「C大调」默认键位');
      return;
    }
    applyCustomBindings([]);
    editPitch.value = null;
    flash('已切回「C大调」默认键位');
    return;
  }
  const scheme = schemes.value.find((item) => item.id === id);
  if (!scheme) return;
  applyCustomBindings(scheme.bindings.map((item) => ({ ...item })));
  editPitch.value = null;
  flash(`已应用方案「${scheme.name}」`);
}

/** 把当前键位存成一个具名方案（只存与默认布局不同的条目） */
function saveScheme(rawName: string): void {
  // 内容没变化就不新增：默认布局、或与某个已存方案完全一致
  const signature = bindingsSignature(customBindings.value);
  if (signature === '') {
    flash('当前就是「C大调」默认键位，未新增');
    return;
  }
  const same = schemes.value.find((item) => bindingsSignature(item.bindings) === signature);
  if (same) {
    flash(`与「${same.name}」内容相同，未新增`);
    return;
  }

  const name = rawName.trim().slice(0, MAX_SCHEME_NAME);
  if (!name) {
    flash('方案名不能为空');
    return;
  }
  if (schemes.value.some((item) => item.name === name)) {
    flash(`已有同名方案「${name}」，换个名字`);
    return;
  }
  const scheme: KeymapScheme = {
    id: newSchemeId(),
    name,
    bindings: customBindings.value.map((item) => ({ ...item })),
    createdAt: Date.now(),
  };
  schemes.value = [...schemes.value, scheme];
  saveKeymapSchemes(schemes.value);
  flash(`已保存方案「${name}」`);
}

function deleteScheme(id: string): void {
  const scheme = schemes.value.find((item) => item.id === id);
  if (!scheme) return;
  schemes.value = schemes.value.filter((item) => item.id !== id);
  saveKeymapSchemes(schemes.value);
  flash(`已删除方案「${scheme.name}」，当前键位不变`);
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
    if (event.code === 'Backspace') {
      restoreSelected();
      return;
    }
    // Delete = 空置：这个音不绑任何键
    if (event.code === 'Delete') {
      clearSelected();
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

/**
 * 换视口、或开关「键位跟随音区」时重建映射：
 * 起点没变（比如跟随关着，换视口只是滚动）就什么都不做，别打断按住的音；
 * 真要平移八度时先松开所有音，否则旧映射下按下的音在 keyup 时对不上。
 */
watch([viewportId, followViewport], () => {
  if (keymapStartMidi() === keyMap.value.baseStartMidi) return;
  releaseAll();
  editPitch.value = null;
  keyMap.value = createKeyMap();
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
  transport.dispose();
  stopRenderLoop();
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

        <!-- 最右侧：外观主题下拉菜单（只换背景与外壳，琴体不变） -->
        <ThemeMenu />
      </div>
    </header>

    <main class="stage">
      <div class="controls">
        <div class="controls__left">
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

          <div
            class="follow"
            title="开启后切换音区时，整组键位跟着移动一个八度，同样的按键始终弹当前可见的琴键"
          >
            <UiToggle v-model="followViewport" label="键位跟随音区" />
          </div>
        </div>

        <div class="tools">
          <div class="player" role="group" aria-label="自动播放">
            <select v-model="scoreId" class="player__select" aria-label="选择曲谱" :disabled="playState !== 'idle'">
              <option v-for="item in BUILT_IN_SCORES" :key="item.id" :value="item.id">{{ item.title }}</option>
            </select>
            <button type="button" class="text-btn player__play" @click="togglePlay">
              <svg class="player__icon" viewBox="0 0 10 10" aria-hidden="true">
                <template v-if="playState === 'playing'">
                  <rect x="1.6" y="1.6" width="2.4" height="6.8" fill="currentColor" />
                  <rect x="6" y="1.6" width="2.4" height="6.8" fill="currentColor" />
                </template>
                <template v-else>
                  <path d="M2.4 1.3 8.4 5 2.4 8.7z" fill="currentColor" />
                </template>
              </svg>
              {{ playState === 'playing' ? '暂停' : playState === 'paused' ? '继续' : '播放' }}
            </button>
            <button type="button" class="text-btn" :disabled="playState === 'idle'" @click="stopPlayback">停止</button>
            <span class="player__beat">{{ playProgressText }}</span>
          </div>
          <button type="button" class="text-btn" @click="releaseAll">全部松开</button>
        </div>
      </div>

      <NoteVisualizer ref="visualizer" />

      <PianoKeyboard
        :pressed="combinedPressed"
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
        v-model:volume="volume"
        v-model:diagram-mode="diagramMode"
        v-model:edit-mode="editMode"
        :key-map="keyMap"
        :pressed="pressed"
        :edit-pitch="editPitch"
        :custom-count="customCount"
        :last-action="lastAction"
        :schemes="schemes"
        :active-scheme-id="activeSchemeId"
        @toggle-edit="toggleEdit"
        @restore="restoreSelected"
        @clear="clearSelected"
        @reset="resetBindings"
        @apply-scheme="applyScheme"
        @save-scheme="saveScheme"
        @delete-scheme="deleteScheme"
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
  border-bottom: 1px solid rgba(var(--qin-w-rgb), 0.07);
}

.brand {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.brand__name {
  font-size: 14px;
  letter-spacing: 0.12em;
  color: rgb(var(--qin-ink-rgb));
}

.brand__latin {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 9.5px;
  letter-spacing: 0.3em;
  color: rgba(var(--qin-w-rgb), 0.26);
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
  color: rgba(var(--qin-w-rgb), 0.42);
}

.volume {
  display: flex;
  align-items: center;
  gap: 9px;
  color: rgba(var(--qin-w-rgb), 0.45);
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
  background: rgba(var(--qin-w-rgb), 0.3);
}

.volume input[type='range']::-webkit-slider-thumb {
  appearance: none;
  width: 9px;
  height: 9px;
  margin-top: -4px;
  border-radius: 50%;
  background: var(--qin-accent);
}

.volume input[type='range']::-moz-range-track {
  height: 1px;
  background: rgba(var(--qin-w-rgb), 0.3);
}

.volume input[type='range']::-moz-range-thumb {
  width: 9px;
  height: 9px;
  border: 0;
  border-radius: 50%;
  background: var(--qin-accent);
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
  border-top: 1px solid rgba(var(--qin-w-rgb), 0.08);
  border-bottom: 1px solid rgba(var(--qin-w-rgb), 0.08);
}

.ranges {
  display: flex;
}

/* 「键位跟随音区」：贴着高音区右边，用竖细分隔线跟视口按钮分开 */
.controls__left {
  display: flex;
  align-items: center;
}

.follow {
  display: flex;
  align-items: center;
  margin-left: 14px;
  padding-left: 18px;
  border-left: 1px solid rgba(var(--qin-w-rgb), 0.08);
}

.follow :deep(.switch) {
  gap: 8px;
  font-size: 12px;
  letter-spacing: 0.04em;
  color: rgba(var(--qin-w-rgb), 0.48);
  transition: color 120ms ease;
}

.follow :deep(.switch.is-on) {
  color: var(--qin-accent-strong);
}

.follow :deep(.switch__track) {
  width: 30px;
  height: 16px;
}

.follow :deep(.switch__thumb) {
  width: 12px;
  height: 12px;
}

.follow :deep(.switch.is-on .switch__thumb) {
  transform: translateX(14px);
}

.range {
  padding: 9px 14px 8px;
  border: 0;
  border-bottom: 1px solid transparent;
  background: transparent;
  color: rgba(var(--qin-w-rgb), 0.42);
  font-family: inherit;
  font-size: 12px;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition: color 120ms ease, border-color 120ms ease;
}

.range:hover {
  color: rgba(var(--qin-w-rgb), 0.72);
}

.range.is-active {
  color: rgb(var(--qin-ink-rgb));
  border-bottom-color: var(--qin-accent);
}

.range span {
  margin-left: 6px;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 9.5px;
  color: rgba(var(--qin-w-rgb), 0.26);
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
  color: rgba(var(--qin-w-rgb), 0.42);
  font-family: inherit;
  font-size: 12px;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition: color 120ms ease;
}

.text-btn:hover {
  color: rgba(var(--qin-w-rgb), 0.8);
}

.text-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.text-btn:disabled:hover {
  color: rgba(var(--qin-w-rgb), 0.42);
}

/* ------------------------------------------------------------------ 播放控制条 */
.player {
  display: flex;
  align-items: center;
  gap: 14px;
}

.player__select {
  appearance: none;
  padding: 4px 22px 4px 9px;
  border: 1px solid rgba(var(--qin-w-rgb), 0.14);
  border-radius: 2px;
  background-color: transparent;
  background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8'%3E%3Cpath d='M1.2 2.9 4 5.7l2.8-2.8' fill='none' stroke='%238a8a8a' stroke-width='1.1'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 7px center;
  background-size: 8px;
  color: rgba(var(--qin-ink-rgb), 0.8);
  font-family: inherit;
  font-size: 12px;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition: border-color 120ms ease, color 120ms ease;
}

.player__select:hover:not(:disabled) {
  border-color: rgba(var(--qin-accent-rgb), 0.42);
  color: rgba(var(--qin-ink-rgb), 0.92);
}

.player__select:disabled {
  opacity: 0.4;
  cursor: default;
}

.player__select option {
  background: var(--qin-surface-2);
  color: rgb(var(--qin-ink-rgb));
}

.player__play {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.player__icon {
  width: 10px;
  height: 10px;
  display: block;
}

.player__beat {
  min-width: 92px;
  text-align: right;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 10.5px;
  letter-spacing: 0.05em;
  color: rgba(var(--qin-w-rgb), 0.32);
  font-variant-numeric: tabular-nums;
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
  color: rgba(var(--qin-w-rgb), 0.28);
}

.foot__item b {
  font-weight: 400;
  color: rgba(var(--qin-w-rgb), 0.6);
  letter-spacing: 0.1em;
}

.foot__item--state {
  margin-left: auto;
  color: rgba(var(--qin-w-rgb), 0.22);
}

@media (max-width: 820px) {
  .controls,
  .foot {
    width: 92%;
  }

  .range span,
  .foot__item:nth-child(2),
  .player__beat,
  .follow :deep(.switch__label) {
    display: none;
  }
}
</style>
