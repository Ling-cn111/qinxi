<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
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
import { noteLabelFor, splitHint, type NoteLabelMode } from '@/keyboard/labels';
import { colorForPitch } from '@/keyboard/octaveColors';

const props = defineProps<{
  /** 当前被按下的音高集合 */
  pressed: ReadonlySet<number>;
  keyMap: PianoKeyMap;
  /** 是否显示按键提示（电脑键盘字符） */
  showHints: boolean;
  /** 键面下方的音名行：不显示 / 音名 / 唱名 */
  noteMode: NoteLabelMode;
  /** 当前 5 八度视口 */
  viewport: PianoViewport['id'];
  /** 自定义键位模式：点键只选中，不当作演奏 */
  editMode?: boolean;
  /** 编辑态下已选中的音高 */
  editPitch?: number | null;
  /** 「下一个要弹的音」黄色提示（跟弹 = 第一个未判定的组；学弹 = 当前待弹组） */
  hintPitches?: ReadonlySet<number>;
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
/** 键位提示直接用绑定标签，小键盘会自带 N 前缀 */
const hintOf = (pitch: number) => (props.showHints ? props.keyMap.labelFor(pitch) : undefined);
const blackHint = (pitch: number) => splitHint(hintOf(pitch));
const nameOf = (pitch: number) => noteLabelFor(pitch, props.noteMode);
/** 八度配色：白键取深色版、黑键取浅色版 */
const keyColor = (pitch: number, onBlack: boolean) => colorForPitch(pitch, onBlack);
/**
 * 编辑态的提示直接放在琴习那行中间：选中琴键后视线还在琴键上，
 * 提示离得越近越不容易漏看；面板里那条提示条仍然保留（两处同步）。
 */
const bandHint = computed(() => {
  if (!props.editMode) return '';
  if (props.editPitch != null) {
    return `${props.keyMap.noteNameFor(props.editPitch)} 已选中 · 按下要绑定的物理键 · Backspace 恢复 · Esc 退出`;
  }
  return '点一个琴键选中音，再按下要绑定的物理键 · Delete 空置 · Esc 退出';
});
const pressedClass = (pitch: number) => props.pressed.has(pitch) ? 'is-pressed' : '';
const targetClass = (pitch: number) =>
  props.editPitch === pitch ? 'is-target' : '';
const hintClass = (pitch: number) =>
  props.hintPitches?.has(pitch) ? 'is-hint' : '';

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
  <div class="piano-wrap" :class="{ 'is-editing': editMode }">
    <!-- AutoPiano 顶盖：黑漆面板 + 内外双线边框 -->
    <div class="piano-band">
      <span class="piano-band__brand">琴习 QINXI</span>
      <span v-if="bandHint" class="piano-band__hint" role="status">{{ bandHint }}</span>
    </div>

    <div ref="viewportRef" class="piano-key-wrap">
      <div class="keybed" :style="{ width: `${KEYBED_WIDTH_PERCENT}%` }">
        <button
          v-for="key in whiteKeys"
          :key="key.pitch"
          type="button"
          class="wkey"
          :class="[pressedClass(key.pitch), targetClass(key.pitch), hintClass(key.pitch)]"
          :aria-label="`${noteNameOf(key.pitch)} 白键`"
          @pointerdown="onDown(key.pitch, $event)"
          @pointerup="emit('release', key.pitch)"
          @pointerleave="emit('release', key.pitch)"
          @pointercancel="emit('release', key.pitch)"
          @contextmenu.prevent
        >
          <span class="wkey__tip" :style="{ color: keyColor(key.pitch, false) }">
            <span v-if="hintOf(key.pitch)" class="wkey__key">{{ hintOf(key.pitch) }}</span>
            <span v-if="nameOf(key.pitch)" class="wkey__note">{{ nameOf(key.pitch) }}</span>
          </span>
        </button>

        <button
          v-for="key in blackKeys"
          :key="key.pitch"
          type="button"
          class="bkey"
          :class="[pressedClass(key.pitch), targetClass(key.pitch), hintClass(key.pitch)]"
          :style="blackStyle(key)"
          :aria-label="`${noteNameOf(key.pitch)} 黑键`"
          @pointerdown="onDown(key.pitch, $event)"
          @pointerup="emit('release', key.pitch)"
          @pointerleave="emit('release', key.pitch)"
          @pointercancel="emit('release', key.pitch)"
          @contextmenu.prevent
        >
          <span v-if="blackHint(key.pitch)" class="bkey__tip" :style="{ color: keyColor(key.pitch, true) }">
            <span v-if="blackHint(key.pitch)?.mod" class="bkey__mod">{{ blackHint(key.pitch)?.mod }}</span>
            <span class="bkey__char">{{ blackHint(key.pitch)?.char }}</span>
          </span>
          <span v-if="nameOf(key.pitch)" class="bkey__name" :style="{ color: keyColor(key.pitch, true) }">
            {{ nameOf(key.pitch) }}
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

/* 编辑提示：贴在顶盖正中，只在自定义键位时出现 */
.piano-band__hint {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: calc(100% - 300px);
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11.5px;
  letter-spacing: 0.04em;
  color: #e5c79a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
}

.piano-band__hint::before {
  content: '';
  flex: 0 0 auto;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #cfa46a;
  box-shadow: 0 0 0 3px rgba(207, 164, 106, 0.16);
  animation: bandHintPulse 1.4s ease-in-out infinite;
}

@keyframes bandHintPulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}

