<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  BLACK_HEIGHT_RATIO,
  buildKeyboardLayout,
  KEYBED_WIDTH_PERCENT,
  PIANO_VIEWPORTS,
  viewportScrollUnits,
  WKEY_WIDTH_PERCENT,
  type PianoViewport,
} from '@/keyboard/layout';
import type { PianoKeyMap } from '@/keyboard/keyMap';

const props = defineProps<{
  /** 当前被按下的音高集合 */
  pressed: ReadonlySet<number>;
  keyMap: PianoKeyMap;
  /** 是否显示键盘字符 */
  showLabels: boolean;
  /** 当前 5 八度视口 */
  viewport: PianoViewport['id'];
}>();

const emit = defineEmits<{
  press: [pitch: number];
  release: [pitch: number];
}>();

const layout = buildKeyboardLayout();
const whiteKeys = layout.filter((key) => !key.isBlack);
const blackKeys = layout.filter((key) => key.isBlack);

/** 键床坐标系：百分比相对键床宽度（144.3% 视口），换算后白键正好是视口的 2.775% */
const KEYBED_UNIT = 100 / whiteKeys.length;
const leftOf = (units: number) => `${units * KEYBED_UNIT}%`;
const widthOf = (units: number) => `${units * KEYBED_UNIT}%`;

const blackStyle = (key: { left: number; width: number }) => ({
  left: leftOf(key.left),
  width: widthOf(key.width),
  height: `${BLACK_HEIGHT_RATIO * 100}%`,
});

const noteNameOf = (pitch: number) => props.keyMap.noteNameFor(pitch);
const charOf = (pitch: number) => (props.showLabels ? props.keyMap.charFor(pitch) : undefined);
const modifierOf = (pitch: number) => props.keyMap.modifierFor(pitch);
const pressedClass = (pitch: number) => (props.pressed.has(pitch) ? 'is-pressed' : '');

const onDown = (pitch: number, event: PointerEvent) => {
  event.preventDefault();
  emit('press', pitch);
};

// ---------------------------------------------------------------- 5 八度视口

const viewportRef = ref<HTMLElement | null>(null);

function scrollToViewport(id: PianoViewport['id'], smooth: boolean): void {
  const element = viewportRef.value;
  if (!element) return;
  const target = PIANO_VIEWPORTS.find((item) => item.id === id) ?? PIANO_VIEWPORTS[1];
  // 一个白键的像素宽度 = 视口宽度 × 2.775%
  const keyWidth = (element.clientWidth * WKEY_WIDTH_PERCENT) / 100;
  const left = viewportScrollUnits(target.startPitch) * keyWidth;
  element.scrollTo({ left, behavior: smooth ? 'smooth' : 'auto' });
}

function onResize(): void {
  scrollToViewport(props.viewport, false);
}

watch(
  () => props.viewport,
  (id) => {
    scrollToViewport(id, true);
  },
);

onMounted(() => {
  void nextTick(() => scrollToViewport(props.viewport, false));
  window.addEventListener('resize', onResize);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
});

defineExpose({ scrollToViewport });
</script>

<template>
  <div class="piano-wrap">
    <!-- AutoPiano 顶盖：黑漆面板 + 内外双线边框 -->
    <div class="piano-band">
      <span class="piano-band__brand">琴习 QINXI</span>
      <span class="piano-band__tip">⇧ 代表 shift 键</span>
    </div>

    <div ref="viewportRef" class="piano-key-wrap">
      <div class="keybed" :style="{ width: `${KEYBED_WIDTH_PERCENT}%` }">
        <button
          v-for="key in whiteKeys"
          :key="key.pitch"
          type="button"
          class="wkey"
          :class="pressedClass(key.pitch)"
          :aria-label="`${noteNameOf(key.pitch)} 白键`"
          @pointerdown="onDown(key.pitch, $event)"
          @pointerup="emit('release', key.pitch)"
          @pointerleave="emit('release', key.pitch)"
          @pointercancel="emit('release', key.pitch)"
          @contextmenu.prevent
        >
          <span class="wkey__tip">
            <span class="wkey__note">{{ noteNameOf(key.pitch) }}</span>
            <span v-if="charOf(key.pitch)" class="wkey__key">{{ charOf(key.pitch) }}</span>
          </span>
        </button>

        <button
          v-for="key in blackKeys"
          :key="key.pitch"
          type="button"
          class="bkey"
          :class="pressedClass(key.pitch)"
          :style="blackStyle(key)"
          :aria-label="`${noteNameOf(key.pitch)} 黑键`"
          @pointerdown="onDown(key.pitch, $event)"
          @pointerup="emit('release', key.pitch)"
          @pointerleave="emit('release', key.pitch)"
          @pointercancel="emit('release', key.pitch)"
          @contextmenu.prevent
        >
          <span v-if="charOf(key.pitch)" class="bkey__tip">
            <span class="bkey__shift">{{ modifierOf(key.pitch) === 'alt' ? '⌥' : '⇧' }}</span
            >{{ charOf(key.pitch) }}
          </span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ------------------------------------------------ AutoPiano: .piano-wrap */
