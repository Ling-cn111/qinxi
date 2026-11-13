<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import KeyMapDiagram from './KeyMapDiagram.vue';
import { KEYMAP_PRESETS, type PianoKeyMap, type KeymapPresetId } from '@/keyboard/keyMap';

/**
 * 「键位」页：方案选择 + 自定义键位 + 键盘映射图。
 *
 * 自定义流程：点「自定义键位」→ 在钢琴上点一个音 → 按下要绑定的物理键。
 * 绑定关系交给 App 处理（它持有 keyMap 与本地存储），这里只负责交互与展示。
 */
const props = defineProps<{
  keyMap: PianoKeyMap;
  pressed: ReadonlySet<number>;
  /** 编辑态下已选中的音高 */
  editPitch: number | null;
  /** 已自定义的条目数 */
  customCount: number;
  /** 操作反馈（几秒后自动消失） */
  lastAction: string;
}>();

const emit = defineEmits<{
  toggleEdit: [];
  restore: [];
  reset: [];
}>();

const editMode = defineModel<boolean>('editMode', { required: true });
const mode = defineModel<'char' | 'note'>('mode', { required: true });
const preset = defineModel<KeymapPresetId>('preset', { required: true });

const confirmingReset = ref(false);
let resetTimer: number | undefined;

const activePreset = computed(
  () => KEYMAP_PRESETS.find((item) => item.id === preset.value) ?? KEYMAP_PRESETS[0],
);

const statusText = computed(() =>
  props.customCount > 0 ? `已自定义 ${props.customCount} 处 · 其余沿用方案` : '当前未自定义任何键位',
);

const editHint = computed(() => {
  if (props.editPitch !== null) {
    return `已选 ${props.keyMap.noteNameFor(props.editPitch)}，按下一个物理键完成绑定`;
  }
  return '在钢琴上点一个音，再按下要绑定的物理键';
});

function onReset(): void {
  if (!confirmingReset.value) {
    confirmingReset.value = true;
    window.clearTimeout(resetTimer);
    resetTimer = window.setTimeout(() => {
      confirmingReset.value = false;
    }, 3000);
    return;
  }
  window.clearTimeout(resetTimer);
  confirmingReset.value = false;
  emit('reset');
}

onBeforeUnmount(() => window.clearTimeout(resetTimer));
</script>

<template>
  <section class="panel">
    <div class="panel-head">
      <h3 class="panel-title"><span class="panel-title__num">1</span>键位</h3>

      <div class="head-actions">
        <button type="button" class="ghost" :class="{ 'is-active': editMode }" @click="emit('toggleEdit')">
          {{ editMode ? '退出自定义' : '自定义键位' }}
        </button>
        <button
          type="button"
          class="ghost ghost--danger"
          :class="{ 'is-confirming': confirmingReset }"
          @click="onReset"
        >
          {{ confirmingReset ? '再点一次确认' : '恢复默认' }}
        </button>
      </div>
    </div>

    <div class="presets" role="radiogroup" aria-label="键位方案">
      <button
        v-for="item in KEYMAP_PRESETS"
        :key="item.id"
        type="button"
        role="radio"
        class="preset"
        :aria-checked="item.id === preset"
        :class="{ 'is-active': item.id === preset }"
        @click="preset = item.id"
      >
        <span class="preset__name">{{ item.short }}</span>
        <span class="preset__range">{{ item.range }}</span>
      </button>
    </div>

    <p class="preset__desc">{{ activePreset.desc }}</p>
    <p class="status">{{ statusText }}</p>

    <div v-if="editMode" class="editor">
      <span class="editor__dot" aria-hidden="true"></span>
      <span class="editor__text">{{ editHint }}</span>
      <span class="editor__tips">Backspace 恢复该音 · Esc 退出</span>
      <button
        v-if="editPitch !== null"
        type="button"
        class="ghost ghost--small"
        @click="emit('restore')"
      >
        恢复该音默认
      </button>
    </div>

    <p v-if="lastAction" class="panel-flash">{{ lastAction }}</p>

    <div class="panel-head panel-head--gap">
      <h3 class="panel-title"><span class="panel-title__num">2</span>键盘</h3>
    </div>

    <div class="radios">
      <label class="radio">
        <input v-model="mode" type="radio" value="char" name="keymap-label" />
        <span class="radio__dot" aria-hidden="true"></span>
        显示键盘字符
      </label>
      <label class="radio">
        <input v-model="mode" type="radio" value="note" name="keymap-label" />
        <span class="radio__dot" aria-hidden="true"></span>
        显示音名（C4, D5）
      </label>
    </div>

    <p class="panel-desc panel-desc--tight">
      键帽按八度着色，同一组音阶同一个颜色；演奏时点亮，被自定义过的键多一条暖色底边。
      小键盘（<b>N1–N0</b>、<b>N+ N− N× N÷</b>）同样可以绑，标签前的 <b>N</b> 表示小键盘。
    </p>

    <KeyMapDiagram
      :key-map="props.keyMap"
      :pressed="props.pressed"
      :custom="props.keyMap.customPitches"
      :mode="mode"
    />
  </section>
