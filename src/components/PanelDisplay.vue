<script setup lang="ts">
import { watch } from 'vue';
import UiToggle from './UiToggle.vue';

/** 「显示」页：琴键上标注什么。音名与唱名共用键面下方一行，互斥。 */
const hints = defineModel<boolean>('hints', { required: true });
const noteNames = defineModel<boolean>('noteNames', { required: true });
const solfege = defineModel<boolean>('solfege', { required: true });
/** 播放时的谱面视图：只看下落 / 只看键盘谱 / 两者都看 */
const scoreView = defineModel<'falling' | 'sheet' | 'both'>('scoreView', { required: true });

watch(noteNames, (on) => {
  if (on) solfege.value = false;
});

watch(solfege, (on) => {
  if (on) noteNames.value = false;
});

const viewOptions = [
  { value: 'falling', label: '只看下落' },
  { value: 'sheet', label: '只看键盘谱' },
  { value: 'both', label: '两者都看' },
] as const;
</script>

<template>
  <section class="panel">
    <h3 class="panel-title"><span class="panel-title__num">1</span>琴键标识</h3>

    <div class="panel-row">
      <UiToggle v-model="hints" label="显示按键提示" />
      <UiToggle v-model="noteNames" label="显示音名" />
      <UiToggle v-model="solfege" label="显示唱名（C 大调）" />
    </div>

    <p class="panel-desc">
      按键提示标在键面上方，音名与唱名共用下方一行，开启其一时会自动关闭另一个。
    </p>

    <h3 class="panel-title"><span class="panel-title__num">2</span>跟弹视图</h3>

    <div class="view-switch" role="radiogroup" aria-label="跟弹视图">
      <button
        v-for="option in viewOptions"
        :key="option.value"
        type="button"
        class="view-switch__item"
        :class="{ 'is-active': scoreView === option.value }"
        role="radio"
        :aria-checked="scoreView === option.value"
        @click="scoreView = option.value"
      >
        {{ option.label }}
      </button>
    </div>

    <p class="panel-desc">
      跟弹播放时钢琴上方显示什么：「下落」是节奏大师式音符块，「键盘谱」是横向滚动的
      键帽字符序列（带判定标注）。自动播放时键盘谱也会跟随高亮。
    </p>
  </section>
</template>

<style scoped>
.view-switch {
  display: inline-flex;
  border: 1px solid rgba(var(--qin-w-rgb), 0.14);
  border-radius: 3px;
  overflow: hidden;
}

.view-switch__item {
  padding: 5px 13px;
  border: none;
  background: transparent;
  color: rgba(var(--qin-ink-rgb), 0.55);
  font-family: inherit;
  font-size: 12px;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
}

.view-switch__item + .view-switch__item {
  border-left: 1px solid rgba(var(--qin-w-rgb), 0.14);
}

.view-switch__item:hover {
  color: rgba(var(--qin-ink-rgb), 0.85);
}

.view-switch__item.is-active {
  background: var(--qin-surface-active);
  color: var(--qin-accent-strong);
}
</style>
