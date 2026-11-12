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

const labelOf = (pitch: number) => (props.showLabels ? props.keyMap.charFor(pitch) : undefined);
const modifierOf = (pitch: number) => props.keyMap.modifierFor(pitch);
const cLabel = (pitch: number) => (pitch % 12 === 0 ? `C${pitch / 12 - 1}` : '');
const pressedClass = (pitch: number) => (props.pressed.has(pitch) ? 'is-pressed' : '');

const onDown = (pitch: number, event: PointerEvent) => {
  event.preventDefault();
  emit('press', pitch);
};
</script>

<template>
  <div class="piano-scroll">
    <div class="piano">
      <div class="piano__lid" aria-hidden="true">
        <span class="piano__engrave">QINXI · 88</span>
      </div>
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
              <span class="key__shift">{{ modifierOf(key.pitch) === 'alt' ? '⌥' : '⇧' }}</span>
              <span>{{ labelOf(key.pitch) }}</span>
            </span>
          </button>
        </div>
      </div>

      <div class="piano__rail" aria-hidden="true"></div>
    </div>
    <div class="piano__shadow" aria-hidden="true"></div>
  </div>
</template>

<style scoped>
.piano-scroll {
  position: relative;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 4px 2px 26px;
  scrollbar-width: thin;
  scrollbar-color: rgba(231, 227, 220, 0.18) transparent;
}

.piano-scroll::-webkit-scrollbar {
  height: 6px;
}

.piano-scroll::-webkit-scrollbar-thumb {
  background: rgba(231, 227, 220, 0.16);
  border-radius: 3px;
}