</template>

<style scoped>
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.panel-head--gap {
  margin-top: 26px;
}

.head-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.presets {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.preset {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  min-height: 36px;
  padding: 0 14px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  background: #202020;
  color: rgba(231, 227, 220, 0.62);
  font-family: inherit;
  cursor: pointer;
  transition:
    border-color 120ms ease,
    background 120ms ease,
    color 120ms ease;
}

.preset:hover {
  border-color: rgba(207, 164, 106, 0.42);
  color: #e7e3dc;
}

.preset.is-active {
  border-color: rgba(207, 164, 106, 0.68);
  background: #241b12;
  color: #e5c79a;
}

.preset__name {
  font-size: 13px;
}

.preset__range {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 10.5px;
  letter-spacing: 0.04em;
  color: rgba(231, 227, 220, 0.32);
}

.preset.is-active .preset__range {
  color: rgba(229, 199, 154, 0.6);
}

.preset__desc {
  margin: 12px 0 0;
  padding: 12px 14px;
  border: 1px solid rgba(255, 255, 255, 0.07);
  background: #1b1b1b;
  font-size: 12.5px;
  line-height: 1.7;
  color: rgba(231, 227, 220, 0.46);
}

.status {
  margin: 10px 0 0;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11px;
  letter-spacing: 0.04em;
  color: rgba(231, 227, 220, 0.3);
}

.ghost {
  min-height: 30px;
  padding: 0 12px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 2px;
  background: transparent;
  color: rgba(231, 227, 220, 0.66);
  font-family: inherit;
  font-size: 12px;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition:
    border-color 120ms ease,
    color 120ms ease,
    background 120ms ease;
}

.ghost:hover {
  border-color: rgba(207, 164, 106, 0.45);
  color: #e7e3dc;
}

.ghost.is-active {
  border-color: rgba(207, 164, 106, 0.65);
  background: #241b12;
  color: #e5c79a;
}

.ghost--danger:hover {
  border-color: rgba(207, 120, 90, 0.55);
  color: #e8b4a2;
}

.ghost--danger.is-confirming {
  border-color: rgba(207, 120, 90, 0.75);
  color: #e8b4a2;
  background: rgba(120, 50, 30, 0.22);
}

.ghost--small {
  min-height: 26px;
  padding: 0 10px;
  font-size: 11.5px;
}

/* 编辑态提示条 */
.editor {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 14px;
  padding: 10px 14px;
  border: 1px solid rgba(207, 164, 106, 0.4);
  background: rgba(207, 164, 106, 0.08);
  font-size: 12.5px;
  color: #e8d9c2;
}

.editor__dot {
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #cfa46a;
  box-shadow: 0 0 0 3px rgba(207, 164, 106, 0.18);
  animation: pulse 1.4s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}

.editor__text {
  flex: 1;
  min-width: 0;
}

.editor__tips {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11px;
  color: rgba(232, 217, 194, 0.5);
  white-space: nowrap;
}

.panel-flash {
  margin: 12px 0 0;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11.5px;
  color: #cfa46a;
}

.radios {
  display: flex;
  flex-wrap: wrap;
  gap: 26px;
  margin-bottom: 10px;
}

.radio {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  font-size: 13px;
  color: rgba(231, 227, 220, 0.7);
  cursor: pointer;
  user-select: none;
}

.radio input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.radio__dot {
  width: 14px;
  height: 14px;
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 50%;
  transition: border-color 120ms ease, box-shadow 120ms ease;
}

.radio input:checked + .radio__dot {
  border-color: #cfa46a;
  box-shadow: inset 0 0 0 3px #1a1a1a, inset 0 0 0 8px #cfa46a;
}

.radio input:focus-visible + .radio__dot {
  outline: 1px solid rgba(207, 164, 106, 0.75);
  outline-offset: 3px;
}
</style>
