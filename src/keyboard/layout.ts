import { isBlackKey, MAX_MIDI, MIN_MIDI } from '@/audio/note';

/**
 * 88 键几何布局。
 *
 * 尺寸严格对齐 AutoPiano（WarpPrism/AutoPiano 的 `.wkey` / `.bkey` 数值）：
 * - 白键宽 = 视口宽度的 2.775%，36 个白键正好填满 99.9%（即 5 个八度 C2–C7 的视口）；
 * - 黑键宽 = 10% × (.bkey-wrap 20%) = 视口宽度的 2%，即白键的 2 / 2.775；
 * - 黑键高 = 白键的 70%。
 *
 * 88 键共 52 个白键，因此键床总宽 = 52 × 2.775% = 144.3% 视口宽，
 * 由外层横向滚动容器提供 5 八度视口 —— 绝不能把 2.775% 直接套在 52 键上（会变成 1.92%）。
 */

/** 一个 5 八度视口内的白键数量：C2–C7 = 36 */
export const WKEY_VIEWPORT_COUNT = 36;

/** 白键宽度，单位：视口宽度百分比（AutoPiano 原值） */
export const WKEY_WIDTH_PERCENT = 2.775;

/** 88 键的白键总数 */
export const WHITE_KEY_COUNT = 52;

/** 黑键宽度相对白键的比例：2% / 2.775% */
export const BLACK_WIDTH_RATIO = 2 / WKEY_WIDTH_PERCENT;

/** 黑键高度相对白键的比例（AutoPiano `.bkey { height: 70% }`） */
export const BLACK_HEIGHT_RATIO = 0.7;

/** 键床总宽，单位：视口宽度百分比 */
export const KEYBED_WIDTH_PERCENT = WHITE_KEY_COUNT * WKEY_WIDTH_PERCENT;

export interface KeyLayout {
  pitch: number;
  isBlack: boolean;
  /** 白键序号 0–51；黑键为其左侧白键的序号 */
  whiteIndex: number;
  /** 左边界，单位=白键宽度 */
  left: number;
  /** 宽度，单位=白键宽度 */
  width: number;
}

export interface PianoViewport {
  id: 'low' | 'mid' | 'high';
  label: string;
  /** 展示用的音域文案 */
  span: string;
  /** 视口最左侧的音（用于决定滚动位置） */
  startPitch: number;
}

/** 三档 5 八度视口，起点分别对准 C1 / C2 / C3 */
export const PIANO_VIEWPORTS: readonly PianoViewport[] = [
  { id: 'low', label: '低音区', span: 'C1–C5', startPitch: 24 },
  { id: 'mid', label: '中音区', span: 'C2–C7', startPitch: 36 },
  { id: 'high', label: '高音区', span: 'C3–C8', startPitch: 48 },
];

export const DEFAULT_VIEWPORT_ID: PianoViewport['id'] = 'mid';

/**
 * 生成 88 键的几何布局，坐标以「白键宽度」为单位。
 * 黑键严格居中于相邻两白键的交界（与 AutoPiano 一致，不做额外偏移）。
 */
export function buildKeyboardLayout(): KeyLayout[] {
  const layout: KeyLayout[] = [];
  let whiteCount = 0;

  for (let pitch = MIN_MIDI; pitch <= MAX_MIDI; pitch += 1) {
    if (isBlackKey(pitch)) {
      // 黑键左边界 = 交界处（whiteCount）- 半个黑键宽
      layout.push({
        pitch,
        isBlack: true,
        whiteIndex: whiteCount - 1,
        left: whiteCount - BLACK_WIDTH_RATIO / 2,
        width: BLACK_WIDTH_RATIO,
      });
    } else {
      layout.push({ pitch, isBlack: false, whiteIndex: whiteCount, left: whiteCount, width: 1 });
      whiteCount += 1;
    }
  }

  return layout;
}

/** 音高落在第几个白键上（黑键返回其左侧白键的序号） */
export function whiteIndexOf(pitch: number): number {
  let index = 0;
  for (let p = MIN_MIDI; p < pitch; p += 1) {
    if (!isBlackKey(p)) index += 1;
  }
  return index;
}

/** 视口最左侧应滚到的位置，单位=白键宽度 */
export function viewportScrollUnits(startPitch: number): number {
  const index = whiteIndexOf(startPitch);
  const maxUnits = WHITE_KEY_COUNT - WKEY_VIEWPORT_COUNT;
  return Math.min(Math.max(index, 0), maxUnits);
}
