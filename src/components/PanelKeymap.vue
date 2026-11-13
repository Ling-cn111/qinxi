<script setup lang="ts">
import { computed } from 'vue';
import KeyMapDiagram from './KeyMapDiagram.vue';
import type { PianoKeyMap } from '@/keyboard/keyMap';

/**
 * 「键位」页：键位方案 + 电脑键盘映射图。
 * 方案目前只实现了 AutoPiano / VirtualPiano 这一套（与 `keyboard/keyMap.ts` 一致），
 * 另两套是社区常用谱的键位，等解析器支持多方案再开。
 */
const props = defineProps<{
  keyMap: PianoKeyMap;
  pressed: ReadonlySet<number>;
}>();

const preset = defineModel<string>('preset', { required: true });
const mode = defineModel<'char' | 'note'>('mode', { required: true });

interface Preset {
  id: string;
  name: string;
  available: boolean;
  desc: string;
}

const PRESETS: readonly Preset[] = [
  {
    id: 'autopiano',
    name: '默认 / AutoPiano / VirtualPiano',
    available: true,
    desc: 'AutoPiano 标准键位，兼容 VirtualPiano 键位，是自由钢琴键盘谱使用的默认键位，音高按键盘排列依次递增。',
  },
  {
    id: 'freepiano',
    name: 'FreePiano / EveryonePiano',
    available: false,
    desc: 'FreePiano / 人人钢琴的键位方案，待解析器支持多方案后接入。',
  },
  {
    id: 'flash',
    name: 'Flash Piano',
    available: false,
    desc: 'Flash Piano 的键位方案，待解析器支持多方案后接入。',
  },
];

const activePreset = computed(
  () => PRESETS.find((item) => item.id === preset.value) ?? PRESETS[0],
);
</script>

<template>
  <section class="panel">
    <h3 class="panel-title"><span class="panel-title__num">1</span>键位设置</h3>

    <div class="presets">
      <button
        v-for="item in PRESETS"
        :key="item.id"
        type="button"
        class="preset"
        :class="{ 'is-active': item.id === preset && item.available, 'is-locked': !item.available }"
        :disabled="!item.available"
        @click="preset = item.id"
      >
        <span class="preset__mark" aria-hidden="true"></span>
        {{ item.name }}
      </button>
    </div>

    <p class="preset__desc">{{ activePreset.desc }}</p>

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
      黑键 = Shift + 左侧白键（⇧Z = C♯2），⌥ + 右侧白键为同义写法；演奏时对应键帽会点亮。
    </p>

    <KeyMapDiagram :key-map="props.keyMap" :pressed="props.pressed" :mode="mode" />
  </section>
</template>

<style scoped>
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.panel-head--gap {
  margin-top: 26px;
}

.presets {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.preset {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 38px;
  padding: 0 14px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  background: #202020;
  color: rgba(231, 227, 220, 0.72);
  font-family: inherit;
  font-size: 12.5px;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition:
    border-color 120ms ease,
    background 120ms ease,
    color 120ms ease;
}

.preset:hover:not(:disabled) {
  border-color: rgba(207, 164, 106, 0.42);
  color: #e7e3dc;
}

.preset.is-active {
  border-color: rgba(207, 164, 106, 0.7);
  background: #241b12;
  color: #e5c79a;
}

.preset.is-locked {
  cursor: not-allowed;
  color: rgba(231, 227, 220, 0.28);
  border-style: dashed;
  border-color: rgba(255, 255, 255, 0.08);
}

/* 键帽状的小方块标识，避免用 emoji */
.preset__mark {
  width: 12px;
  height: 10px;
  border: 1px solid currentColor;
  border-radius: 1px;
  opacity: 0.65;
  box-shadow: inset 0 -2px 0 rgba(0, 0, 0, 0.25);
}

.preset__desc {
  margin: 12px 0 0;
  padding: 12px 14px;
  border: 1px solid rgba(255, 255, 255, 0.07);
  background: #1b1b1b;
  font-size: 12.5px;
  line-height: 1.7;
  color: rgba(231, 227, 220, 0.44);
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
