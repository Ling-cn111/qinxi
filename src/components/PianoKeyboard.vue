<script setup lang="ts">
import { buildKeyboardLayout, WHITE_KEY_COUNT } from '@/keyboard/layout';
import type { PianoKeyMap } from '@/keyboard/keyMap';

const props = defineProps<{
  /** 当前被按下的音高集合 */
  pressed: ReadonlySet<number>;
  keyMap: PianoKeyMap;
  /** 是否在琴键上显示键盘字符 */
  showLabels: boolean;
}>();

const emit = defineEmits<{
  press: [pitch: number];
  release: [pitch: number];
}>();

const layout = buildKeyboardLayout();
const whiteKeys = layout.filter((key) => !key.isBlack);
const blackKeys = layout.filter((key) => key.isBlack);

const toPercent = (units: number) => (units / WHITE_KEY_COUNT) * 100;

const blackStyle = (key: { left: number; width: number }) => ({
  left: `${toPercent(key.left)}%`,
  width: `${toPercent(key.width)}%`,
});

const labelOf = (pitch: number) => (props.showLabels ? props.keyMap.labelFor(pitch) : undefined);

const cLabel = (pitch: number) => (pitch % 12 === 0 ? `C${pitch / 12 - 1}` : '');

const pressedClass = (pitch: number) => (props.pressed.has(pitch) ? 'is-pressed' : '');

const onDown = (pitch: number, event: PointerEvent) => {
  event.preventDefault();
  emit('press', pitch);
};
</script>

<template>
  <div class="piano">
    <div class="piano__felt" aria-hidden="true"></div>
    <div class="piano__keys">
      <div class="piano__whites">
        <button
          v-for="key in whiteKeys"
          :key="key.pitch"
          type="button"
          class="key key--white"
          :class="pressedClass(key.pitch)"
          :aria-label="`${keyMap.noteNameFor(key.pitch)} 白键`"
          @pointerdown="onDown(key.pitch, $event)"
          @pointerup="emit('release', key.pitch)"
          @pointerleave="emit('release', key.pitch)"
          @pointercancel="emit('release', key.pitch)"
          @contextmenu.prevent
        >
          <span v-if="labelOf(key.pitch)" class="key__label">{{ labelOf(key.pitch) }}</span>
          <span v-if="cLabel(key.pitch)" class="key__note">{{ cLabel(key.pitch) }}</span>
        </button>
      </div>

      <div class="piano__blacks">
        <button
          v-for="key in blackKeys"
          :key="key.pitch"
          type="button"
          class="key key--black"
          :class="pressedClass(key.pitch)"
          :style="blackStyle(key)"
          :aria-label="`${keyMap.noteNameFor(key.pitch)} 黑键`"
          @pointerdown="onDown(key.pitch, $event)"
          @pointerup="emit('release', key.pitch)"
          @pointerleave="emit('release', key.pitch)"
          @pointercancel="emit('release', key.pitch)"
          @contextmenu.prevent
        >
          <span v-if="labelOf(key.pitch)" class="key__label key__label--black">
            <span class="key__shift">{{ keyMap.modifierFor(key.pitch) === 'alt' ? '⌥' : '⇧' }}</span>
            <span>{{ keyMap.charFor(key.pitch) }}</span>
          </span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.piano {
  position: relative;
  padding: 14px 18px 20px;
  border-radius: 16px;
  background: linear-gradient(180deg, #43302a 0%, #2b1d19 100%);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.14) inset,
    0 18px 40px rgba(43, 29, 25, 0.35),
    0 2px 0 rgba(0, 0, 0, 0.35);
  overflow: hidden;
}

.piano__felt {
  height: 8px;
  margin: 0 2px 8px;
  border-radius: 3px;
  background: linear-gradient(180deg, #8f1f2e 0%, #5d1420 100%);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.45) inset;
}

.piano__keys {
  position: relative;
  height: clamp(180px, 26vw, 260px);
  border-radius: 4px 4px 8px 8px;
  background: #14100e;
  overflow: hidden;
}

.piano__whites {
  display: flex;
  height: 100%;
  width: 100%;
}

.piano__blacks {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.key {
  position: relative;
  padding: 0;
  border: 0;
  font: inherit;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
  touch-action: none;
}

.key--white {
  flex: 1 1 0;
  height: 100%;
  margin: 0;
  border-right: 1px solid rgba(20, 16, 14, 0.22);
  border-radius: 0 0 6px 6px;
  background: linear-gradient(180deg, #fffef9 0%, #f7f3e8 74%, #e8e1d1 100%);
  box-shadow:
    0 -1px 0 rgba(255, 255, 255, 0.9) inset,
    0 3px 4px rgba(0, 0, 0, 0.18);
  transition: background 60ms linear, transform 60ms linear, box-shadow 120ms linear;
}

.key--white:last-child {
  border-right: 0;
}

.key--white.is-pressed {
  background: linear-gradient(180deg, #fff8e4 0%, #f6e6bd 70%, #e9d29a 100%);
  transform: translateY(2px);
  box-shadow:
    0 1px 0 rgba(0, 0, 0, 0.18) inset,
    0 0 0 1px rgba(201, 154, 70, 0.55) inset;
}

.key--black {
  position: absolute;
  top: 0;
  height: 62%;
  pointer-events: auto;
  border-radius: 0 0 5px 5px;
  background: linear-gradient(180deg, #3b3b3d 0%, #1a1a1c 58%, #0a0a0b 100%);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.16) inset,
    2px 3px 5px rgba(0, 0, 0, 0.55),
    0 6px 10px rgba(0, 0, 0, 0.3);
  transition: background 60ms linear, transform 60ms linear;
}

.key--black.is-pressed {
  background: linear-gradient(180deg, #6f6135 0%, #3a3220 60%, #17140d 100%);
  transform: translateY(2px) scaleY(0.995);
}

.key__label {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 9px;
  text-align: center;
  font-family: ui-monospace, 'SF Mono', 'Cascadia Mono', Menlo, Consolas, monospace;
  font-size: 11px;
  line-height: 1;
  color: rgba(43, 29, 25, 0.42);
  pointer-events: none;
}

.key__label--black {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  bottom: 6px;
  font-size: 9px;
  line-height: 1.05;
  color: rgba(255, 255, 255, 0.52);
}

.key__shift {
  font-size: 7.5px;
  color: rgba(255, 255, 255, 0.34);
}

.key__note {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 24px;
  text-align: center;
  font-size: 9px;
  letter-spacing: 0.04em;
  color: rgba(43, 29, 25, 0.26);
  pointer-events: none;
}
</style>