.piano-wrap {
  width: 90%;
  margin: 20px auto;
  border-radius: 5px;
  position: relative;
  overflow: hidden;
  /* AutoPiano 原值 5px 5px 20px 5px #888，深色页面下用同参数黑影 */
  box-shadow: 5px 5px 20px 5px rgba(0, 0, 0, 0.55);
}

/* ------------------------------------------- AutoPiano: .piano-band */
.piano-band {
  width: 100%;
  height: 40px;
  background: #000;
  box-shadow:
    inset 0 -1px 2px rgba(255, 255, 255, 0.4),
    0 2px 3px rgba(0, 0, 0, 0.4);
  border-width: 3px 2px 2px;
  border-style: solid;
  border-color: #555 #222 #111 #777;
  position: relative;
}

.piano-band__brand {
  position: absolute;
  left: 20px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 12px;
  letter-spacing: 0.28em;
  color: rgba(255, 255, 255, 0.62);
}

.piano-band__tip {
  position: absolute;
  top: 50%;
  right: 20px;
  transform: translateY(-50%);
  color: #fff;
  font-size: 14px;
  opacity: 0.76;
}

/* --------------------------------------- AutoPiano: .piano-key-wrap */
.piano-key-wrap {
  width: 100%;
  background: #222;
  position: relative;
  /* 88 键需要横向视口：AutoPiano 的 overflow:hidden 换成横向滚动 */
  overflow-x: auto;
  overflow-y: hidden;
  height: 280px;
  scrollbar-width: none;
}

.piano-key-wrap::-webkit-scrollbar {
  height: 0;
}

.keybed {
  height: 100%;
  display: flex;
  position: relative;
}

/* ------------------------------------------------ AutoPiano: .wkey */
.wkey {
  flex: 0 0 calc(100% / 52); /* 键床的 1/52 = 视口的 2.775% */
  height: 100%;
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  background: linear-gradient(white 10%, rgb(251, 251, 251) 92%, rgb(220, 220, 220) 93%, white 97%);
  border: solid 1px #222;
  border-radius: 0 0 5px 5px;
  position: relative;
  cursor: pointer;
  font: inherit;
  -webkit-tap-highlight-color: transparent;
  touch-action: none;
  user-select: none;
  transition: background 30ms linear;
}

.wkey.is-pressed {
  background: linear-gradient(#eee 10%, #ddd 60%, #bbb 93%, #ccc 97%);
  /* AutoPiano 源码：按下时键体上移 1%、高度 99%，两侧各加一个三角阴影 */
  top: -1%;
  height: 99%;
}

.wkey.is-pressed::before,
.wkey.is-pressed::after {
  content: '';
  border-width: 250px 5px 0;
  border-style: solid;
  position: absolute;
  bottom: 0;
  pointer-events: none;
}

.wkey.is-pressed::before {
  border-color: transparent transparent transparent rgba(0, 0, 0, 0.1);
  left: 0;
}

.wkey.is-pressed::after {
  border-color: transparent rgba(0, 0, 0, 0.1) transparent transparent;
  right: 0;
}

/* ------------------------------------------------ AutoPiano: .bkey */
.bkey {
  position: absolute;
  top: 0;
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  background: linear-gradient(-20deg, #333, #000, #333);
  border-width: 1px 2px 7px;
  border-style: solid;
  border-color: #666 #222 #111 #555;
  border-radius: 0 0 2px 2px;
  box-shadow:
    inset 0 -1px 2px rgba(255, 255, 255, 0.4),
    0 2px 3px rgba(0, 0, 0, 0.4);
  overflow: hidden;
  cursor: pointer;
  font: inherit;
  -webkit-tap-highlight-color: transparent;
  touch-action: none;
  user-select: none;
  transition: background 30ms linear;
}

.bkey.is-pressed {
  /* 源码写 101%（会把黑键拉到整键高），这里按 +1% 处理，视觉上仍是被按下 */
  height: 71%;
  border-bottom-width: 2px;
  box-shadow:
    inset 0 -1px 1px rgba(255, 255, 255, 0.4),
    0 1px 0 rgba(0, 0, 0, 0.8),
    0 2px 2px rgba(0, 0, 0, 0.4),
    0 -1px 0 #000;
}

/* ---------------------------------------------------------------- 标注 */
.wkey__tip {
  position: absolute;
  left: 0;
  bottom: 6px;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  pointer-events: none;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}

.wkey__note,
.wkey__key {
  font-size: 10px;
  line-height: 1;
  color: #999;
}

.bkey__tip {
  position: absolute;
  top: 7px;
  left: 0;
  width: 100%;
  text-align: center;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 10px;
  line-height: 1;
  color: rgba(255, 255, 255, 0.6);
  pointer-events: none;
}

.bkey__shift {
  font-size: 9px;
  color: rgba(255, 255, 255, 0.42);
}
</style>
