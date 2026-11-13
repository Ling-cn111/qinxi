import { describe, expect, it } from 'vitest';
import {
  DEFAULT_KEYMAP_PRESET,
  charForCode,
  isBindableCode,
  KEYMAP_PRESETS,
  PianoKeyMap,
  resolveBinding,
} from '@/keyboard/keyMap';
import { colorForPitch, octaveColor, octaveOf, octavePalette } from '@/keyboard/octaveColors';

describe('钢琴式方案（默认）', () => {
  const map = new PianoKeyMap({ preset: 'piano' });

  it('默认方案就是钢琴式', () => {
    expect(DEFAULT_KEYMAP_PRESET).toBe('piano');
    expect(map.presetId).toBe('piano');
  });

  it('低八度：Z 排是白键，S/D/G/H/J 是它们之间的黑键', () => {
    expect(map.lookup('KeyZ', 'none')?.pitch).toBe(48); // C3
    expect(map.lookup('KeyX', 'none')?.pitch).toBe(50);
    expect(map.lookup('KeyM', 'none')?.pitch).toBe(59); // B3
    expect(map.lookup('KeyS', 'none')?.pitch).toBe(49); // C#3
    expect(map.lookup('KeyD', 'none')?.pitch).toBe(51); // D#3
    expect(map.lookup('KeyG', 'none')?.pitch).toBe(54); // F#3
    expect(map.lookup('KeyH', 'none')?.pitch).toBe(56); // G#3
    expect(map.lookup('KeyJ', 'none')?.pitch).toBe(58); // A#3
  });

  it('高八度：Q 排是白键，数字排 2/3/5/6/7 是黑键', () => {
    expect(map.lookup('KeyQ', 'none')?.pitch).toBe(60); // C4
    expect(map.lookup('KeyU', 'none')?.pitch).toBe(71); // B4
    expect(map.lookup('Digit2', 'none')?.pitch).toBe(61);
    expect(map.lookup('Digit3', 'none')?.pitch).toBe(63);
    expect(map.lookup('Digit5', 'none')?.pitch).toBe(66);
    expect(map.lookup('Digit6', 'none')?.pitch).toBe(68);
    expect(map.lookup('Digit7', 'none')?.pitch).toBe(70);
  });

  it('通篇没有修饰键：白键黑键可以同时按', () => {
    expect(map.bindings.every((item) => item.modifier === 'none')).toBe(true);
  });

  it('音域是 C3–B4 共 24 个半音', () => {
    expect(map.pitches).toHaveLength(24);
    expect(map.pitches[0]).toBe(48);
    expect(map.pitches[map.pitches.length - 1]).toBe(71);
  });

  it('每个黑键都紧跟在左侧白键上方（高一个半音）', () => {
    const pairs: ReadonlyArray<readonly [string, string]> = [
      ['KeyZ', 'KeyS'],
      ['KeyX', 'KeyD'],
      ['KeyV', 'KeyG'],
      ['KeyB', 'KeyH'],
      ['KeyN', 'KeyJ'],
    ];
    for (const [white, black] of pairs) {
      expect(map.lookup(black, 'none')!.pitch).toBe(map.lookup(white, 'none')!.pitch + 1);
    }
  });
});

describe('宽音域方案', () => {
  const map = new PianoKeyMap({ preset: 'wide' });

  it('四排铺满 C2–C8，Shift 取黑键', () => {
    expect(map.pitches).toHaveLength(73);
    expect(map.lookup('KeyG', 'none')?.pitch).toBe(60);
    expect(map.lookup('KeyG', 'shift')?.pitch).toBe(61);
    expect(map.lookup('KeyZ', 'alt')).toBeUndefined();
  });

  it('方案元数据齐全（名字、音域、说明）', () => {
    expect(KEYMAP_PRESETS).toHaveLength(2);
    for (const item of KEYMAP_PRESETS) {
      expect(item.name.length).toBeGreaterThan(0);
      expect(item.short.length).toBeGreaterThan(0);
      expect(item.range).toMatch(/C\d–[BC]\d/);
      expect(item.desc.length).toBeGreaterThan(10);
    }
  });
});

describe('小键盘', () => {
  it('数字、运算符可绑定，NumLock 不行', () => {
    expect(isBindableCode('Numpad5')).toBe(true);
    expect(isBindableCode('NumpadAdd')).toBe(true);
    expect(isBindableCode('NumLock')).toBe(false);
  });

  it('键帽字符与标签带 N 前缀', () => {
    expect(charForCode('Numpad5')).toBe('5');
    expect(charForCode('NumpadAdd')).toBe('+');
    expect(charForCode('NumpadDecimal')).toBe('.');
    const map = new PianoKeyMap({
      preset: 'piano',
      custom: [{ code: 'Numpad5', modifier: 'none', pitch: 61 }],
    });
    expect(map.lookup('Numpad5', 'none')?.label).toBe('N5');
    expect(map.lookup('Numpad5', 'none')?.pitch).toBe(61);
  });

  it('绑到小键盘后，主键区同音的旧绑定让位', () => {
    const map = new PianoKeyMap({
      preset: 'piano',
      custom: [{ code: 'Numpad5', modifier: 'none', pitch: 61 }],
    });
    // C#4 在高八度，原来由数字 2 承担
    expect(map.lookup('Digit2', 'none')).toBeUndefined();
    expect(map.labelFor(61)).toBe('N5');
  });

  it('主键区与小键盘可以绑同一个音吗：不能，音高唯一', () => {
    const map = new PianoKeyMap({
      preset: 'piano',
      custom: [
        { code: 'Numpad5', modifier: 'none', pitch: 61 },
        { code: 'KeyS', modifier: 'none', pitch: 62 },
      ],
    });
    expect(map.bindingsForPitch(61)).toHaveLength(1);
    expect(map.bindingsForPitch(61)[0].code).toBe('Numpad5');
  });
});

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
  it('钢琴式方案没有 Shift 绑定，误按 Shift 仍能出声', () => {
    const map = new PianoKeyMap({ preset: 'piano' });
    expect(resolveBinding(map, 'KeyZ', 'shift')?.pitch).toBe(48);
    expect(resolveBinding(map, 'KeyZ', 'shift')?.modifier).toBe('none');
  });

  it('有精确绑定时不回落', () => {
    const map = new PianoKeyMap({ preset: 'wide' });
    expect(resolveBinding(map, 'KeyG', 'shift')?.pitch).toBe(61);
    // 宽音域里 E 上方没有黑键 → 回落到 E 本身（E5）
    expect(resolveBinding(map, 'KeyE', 'shift')?.pitch).toBe(76);
  });

  it('没有绑定就是没有绑定', () => {
    const map = new PianoKeyMap({ preset: 'piano' });
    expect(resolveBinding(map, 'KeyP', 'none')).toBeUndefined();
  });
});
