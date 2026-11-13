import { describe, expect, it } from 'vitest';
import {
  BLACK_HEIGHT_RATIO,
  BLACK_WIDTH_RATIO,
  buildKeyboardLayout,
  KEYBED_WIDTH_PERCENT,
  PIANO_VIEWPORTS,
  viewportScrollUnits,
  WHITE_KEY_COUNT,
  WKEY_WIDTH_PERCENT,
  whiteIndexOf,
  WKEY_VIEWPORT_COUNT,
} from '@/keyboard/layout';
import { isBlackKey, MAX_MIDI, MIN_MIDI } from '@/audio/note';

const layout = buildKeyboardLayout();

describe('AutoPiano 数值对齐', () => {
  it('白键宽度就是 AutoPiano 的 2.775%', () => {
    expect(WKEY_WIDTH_PERCENT).toBe(2.775);
    // 36 个白键 = 99.9%，与 AutoPiano 一致
    expect(WKEY_WIDTH_PERCENT * WKEY_VIEWPORT_COUNT).toBeCloseTo(99.9, 6);
  });

  it('键床宽度 = 52 × 2.775% = 144.3%（视口占比，不是 52 键平分视口）', () => {
    expect(KEYBED_WIDTH_PERCENT).toBeCloseTo(144.3, 6);
    // 单键换算回视口宽度必须仍是 2.775%，而不是 88 键下的 1.92%
    const perKeyInViewport = KEYBED_WIDTH_PERCENT / WHITE_KEY_COUNT;
    expect(perKeyInViewport).toBeCloseTo(2.775, 6);
    expect(perKeyInViewport).toBeGreaterThan(1.92);
  });

  it('黑键宽 = 视口的 2%（AutoPiano .bkey 10% × .bkey-wrap 20%）', () => {
    expect(BLACK_WIDTH_RATIO).toBeCloseTo(2 / 2.775, 6);
    const blackInViewport = (KEYBED_WIDTH_PERCENT / WHITE_KEY_COUNT) * BLACK_WIDTH_RATIO;
    expect(blackInViewport).toBeCloseTo(2, 6);
  });

  it('黑键高 = 白键的 70%（AutoPiano .bkey height:70%）', () => {
    expect(BLACK_HEIGHT_RATIO).toBe(0.7);
  });
});

describe('buildKeyboardLayout', () => {
  it('覆盖 88 个键（21–108）且不重不漏', () => {
    expect(layout).toHaveLength(MAX_MIDI - MIN_MIDI + 1);
    const pitches = layout.map((key) => key.pitch);
    expect(pitches).toEqual(Array.from({ length: 88 }, (_, i) => MIN_MIDI + i));
  });

  it('52 个白键、36 个黑键', () => {
    const whites = layout.filter((key) => !key.isBlack);
    const blacks = layout.filter((key) => key.isBlack);
    expect(whites).toHaveLength(WHITE_KEY_COUNT);
    expect(blacks).toHaveLength(36);
    expect(whites[0].pitch).toBe(21);
    expect(whites[WHITE_KEY_COUNT - 1].pitch).toBe(108);
  });

  it('黑白判定与音高一致', () => {
    for (const key of layout) {
      expect(key.isBlack).toBe(isBlackKey(key.pitch));
    }
  });

  it('黑键宽度等于 BLACK_WIDTH_RATIO 个白键', () => {
    for (const key of layout) {
      expect(key.width).toBeCloseTo(key.isBlack ? BLACK_WIDTH_RATIO : 1, 10);
    }
  });

  it('黑键严格居中于相邻两白键交界', () => {
    const whitesByPitch = new Map(
      layout.filter((key) => !key.isBlack).map((key) => [key.pitch, key] as const),
    );

    for (const black of layout.filter((key) => key.isBlack)) {
      const lower = whitesByPitch.get(black.pitch - 1);
      const upper = whitesByPitch.get(black.pitch + 1);
      expect(lower, `缺少 ${black.pitch - 1}`).toBeDefined();
      expect(upper, `缺少 ${black.pitch + 1}`).toBeDefined();

      const centre = black.left + black.width / 2;
      // 中心正好落在两白键的交界（upper.left）上
      expect(centre).toBeCloseTo(upper!.left, 10);
      expect(black.left).toBeLessThan(lower!.left + 1);
      expect(black.left + black.width).toBeGreaterThan(upper!.left);
    }
  });

  it('白键左边界随序号单调递增，占满 52 个单位', () => {
    const whites = layout.filter((key) => !key.isBlack);
    whites.forEach((key, index) => {
      expect(key.whiteIndex).toBe(index);
      expect(key.left).toBeCloseTo(index, 10);
    });
    expect(whites[WHITE_KEY_COUNT - 1].left + 1).toBeCloseTo(WHITE_KEY_COUNT, 10);
  });
});

describe('5 八度视口', () => {
  it('三档视口分别对准 C1 / C2 / C3', () => {
    expect(PIANO_VIEWPORTS.map((item) => item.id)).toEqual(['low', 'mid', 'high']);
    expect(PIANO_VIEWPORTS.map((item) => item.startPitch)).toEqual([24, 36, 48]);
    expect(PIANO_VIEWPORTS.map((item) => item.span)).toEqual(['C1–C5', 'C2–C7', 'C3–C8']);
  });

  it('C1 / C2 / C3 的白键序号是 2 / 9 / 16', () => {
    expect(whiteIndexOf(24)).toBe(2);
    expect(whiteIndexOf(36)).toBe(9);
    expect(whiteIndexOf(48)).toBe(16);
    expect(whiteIndexOf(108)).toBe(51);
  });

  it('滚动单位等于起点白键序号，并被 52-36=16 封顶', () => {
    expect(viewportScrollUnits(24)).toBe(2);
    expect(viewportScrollUnits(36)).toBe(9);
    expect(viewportScrollUnits(48)).toBe(16);
    // 再往后没有意义：视口只有 36 键宽，最多滑到第 16 个白键
    expect(viewportScrollUnits(108)).toBe(WHITE_KEY_COUNT - WKEY_VIEWPORT_COUNT);
  });

  it('中音区刚好覆盖 C2–C7 共 36 个白键', () => {
    const start = viewportScrollUnits(36);
    expect(start + WKEY_VIEWPORT_COUNT - 1).toBe(whiteIndexOf(96)); // C7
  });
});
