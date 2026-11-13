import { describe, expect, it } from 'vitest';
import {
  BASE_START_MIDI,
  charForCode,
  isBindableCode,
  PianoKeyMap,
  type CustomBinding,
} from '@/keyboard/keyMap';

describe('默认键位不受自定义影响', () => {
  it('没有自定义时仍覆盖 C2–C8 共 73 个音', () => {
    const map = new PianoKeyMap();
    expect(map.customCount).toBe(0);
    expect(map.pitches).toHaveLength(73);
    expect(map.lookup('KeyG', 'none')?.pitch).toBe(60);
  });

  it('非法自定义被忽略：保留键、越界音高、非整数音高', () => {
    const custom: CustomBinding[] = [
      { code: 'ShiftLeft', modifier: 'none', pitch: 60 },
      { code: 'KeyQ', modifier: 'none', pitch: 200 },
      { code: 'KeyW', modifier: 'none', pitch: 60.5 },
    ];
    const map = new PianoKeyMap(BASE_START_MIDI, custom);
    expect(map.customCount).toBe(0);
    expect(map.lookup('KeyQ', 'none')?.pitch).toBe(72);
  });
});

describe('自定义绑定', () => {
  it('把白键改到别的音：原音的默认键位让出来', () => {
    const map = new PianoKeyMap(BASE_START_MIDI, [{ code: 'KeyQ', modifier: 'none', pitch: 60 }]);
    expect(map.lookup('KeyQ', 'none')?.pitch).toBe(60);
    // C4 原来的 G 键不再绑定
    expect(map.lookup('KeyG', 'none')).toBeUndefined();
    // Q 原来那个音（C5 = 72）整组让位
    expect(map.bindingsForPitch(72)).toHaveLength(0);
    expect(map.customCount).toBe(1);
    expect(map.customPitches.has(60)).toBe(true);
  });

  it('只改 Shift 组合时，白键本体继续可用', () => {
    const map = new PianoKeyMap(BASE_START_MIDI, [{ code: 'KeyG', modifier: 'shift', pitch: 63 }]);
    expect(map.lookup('KeyG', 'none')?.pitch).toBe(60);
    expect(map.lookup('KeyG', 'shift')?.pitch).toBe(63);
    expect(map.labelFor(63)).toBe('⇧G');
  });

  it('同一物理键的不同修饰键互不覆盖', () => {
    const map = new PianoKeyMap(BASE_START_MIDI, [
      { code: 'KeyG', modifier: 'none', pitch: 60 },
      { code: 'KeyG', modifier: 'shift', pitch: 61 },
    ]);
    expect(map.lookup('KeyG', 'none')?.pitch).toBe(60);
    expect(map.lookup('KeyG', 'shift')?.pitch).toBe(61);
    expect(map.customCount).toBe(2);
  });

  it('可以绑到默认布局之外的键（- 号键）', () => {
    const map = new PianoKeyMap(BASE_START_MIDI, [{ code: 'Minus', modifier: 'none', pitch: 61 }]);
    const binding = map.lookup('Minus', 'none');
    expect(binding?.pitch).toBe(61);
    expect(binding?.char).toBe('-');
    expect(binding?.label).toBe('-');
    // 原来的 C#4（⇧G）也已让位
    expect(map.lookup('KeyG', 'shift')).toBeUndefined();
  });

  it('把音绑到 Shift 组合时，标签带 ⇧ 前缀', () => {
    const map = new PianoKeyMap(BASE_START_MIDI, [{ code: 'Minus', modifier: 'shift', pitch: 61 }]);
    expect(map.lookup('Minus', 'shift')?.label).toBe('⇧-');
  });
});

describe('物理键工具', () => {
  it('修饰键与系统键不可绑定', () => {
    expect(isBindableCode('ShiftLeft')).toBe(false);
    expect(isBindableCode('ControlRight')).toBe(false);
    expect(isBindableCode('Escape')).toBe(false);
    expect(isBindableCode('CapsLock')).toBe(false);
    expect(isBindableCode('KeyG')).toBe(true);
    expect(isBindableCode('Minus')).toBe(true);
    expect(isBindableCode('Space')).toBe(true);
  });

  it('键帽字符覆盖字母、数字、标点与未知键', () => {
    expect(charForCode('KeyG')).toBe('g');
    expect(charForCode('Digit4')).toBe('4');
    expect(charForCode('Comma')).toBe(',');
    expect(charForCode('Semicolon')).toBe(';');
    expect(charForCode('Backquote')).toBe('`');
    expect(charForCode('F7')).toBe('f7');
  });
});
