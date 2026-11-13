import { describe, expect, it } from 'vitest';
import {
  charForCode,
  isBindableCode,
  PianoKeyMap,
  type CustomBinding,
} from '@/keyboard/keyMap';

describe('默认键位不受自定义影响', () => {
  it('没有改动时仍是 C2–B6 的 35 个白键', () => {
    const map = new PianoKeyMap();
    expect(map.customCount).toBe(0);
    expect(map.pitches).toHaveLength(35);
    expect(map.lookup('KeyQ', 'none')?.pitch).toBe(60);
  });

  it('非法自定义被忽略：保留键、越界音高、非整数音高', () => {
    const custom: CustomBinding[] = [
      { code: 'ShiftLeft', modifier: 'none', pitch: 60 },
      { code: 'KeyQ', modifier: 'none', pitch: 200 },
      { code: 'KeyW', modifier: 'none', pitch: 60.5 },
    ];
    const map = new PianoKeyMap({ custom });
    expect(map.customCount).toBe(0);
    expect(map.lookup('KeyQ', 'none')?.pitch).toBe(60);
  });
});

describe('自定义绑定', () => {
  it('把音绑到空闲键：原音的默认键位让出来', () => {
    const map = new PianoKeyMap({ custom: [{ code: 'KeyI', modifier: 'none', pitch: 60 }] });
    expect(map.lookup('KeyI', 'none')?.pitch).toBe(60);
    // C4 原来的 Q 键不再绑定
    expect(map.lookup('KeyQ', 'none')).toBeUndefined();
    expect(map.bindingsForPitch(60)).toHaveLength(1);
    expect(map.customCount).toBe(1);
    expect(map.customPitches.has(60)).toBe(true);
  });

  it('可以绑默认布局之外的黑键（C♯4）', () => {
    const map = new PianoKeyMap({ custom: [{ code: 'KeyI', modifier: 'none', pitch: 61 }] });
    expect(map.lookup('KeyI', 'none')?.pitch).toBe(61);
    expect(map.labelFor(61)).toBe('I');
    expect(map.pitches).toContain(61);
  });

  it('占用了某个键时，该键原来的音整组让位', () => {
    const map = new PianoKeyMap({ custom: [{ code: 'KeyZ', modifier: 'none', pitch: 61 }] });
    expect(map.lookup('KeyZ', 'none')?.pitch).toBe(61);
    // Z 原来是 C2
    expect(map.bindingsForPitch(36)).toHaveLength(0);
    expect(map.pitches).not.toContain(36);
  });

  it('只改 Shift 组合时，无修饰绑定继续可用', () => {
    const map = new PianoKeyMap({ custom: [{ code: 'KeyQ', modifier: 'shift', pitch: 61 }] });
    expect(map.lookup('KeyQ', 'none')?.pitch).toBe(60);
    expect(map.lookup('KeyQ', 'shift')?.pitch).toBe(61);
    expect(map.labelFor(61)).toBe('⇧Q');
  });

  it('同一物理键的不同修饰键互不覆盖', () => {
    const map = new PianoKeyMap({
      custom: [
        { code: 'KeyQ', modifier: 'none', pitch: 60 },
        { code: 'KeyQ', modifier: 'shift', pitch: 61 },
      ],
    });
    expect(map.lookup('KeyQ', 'none')?.pitch).toBe(60);
    expect(map.lookup('KeyQ', 'shift')?.pitch).toBe(61);
    expect(map.customCount).toBe(2);
  });

  it('可以绑到标点、以及小键盘', () => {
    const map = new PianoKeyMap({
      custom: [
        { code: 'Minus', modifier: 'none', pitch: 61 },
        { code: 'Numpad5', modifier: 'none', pitch: 62 },
      ],
    });
    expect(map.lookup('Minus', 'none')?.label).toBe('-');
    expect(map.lookup('Numpad5', 'none')?.label).toBe('N5');
    expect(map.lookup('Numpad5', 'none')?.pitch).toBe(62);
  });
});

describe('空置（不绑任何键）', () => {
  it('空置一个默认有键的音：该音不可弹，原键也不再触发它', () => {
    const map = new PianoKeyMap({ custom: [{ code: null, modifier: 'none', pitch: 60 }] });
    expect(map.bindingsForPitch(60)).toHaveLength(0);
    expect(map.labelFor(60)).toBeUndefined();
    expect(map.lookup('KeyQ', 'none')).toBeUndefined();
    expect(map.pitches).not.toContain(60);
    expect(map.pitches).toHaveLength(34);
    expect(map.clearedPitches.has(60)).toBe(true);
    expect(map.customCount).toBe(1);
  });

  it('空置可以恢复：去掉记录后默认键位回来', () => {
    const map = new PianoKeyMap({ custom: [{ code: null, modifier: 'none', pitch: 60 }] });
    expect(map.lookup('KeyQ', 'none')).toBeUndefined();
    const restored = new PianoKeyMap({ custom: [] });
    expect(restored.lookup('KeyQ', 'none')?.pitch).toBe(60);
  });

  it('同一个音既空置又绑定时，以绑定为准', () => {
    const map = new PianoKeyMap({
      custom: [
        { code: null, modifier: 'none', pitch: 60 },
        { code: 'KeyI', modifier: 'none', pitch: 60 },
      ],
    });
    expect(map.lookup('KeyI', 'none')?.pitch).toBe(60);
    expect(map.clearedPitches.has(60)).toBe(false);
    expect(map.customCount).toBe(1);
  });

  it('空置非默认音高不会破坏别的键位', () => {
    const map = new PianoKeyMap({ custom: [{ code: null, modifier: 'none', pitch: 61 }] });
    expect(map.pitches).toHaveLength(35);
    expect(map.lookup('KeyQ', 'none')?.pitch).toBe(60);
    expect(map.clearedPitches.has(61)).toBe(true);
  });
});

describe('物理键工具', () => {
  it('修饰键与系统键不可绑定', () => {
    expect(isBindableCode('ShiftLeft')).toBe(false);
    expect(isBindableCode('ControlRight')).toBe(false);
    expect(isBindableCode('Escape')).toBe(false);
    expect(isBindableCode('CapsLock')).toBe(false);
    expect(isBindableCode('NumLock')).toBe(false);
    expect(isBindableCode('KeyG')).toBe(true);
    expect(isBindableCode('Minus')).toBe(true);
    expect(isBindableCode('Space')).toBe(true);
  });

  it('键帽字符覆盖字母、数字、标点、小键盘与未知键', () => {
    expect(charForCode('KeyG')).toBe('g');
    expect(charForCode('Digit8')).toBe('8');
    expect(charForCode('Comma')).toBe(',');
    expect(charForCode('Semicolon')).toBe(';');
    expect(charForCode('Backquote')).toBe('`');
    expect(charForCode('Numpad9')).toBe('9');
    expect(charForCode('F7')).toBe('f7');
  });
});
