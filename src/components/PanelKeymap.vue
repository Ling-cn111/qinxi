<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue';
import KeyMapDiagram from './KeyMapDiagram.vue';
import { KEYMAP_ROWS, type PianoKeyMap } from '@/keyboard/keyMap';
import { MAX_SCHEME_NAME, type KeymapScheme } from '@/keyboard/keymapSchemes';
import { midiToName } from '@/audio/note';

/**
 * 「键位」页：方案标签 + 键位表 + 自定义键位（绑定 / 空置）+ 键盘映射图。
 *
 * 自定义流程：点「自定义键位」→ 在钢琴上点一个音 → 按下要绑定的物理键；
 * 也可以按 Delete 把这个音空置（不绑任何键）。绑定关系交给 App 处理
 * （它持有 keyMap、方案列表与本地存储），这里只负责交互与展示。
 */
const props = defineProps<{
  keyMap: PianoKeyMap;
  pressed: ReadonlySet<number>;
  /** 编辑态下已选中的音高 */
  editPitch: number | null;
  /** 改动条目数（绑定 + 空置） */
  customCount: number;
  /** 操作反馈（几秒后自动消失） */
  lastAction: string;
  /** 已保存的方案（内置的「C大调」不在这里） */
  schemes: ReadonlyArray<KeymapScheme>;
  /** 当前键位对应的方案 id；null 表示有还没保存的改动 */
  activeSchemeId: string | null;
}>();

const emit = defineEmits<{
  toggleEdit: [];
  restore: [];
  clear: [];
  reset: [];
  applyScheme: [id: string];
  saveScheme: [name: string];
  deleteScheme: [id: string];
}>();

const editMode = defineModel<boolean>('editMode', { required: true });
const mode = defineModel<'char' | 'note'>('mode', { required: true });

const confirmingReset = ref(false);
let resetTimer: number | undefined;

const saving = ref(false);
const draftName = ref('');
const nameInput = ref<HTMLInputElement | null>(null);

const clearedNames = computed(() =>
  [...props.keyMap.clearedPitches].sort((a, b) => a - b).map((pitch) => midiToName(pitch)),
);

const statusText = computed(() => {
  if (props.customCount === 0) return '默认键位：C 大调（仅白键），没有空置的音';
  const parts: string[] = [];
  const binds = props.customCount - clearedNames.value.length;
  if (binds > 0) parts.push(`自定义 ${binds} 处`);
  if (clearedNames.value.length > 0) {
    const list = clearedNames.value.slice(0, 4).join(' ');
    const more = clearedNames.value.length > 4 ? ' …' : '';
    parts.push(`空置 ${clearedNames.value.length} 个音（${list}${more}）`);
  }
  const dirty = props.activeSchemeId === null ? '未保存 · ' : '';
  return dirty + parts.join(' · ');
});

const editHint = computed(() => {
  if (props.editPitch !== null) {
    return `已选 ${props.keyMap.noteNameFor(props.editPitch)}，按下一个物理键完成绑定`;
  }
  return '在钢琴上点一个音，再按下要绑定的物理键';
});

/** 默认名字避开重名，省得每次都手动改 */
function nextName(): string {
  const used = new Set(props.schemes.map((item) => item.name));
  let index = props.schemes.length + 1;
  while (used.has(`方案 ${index}`)) index += 1;
  return `方案 ${index}`;
}

function startSave(): void {
  saving.value = true;
  draftName.value = nextName();
  void nextTick(() => {
    nameInput.value?.focus();
    nameInput.value?.select();
  });
}

function cancelSave(): void {
  saving.value = false;
  draftName.value = '';
}

