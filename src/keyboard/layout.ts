import { isBlackKey, MAX_MIDI, MIN_MIDI } from '@/audio/note';

/** 88 键 = 52 白键 + 36 黑键 */
export const WHITE_KEY_COUNT = 52;

/** 黑白键宽度比为 7:5 */
export const BLACK_WIDTH_RATIO = 5 / 7;

/** 黑键相对「两白键交界处」的微调量，单位=白键宽度，仅影响观感 */
const BLACK_CENTRE_OFFSET: Record<number, number> = {
  1: -0.04, // C#
  3: 0.04, // D#
  6: -0.06, // F#
  8: 0, // G#
  10: 0.06, // A#
};

export interface KeyLayout {
  pitch: number;
  isBlack: boolean;
  /** 白键序号 0–51，黑键为 -1 */
  whiteIndex: number;
  /** 左边界，单位=白键宽度 */
  left: number;
  /** 宽度，单位=白键宽度 */
  width: number;
}

/**
 * 生成 88 键的几何布局。
 * 坐标以「白键宽度」为单位，渲染时再换算成百分比，因此可以自适应任意屏宽。
 */
export function buildKeyboardLayout(): KeyLayout[] {
  const layout: KeyLayout[] = [];
  let whiteCount = 0;

  for (let pitch = MIN_MIDI; pitch <= MAX_MIDI; pitch += 1) {
    if (isBlackKey(pitch)) {
      const pc = pitch % 12;
      const centre = whiteCount + (BLACK_CENTRE_OFFSET[pc] ?? 0);
      layout.push({
        pitch,
        isBlack: true,
        whiteIndex: -1,
        left: centre - BLACK_WIDTH_RATIO / 2,
        width: BLACK_WIDTH_RATIO,
      });
    } else {
      layout.push({ pitch, isBlack: false, whiteIndex: whiteCount, left: whiteCount, width: 1 });
      whiteCount += 1;
    }
  }

  return layout;
}
