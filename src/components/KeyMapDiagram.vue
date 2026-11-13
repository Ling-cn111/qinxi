<script setup lang="ts">
import { computed } from 'vue';
import { midiToName } from '@/audio/note';
import type { PianoKeyMap } from '@/keyboard/keyMap';

/**
 * 电脑键盘映射图。
 *
 * 每排 15 个单位宽（1u = 1/15），与实际键盘的排列一致；
 * 有映射的键显示音名（或键盘字符），无映射的修饰键只显示键名并压暗；
 * 演奏时对应键帽会点亮 —— 这是"哪个键弹哪个音"的直观答案。
 */
const props = defineProps<{
  keyMap: PianoKeyMap;
  pressed: ReadonlySet<number>;
  /** 被用户自定义过的音高，键帽上单独标色 */
  custom: ReadonlySet<number>;
  /** 键帽主标签：键盘字符 / 音名 */
  mode: 'char' | 'note';
}>();

interface CapKey {
  code: string;
  /** 无映射时显示的键名 */
  caption: string;
  /** 宽度，单位 u */
  units: number;
}

const ROWS: readonly (readonly CapKey[])[] = [
  [
    { code: 'Backquote', caption: '`', units: 1 },
    { code: 'Digit1', caption: '1', units: 1 },
    { code: 'Digit2', caption: '2', units: 1 },
    { code: 'Digit3', caption: '3', units: 1 },
    { code: 'Digit4', caption: '4', units: 1 },
    { code: 'Digit5', caption: '5', units: 1 },
    { code: 'Digit6', caption: '6', units: 1 },
    { code: 'Digit7', caption: '7', units: 1 },
    { code: 'Digit8', caption: '8', units: 1 },
    { code: 'Digit9', caption: '9', units: 1 },
    { code: 'Digit0', caption: '0', units: 1 },
    { code: 'Minus', caption: '-', units: 1 },
    { code: 'Equal', caption: '=', units: 1 },
    { code: 'Backspace', caption: 'Backspace', units: 2 },
  ],
  [
    { code: 'Tab', caption: 'Tab', units: 1.5 },
    { code: 'KeyQ', caption: 'Q', units: 1 },
    { code: 'KeyW', caption: 'W', units: 1 },
    { code: 'KeyE', caption: 'E', units: 1 },
    { code: 'KeyR', caption: 'R', units: 1 },
    { code: 'KeyT', caption: 'T', units: 1 },
    { code: 'KeyY', caption: 'Y', units: 1 },
    { code: 'KeyU', caption: 'U', units: 1 },
    { code: 'KeyI', caption: 'I', units: 1 },
    { code: 'KeyO', caption: 'O', units: 1 },
    { code: 'KeyP', caption: 'P', units: 1 },
    { code: 'BracketLeft', caption: '[', units: 1 },
    { code: 'BracketRight', caption: ']', units: 1 },
    { code: 'Backslash', caption: '\\', units: 1.5 },
  ],
  [
    { code: 'CapsLock', caption: 'Caps', units: 1.75 },
    { code: 'KeyA', caption: 'A', units: 1 },
    { code: 'KeyS', caption: 'S', units: 1 },
    { code: 'KeyD', caption: 'D', units: 1 },
    { code: 'KeyF', caption: 'F', units: 1 },
    { code: 'KeyG', caption: 'G', units: 1 },
    { code: 'KeyH', caption: 'H', units: 1 },
    { code: 'KeyJ', caption: 'J', units: 1 },
    { code: 'KeyK', caption: 'K', units: 1 },
    { code: 'KeyL', caption: 'L', units: 1 },
    { code: 'Semicolon', caption: ';', units: 1 },
    { code: 'Quote', caption: "'", units: 1 },
    { code: 'Enter', caption: 'Enter', units: 2.25 },
  ],
  [
    { code: 'ShiftLeft', caption: 'Shift', units: 2.25 },
    { code: 'KeyZ', caption: 'Z', units: 1 },
    { code: 'KeyX', caption: 'X', units: 1 },
    { code: 'KeyC', caption: 'C', units: 1 },
    { code: 'KeyV', caption: 'V', units: 1 },
    { code: 'KeyB', caption: 'B', units: 1 },
    { code: 'KeyN', caption: 'N', units: 1 },
    { code: 'KeyM', caption: 'M', units: 1 },
    { code: 'Comma', caption: ',', units: 1 },
    { code: 'Period', caption: '.', units: 1 },
    { code: 'Slash', caption: '/', units: 1 },
    { code: 'ShiftRight', caption: 'Shift', units: 2.75 },
  ],
  [
    { code: 'ControlLeft', caption: 'Ctrl', units: 1.25 },
    { code: 'MetaLeft', caption: 'Win', units: 1.25 },
    { code: 'AltLeft', caption: 'Alt', units: 1.25 },
    { code: 'Space', caption: '', units: 6.25 },
    { code: 'AltRight', caption: 'Alt', units: 1.25 },
    { code: 'MetaRight', caption: 'Win', units: 1.25 },
    { code: 'ContextMenu', caption: 'Menu', units: 1.25 },
    { code: 'ControlRight', caption: 'Ctrl', units: 1.25 },
  ],
];