.piano {
  position: relative;
  min-width: 980px;
  padding: 0 14px 14px;
  border-radius: 6px;
  /* 深色木质琴体：上亮下暗 + 底边厚度 */
  background: linear-gradient(180deg, #3a271c 0%, #2a1b13 18%, #221610 62%, #150e0a 100%);
  border: 1px solid #43301f;
  box-shadow:
    0 1px 0 rgba(255, 233, 200, 0.1) inset,
    0 -2px 6px rgba(0, 0, 0, 0.55) inset,
    0 22px 44px -14px rgba(0, 0, 0, 0.9),
    0 3px 0 #0d0907;
}

.piano__lid {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  height: 26px;
  padding: 0 10px;
  border-radius: 5px 5px 0 0;
  background: linear-gradient(180deg, #4a3323 0%, #33221a 60%, #241811 100%);
  box-shadow:
    0 1px 0 rgba(255, 226, 190, 0.14) inset,
    0 -8px 14px -10px rgba(0, 0, 0, 0.8) inset;
}

.piano__engrave {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 9px;
  letter-spacing: 0.34em;
  color: rgba(226, 196, 150, 0.34);
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.55);
}

.piano__felt {
  height: 7px;
  margin: 0 0 6px;
  background: linear-gradient(180deg, #5c1620 0%, #3a0d14 55%, #23070c 100%);
  box-shadow:
    0 2px 3px rgba(0, 0, 0, 0.6) inset,
    0 1px 2px rgba(0, 0, 0, 0.5);
}

.piano__keys {
  position: relative;
  height: clamp(210px, 27vw, 300px);
  /* 琴键下方的深色底：键缝透出这个颜色才有深度 */
  background: #080706;
  /* 不能用 hidden：白键的厚度面与投影要溢出到下方琴框上 */
  box-shadow: 0 -6px 12px -6px rgba(0, 0, 0, 0.9) inset;
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

.piano__rail {
  position: relative;
  z-index: 2;
  height: 10px;
  margin-top: 9px;
  border-radius: 0 0 4px 4px;
  background: linear-gradient(180deg, #2f2017 0%, #170f0a 100%);
  box-shadow: 0 1px 0 rgba(255, 226, 190, 0.08) inset;
}

.piano__shadow {
  position: absolute;
  left: 4%;
  right: 4%;
  bottom: 8px;
  height: 34px;
  border-radius: 50%;
  background: radial-gradient(closest-side, rgba(0, 0, 0, 0.62), rgba(0, 0, 0, 0));
  filter: blur(2px);
  pointer-events: none;
  z-index: -1;
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

/* ---------------------------------------------------------------- 白键 */
.key--white {
  flex: 1 1 0;
  height: 100%;
  border-radius: 0 0 4px 4px;
  background:
    /* 后沿阴影：键从框架里"钻出来"的深度 */
    linear-gradient(180deg, rgba(26, 21, 15, 0.2) 0%, rgba(26, 21, 15, 0) 7%),
    /* 键面：主体是均匀的象牙白，只在靠近前缘处收暗（真实琴键的弧面） */
    linear-gradient(180deg, #fbf9f3 0%, #faf8f1 64%, #f2eee2 86%, #e3ddcc 100%);
  box-shadow:
    /* 顶部高光线 */
    0 1px 0 rgba(255, 255, 255, 0.92) inset,
    /* 前缘微凹 */
    0 -10px 16px -12px rgba(70, 62, 48, 0.5) inset,
    /* 键身厚度 + 投影 */
    0 3px 0 #bdb6a6,
    0 6px 10px rgba(0, 0, 0, 0.55);
  transition:
    background 45ms linear,
    transform 45ms ease-out,
    box-shadow 45ms linear;
}

/* 左侧缝隙：由深到透的窄渐变，比一条细线更有深度 */
.key--white::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 5px;
  background: linear-gradient(90deg, rgba(24, 19, 14, 0.5), rgba(24, 19, 14, 0));
  pointer-events: none;
}

/* 右侧亮边：与左缝一明一暗，缝才有"立体"感 */
.key--white::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  right: 0;
  width: 1px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.7), rgba(255, 255, 255, 0.12));
  pointer-events: none;
}

.key--white.is-pressed {
  background:
    /* 按下后后端被压进琴框，顶端出现阴影缝 —— 这是最直观的"按下去"线索 */
    linear-gradient(
      180deg,
      rgba(18, 14, 9, 0.62) 0%,
      rgba(18, 14, 9, 0.2) 12%,
      rgba(18, 14, 9, 0) 26%
    ),
    /* 键面整体压暗 */
    linear-gradient(180deg, #e7e1d1 0%, #dbd4c2 48%, #c6bfae 100%);
  transform: translateY(4px);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.3) inset,
    0 -4px 14px -2px rgba(58, 50, 36, 0.7) inset,
    0 0 0 #b3ab99,
    0 1px 3px rgba(0, 0, 0, 0.7);
}

/* ---------------------------------------------------------------- 黑键 */
.key--black {
  position: absolute;
  top: 0;
  height: 63%;
  pointer-events: auto;
  border-radius: 0 0 3px 3px;
  /* 左高光 / 中暗部 / 右侧更暗，模拟圆柱受光 */
  background: linear-gradient(
    90deg,
    #454545 0%,
    #2c2c2c 9%,
    #1b1b1b 34%,
    #101010 68%,
    #262626 92%,
    #101010 100%
  );
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.22) inset,
    1px 0 0 rgba(255, 255, 255, 0.07) inset,
    -1px 0 0 rgba(0, 0, 0, 0.85) inset,
    0 5px 0 #0b0b0b,
    0 9px 16px rgba(0, 0, 0, 0.7);
  transition:
    background 45ms linear,
    transform 45ms ease-out,
    box-shadow 45ms linear;
}

/* 顶部反光面 */
.key--black::before {
  content: '';
  position: absolute;
  inset: 0 0 auto 0;
  height: 22%;
  border-radius: 0 0 40% 40% / 0 0 6px 6px;
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.26) 0%,
    rgba(255, 255, 255, 0.06) 55%,
    rgba(255, 255, 255, 0) 100%
  );
  pointer-events: none;
}

.key--black.is-pressed {
  background: linear-gradient(90deg, #2b2b2b 0%, #181818 30%, #080808 70%, #141414 100%);
  transform: translateY(4px);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.1) inset,
    0 1px 0 #0b0b0b,
    0 2px 6px rgba(0, 0, 0, 0.75);
}

/* 按下时顶部反光消失、转为阴影，黑键"沉下去"的感觉主要靠这一步 */
.key--black.is-pressed::before {
  background: linear-gradient(
    180deg,
    rgba(0, 0, 0, 0.58) 0%,
    rgba(0, 0, 0, 0.16) 38%,
    rgba(0, 0, 0, 0) 72%
  );
}

/* ---------------------------------------------------------------- 标注 */
.key__label {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 8px;
  text-align: center;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 10px;
  line-height: 1;
  color: rgba(32, 26, 18, 0.56);
  pointer-events: none;
}

.key__label--black {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  bottom: 6px;
  font-size: 8.5px;
  line-height: 1.05;
  color: rgba(255, 255, 255, 0.56);
}

.key__shift {
  font-size: 7.5px;
  color: rgba(255, 255, 255, 0.34);
}

.key__note {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 22px;
  text-align: center;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 8px;
  letter-spacing: 0.03em;
  color: rgba(32, 26, 18, 0.34);
  pointer-events: none;
}
</style>
