import { describe, expect, it } from 'vitest';
import { PianoKeyMap, resolveBinding } from '@/keyboard/keyMap';
import { colorForPitch, octaveColor, octaveOf, octavePalette } from '@/keyboard/octaveColors';

describe('八度配色', () => {
  it('八度号按 C 划分', () => {
    expect(octaveOf(48)).toBe(3); // C3
    expect(octaveOf(59)).toBe(3); // B3
    expect(octaveOf(60)).toBe(4); // C4
    expect(octaveOf(21)).toBe(0); // A0
    expect(octaveOf(108)).toBe(8); // C8
  });

  it('同一组音阶同一个颜色，换组换色', () => {
    expect(octaveColor(48)).toEqual(octaveColor(59));
    expect(octaveColor(48)).not.toEqual(octaveColor(60));
    expect(octaveColor(60)).not.toEqual(octaveColor(72));
  });

  it('白键深色、黑键浅色，两者不能相同', () => {
    for (const pitch of [48, 61, 60, 64]) {
      expect(colorForPitch(pitch, true)).not.toBe(colorForPitch(pitch, false));
    }
  });

  it('调色板本身没有重复色，超出音域的八度被夹住', () => {
    const palette = octavePalette();
    expect(new Set(palette.map((c) => c.ink)).size).toBe(palette.length);
    expect(new Set(palette.map((c) => c.bright)).size).toBe(palette.length);
    expect(octaveColor(12)).toEqual(palette[0]);
    expect(octaveColor(120)).toEqual(palette[palette.length - 1]);
  });
});

describe('修饰键回落', () => {
  it('默认布局没有 Shift 绑定，误按 Shift 仍能出声', () => {
    const map = new PianoKeyMap();
    expect(resolveBinding(map, 'KeyQ', 'shift')?.pitch).toBe(48);
    expect(resolveBinding(map, 'KeyQ', 'shift')?.modifier).toBe('none');
  });

  it('有精确绑定时不回落', () => {
    const map = new PianoKeyMap({
      custom: [{ code: 'KeyQ', modifier: 'shift', pitch: 61 }],
    });
    expect(resolveBinding(map, 'KeyQ', 'shift')?.pitch).toBe(61);
  });

  it('没有绑定就是没有绑定', () => {
    const map = new PianoKeyMap();
    expect(resolveBinding(map, 'KeyA', 'none')).toBeUndefined();
    expect(resolveBinding(map, 'KeyA', 'shift')).toBeUndefined();
  });
});