@media (max-width: 900px) {
  .piano-band__hint {
    display: none;
  }
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

/* 编辑键位：整块琴键可点选 */
.piano-wrap.is-editing .wkey,
.piano-wrap.is-editing .bkey {
  cursor: crosshair;
}

.wkey.is-target {
  outline: 2px solid #cfa46a;
  outline-offset: -3px;
}

.bkey.is-target {
  outline: 2px solid #cfa46a;
  outline-offset: -2px;
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

/* 「下一个要弹的音」黄提示：键面染暖黄 + 底部一圈黄光，按下态优先 */
.wkey.is-hint:not(.is-pressed) {
  background: linear-gradient(#fff6cf 10%, #ffe98d 92%, #f7d468 93%, #fff6cf 97%);
  box-shadow: inset 0 -16px 14px -10px rgba(244, 197, 66, 0.85);
}

.wkey.is-hint.is-pressed {
  box-shadow: inset 0 -16px 14px -10px rgba(244, 197, 66, 0.55);
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

/* 黑键的黄提示：暗金键体 + 黄色底边，在黑漆面上也看得清 */
.bkey.is-hint:not(.is-pressed) {
  background: linear-gradient(-20deg, #6f5f1d, #4a3e10, #6f5f1d);
  border-bottom-color: #e8c447;
  box-shadow:
    inset 0 -1px 2px rgba(255, 236, 150, 0.45),
    0 2px 3px rgba(0, 0, 0, 0.4);
}

/* ---------------------------------------------------------------- 标注 */
/* 键宽 2.775% 在 1440 视口下约 35px，标注用 12px 才不会挤成一团 */
.wkey__tip {
  position: absolute;
  left: 0;
  bottom: 7px;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  pointer-events: none;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}

.wkey__key {
  font-size: 13.5px;
  line-height: 1;
  letter-spacing: 0.02em;
  opacity: 0.62;
}

.wkey__note {
  font-size: 13.5px;
  line-height: 1;
  letter-spacing: 0.01em;
}

/* 黑键宽约 25px，"⇧Z" 单行会顶到边框：修饰键与字符分两行 */
.bkey__tip {
  position: absolute;
  top: 8px;
  left: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  line-height: 1;
  pointer-events: none;
  white-space: nowrap;
}

.bkey__mod {
  font-size: 10px;
  opacity: 0.55;
}

.bkey__char {
  font-size: 12.5px;
}

.bkey__name {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 9px;
  text-align: center;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 10px;
  line-height: 1;
  opacity: 0.6;
  white-space: nowrap;
  pointer-events: none;
}
</style>