interface CapInfo {
  text: string;
  mapped: boolean;
  custom: boolean;
}

const infoOf = (key: CapKey): CapInfo => {
  const binding = props.keyMap.lookup(key.code, 'none');
  if (!binding) return { text: key.caption, mapped: false, custom: false };
  return {
    text: props.mode === 'char' ? binding.char.toUpperCase() : midiToName(binding.pitch),
    mapped: true,
    custom: props.custom.has(binding.pitch),
  };
};

/** 当前按下的音高 → 物理键位（黑键取 Shift 组合所在的键） */
const downCodes = computed(() => {
  const codes = new Set<string>();
  for (const pitch of props.pressed) {
    const list = props.keyMap.bindingsForPitch(pitch);
    const binding = list.find((item) => item.modifier === 'none') ?? list[0];
    if (binding) codes.add(binding.code);
  }
  return codes;
});
</script>

<template>
  <div class="kbd" role="img" aria-label="电脑键盘键位映射图">
    <div v-for="(row, index) in ROWS" :key="index" class="kbd__row">
      <span
        v-for="key in row"
        :key="key.code"
        class="cap"
        :class="{
          'cap--mapped': infoOf(key).mapped,
          'cap--modifier': !infoOf(key).mapped,
          'cap--custom': infoOf(key).custom,
          'is-down': downCodes.has(key.code),
        }"
        :style="{ flexGrow: key.units }"
      >
        {{ infoOf(key).text }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.kbd {
  width: 100%;
  max-width: 1040px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 16px;
  background: #1b1b1b;
  border: 1px solid rgba(255, 255, 255, 0.07);
}

.kbd__row {
  display: flex;
  gap: 5px;
}

.cap {
  flex: 0 0 auto;
  flex-basis: 0;
  min-width: 0;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 2px;
  border-radius: 5px;
  background: #2b2b2b;
  box-shadow:
    inset 0 -2px 0 rgba(0, 0, 0, 0.55),
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    0 1px 0 rgba(0, 0, 0, 0.5);
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11.5px;
  letter-spacing: 0.02em;
  color: rgba(231, 227, 220, 0.32);
  overflow: hidden;
  transition:
    background 90ms linear,
    color 90ms linear;
}

/* 有映射的键：键帽更亮，音名清晰可读 */
.cap--mapped {
  background: #353535;
  color: #ded9cf;
}

/* 被自定义过的键：暖色，和默认键位区分开 */
.cap--custom {
  color: #e5c79a;
  box-shadow:
    inset 0 -2px 0 rgba(0, 0, 0, 0.55),
    inset 0 -1px 0 rgba(207, 164, 106, 0.7),
    0 1px 0 rgba(0, 0, 0, 0.5);
}

.cap.is-down {
  background: #b98d55;
  color: #1a1a1a;
  box-shadow:
    inset 0 2px 0 rgba(0, 0, 0, 0.35),
    0 0 0 1px rgba(255, 255, 255, 0.1);
}

@media (max-width: 900px) {
  .kbd {
    padding: 10px;
    gap: 4px;
  }

  .kbd__row {
    gap: 3px;
  }

  .cap {
    height: 26px;
    font-size: 9.5px;
    border-radius: 4px;
  }
}
</style>
