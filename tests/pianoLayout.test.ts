import { describe, expect, it } from 'vitest';
import { BLACK_WIDTH_RATIO, buildKeyboardLayout, WHITE_KEY_COUNT } from '@/keyboard/layout';
import { isBlackKey, MAX_MIDI, MIN_MIDI } from '@/audio/note';

const layout = buildKeyboardLayout();

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

  it('黑键宽度为白键的 5/7', () => {
    for (const key of layout) {
      expect(key.width).toBeCloseTo(key.isBlack ? BLACK_WIDTH_RATIO : 1, 10);
    }
  });

  it('黑键夹在相邻两个白键之间，且同时压住两者', () => {
    const whitesByPitch = new Map(
      layout.filter((key) => !key.isBlack).map((key) => [key.pitch, key] as const),
    );

    for (const black of layout.filter((key) => key.isBlack)) {
      const lower = whitesByPitch.get(black.pitch - 1);
      const upper = whitesByPitch.get(black.pitch + 1);
      expect(lower, `缺少 ${black.pitch - 1}`).toBeDefined();
      expect(upper, `缺少 ${black.pitch + 1}`).toBeDefined();

      const centre = black.left + black.width / 2;
      const lowerCentre = lower!.left + 0.5;
      const upperCentre = upper!.left + 0.5;
      // 中心落在两个白键中心之间
      expect(centre).toBeGreaterThan(lowerCentre);
      expect(centre).toBeLessThan(upperCentre);
      // 黑键左沿压住左侧白键，右沿压住右侧白键
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