function submitSave(): void {
  const name = draftName.value.trim();
  if (!name) return;
  emit('saveScheme', name);
  saving.value = false;
  draftName.value = '';
}

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
      <div class="head-main">
        <h3 class="panel-title"><span class="panel-title__num">1</span>键位</h3>

        <div class="schemes" role="group" aria-label="键位方案">
          <div class="scheme" :class="{ 'is-active': activeSchemeId === 'default' }">
            <button type="button" class="scheme__name" @click="emit('applyScheme', 'default')">
              C大调
            </button>
          </div>

          <div
            v-for="scheme in schemes"
            :key="scheme.id"
            class="scheme"
            :class="{ 'is-active': activeSchemeId === scheme.id }"
          >
            <button type="button" class="scheme__name" @click="emit('applyScheme', scheme.id)">
              {{ scheme.name }}
            </button>
            <button
              type="button"
              class="scheme__remove"
              :aria-label="`删除方案 ${scheme.name}`"
              :title="`删除方案 ${scheme.name}`"
              @click="emit('deleteScheme', scheme.id)"
            >
              ×
            </button>
          </div>
        </div>
      </div>

      <div class="head-actions">
        <button
          type="button"
          class="ghost"
          :class="{ 'is-active': saving }"
          :aria-expanded="saving"
          @click="saving ? cancelSave() : startSave()"
        >
          {{ saving ? '取消保存' : '保存当前方案' }}
        </button>
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

    <form v-if="saving" class="save-form" @submit.prevent="submitSave">
      <input
        ref="nameInput"
        v-model="draftName"
        class="save-form__input"
        type="text"
        :maxlength="MAX_SCHEME_NAME"
        placeholder="方案名称"
        aria-label="方案名称"
        @keydown.esc.stop.prevent="cancelSave"
      />
      <button type="submit" class="ghost ghost--small" :disabled="!draftName.trim()">保存</button>
      <button type="button" class="ghost ghost--small" @click="cancelSave">取消</button>
      <span class="save-form__tip">只存与默认布局不同的键位 · 回车确认</span>
    </form>

    <div class="layout" role="table" aria-label="默认键位布局">
      <div v-for="row in KEYMAP_ROWS" :key="row.label" class="layout__row" role="row">
        <span class="layout__label" role="cell">{{ row.label }}</span>
        <span class="layout__keys" role="cell">{{ row.keys }}</span>
        <span class="layout__range" role="cell">{{ row.range }}</span>
      </div>
    </div>

    <p class="status">{{ statusText }}</p>

    <div v-if="editMode" class="editor">
      <span class="editor__dot" aria-hidden="true"></span>
      <span class="editor__text">{{ editHint }}</span>
      <span class="editor__tips">Backspace 恢复默认 · Delete 空置 · Esc 退出</span>
      <button
        v-if="editPitch !== null"
        type="button"
        class="ghost ghost--small"
        @click="emit('restore')"
      >
        恢复默认
      </button>
      <button
        v-if="editPitch !== null"
        type="button"
        class="ghost ghost--small"
        @click="emit('clear')"
      >
        空置此音
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
      没有音名的键（<b>`</b>、<b>1–4</b>、<b>A</b>、<b>S</b>、<b>\</b>、<b>, . /</b>
      以及整个小键盘）是空闲的，想用哪个就在上面选中一个音再按它。
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

.head-main {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 18px;
  min-width: 0;
}

.head-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* 方案标签：内置「C大调」在前，保存过的方案依次排在右边 */
.schemes {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.scheme {
  display: inline-flex;
  align-items: stretch;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 2px;
  overflow: hidden;
  transition:
    border-color 120ms ease,
    background 120ms ease;
}

.scheme.is-active {
  border-color: rgba(207, 164, 106, 0.6);
  background: #241b12;
}

.scheme__name {
  height: 26px;
  padding: 0 10px;
  border: 0;
  background: transparent;
  color: rgba(231, 227, 220, 0.6);
  font-family: inherit;
  font-size: 12px;
  letter-spacing: 0.04em;
  white-space: nowrap;
  cursor: pointer;
  transition: color 120ms ease;
}

.scheme__name:hover {
  color: #e7e3dc;
}

.scheme.is-active .scheme__name {
  color: #e5c79a;
}

.scheme__remove {
  width: 20px;
  border: 0;
  border-left: 1px solid rgba(255, 255, 255, 0.08);
  background: transparent;
  color: rgba(231, 227, 220, 0.32);
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  opacity: 0;
  transition:
    opacity 120ms ease,
    color 120ms ease;
}

.scheme:hover .scheme__remove,
.scheme.is-active .scheme__remove {
  opacity: 1;
}

.scheme__remove:hover {
  color: #e8b4a2;
}

/* 保存方案：就地起名，不用浏览器弹窗 */
.save-form {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
  padding: 10px 12px;
  border: 1px solid rgba(207, 164, 106, 0.3);
  background: rgba(207, 164, 106, 0.05);
}

.save-form__input {
  width: 200px;
  height: 28px;
  padding: 0 9px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 2px;
  background: #0f0f0f;
  color: #e7e3dc;
  font-family: inherit;
  font-size: 12.5px;
  letter-spacing: 0.03em;
}

.save-form__input:focus {
  outline: none;
  border-color: rgba(207, 164, 106, 0.65);
}

.save-form__input::placeholder {
  color: rgba(231, 227, 220, 0.26);
}

.save-form__tip {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11px;
  letter-spacing: 0.03em;
  color: rgba(232, 217, 194, 0.42);
}

/* 默认布局：一排一个八度的文字表 */
.layout {
  display: flex;
  flex-direction: column;
  border-top: 1px solid rgba(255, 255, 255, 0.07);
}

.layout__row {
  display: grid;
  grid-template-columns: 46px minmax(0, 1fr) auto;
  gap: 14px;
  align-items: baseline;
  padding: 8px 10px 8px 2px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.055);
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
}

.layout__label {
  color: rgba(231, 227, 220, 0.34);
  font-size: 11px;
  letter-spacing: 0.06em;
}

.layout__keys {
  letter-spacing: 0.02em;
  line-height: 1.95;
  color: rgba(231, 227, 220, 0.74);
}

.layout__range {
  font-size: 11px;
  letter-spacing: 0.05em;
  color: rgba(229, 199, 154, 0.5);
  white-space: nowrap;
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

.ghost:disabled {
  opacity: 0.4;
  cursor: default;
}

.ghost:disabled:hover {
  border-color: rgba(255, 255, 255, 0.12);
  color: rgba(231, 227, 220, 0.66);
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
