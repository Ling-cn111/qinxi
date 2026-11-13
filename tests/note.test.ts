import { describe, expect, it } from 'vitest';
import {
  hasBlackAbove,
  hasBlackBelow,
  isBlackKey,
  MAX_MIDI,
  midiToName,
  MIN_MIDI,
  nameToMidi,
  normalizeNoteParams,
  noteFrequency,
  velocityToGain,
} from '@/audio/note';

describe('音高工具', () => {
  it('midiToName 覆盖首尾与中央 C', () => {
    expect(midiToName(MIN_MIDI)).toBe('A0');
    expect(midiToName(60)).toBe('C4');
    expect(midiToName(MAX_MIDI)).toBe('C8');
    expect(midiToName(69)).toBe('A4');
  });

  it('nameToMidi 支持 # 与 Salamander 的 s 写法', () => {
    expect(nameToMidi('C4')).toBe(60);
    expect(nameToMidi('C#4')).toBe(61);
    expect(nameToMidi('Ds4')).toBe(63);
    expect(nameToMidi('A0')).toBe(21);
    expect(nameToMidi('C8')).toBe(108);
  });

  it('nameToMidi 对非法输入返回 null', () => {
    expect(nameToMidi('')).toBeNull();
    expect(nameToMidi('H4')).toBeNull();
    expect(nameToMidi('C')).toBeNull();
    expect(nameToMidi('C99')).toBeNull();
  });

  it('黑白键判定', () => {
    expect(isBlackKey(21)).toBe(false); // A0
    expect(isBlackKey(22)).toBe(true); // A#0
    expect(isBlackKey(61)).toBe(true); // C#4
    expect(isBlackKey(64)).toBe(false); // E4
  });

  it('黑键上下方判定与升降号一致', () => {
    expect(hasBlackAbove(60)).toBe(true); // C4 → C#4
    expect(hasBlackAbove(64)).toBe(false); // E4 → F4
    expect(hasBlackAbove(71)).toBe(false); // B4 → C5
    expect(hasBlackBelow(62)).toBe(true); // D4 → C#4
    expect(hasBlackBelow(60)).toBe(false); // C4
  });

  it('A4 = 440Hz，八度翻倍', () => {
    expect(noteFrequency(69)).toBeCloseTo(440, 6);
    expect(noteFrequency(81)).toBeCloseTo(880, 6);
    expect(noteFrequency(57)).toBeCloseTo(220, 6);
  });
});

describe('normalizeNoteParams：playNote 参数校验', () => {
  it('接受合法参数并原样返回', () => {
    expect(normalizeNoteParams(60, 100, 1.5, 0)).toEqual({ pitch: 60, velocity: 100, when: 1.5 });
  });

  it('力度取整', () => {
    expect(normalizeNoteParams(60, 88.6, 0, 0).velocity).toBe(89);
  });

  it('音高越界抛 RangeError', () => {
    expect(() => normalizeNoteParams(20)).toThrow(RangeError);
    expect(() => normalizeNoteParams(109)).toThrow(RangeError);
    expect(() => normalizeNoteParams(60.5)).toThrow(RangeError);
    expect(() => normalizeNoteParams(Number.NaN)).toThrow(RangeError);
  });

  it('力度越界抛 RangeError', () => {
    expect(() => normalizeNoteParams(60, -1)).toThrow(RangeError);
    expect(() => normalizeNoteParams(60, 128)).toThrow(RangeError);
    expect(() => normalizeNoteParams(60, Number.NaN)).toThrow(RangeError);
  });

  it('省略 when 时使用当前音频时钟', () => {
    expect(normalizeNoteParams(60, 100, undefined, 3.2).when).toBeCloseTo(3.2, 6);
    expect(normalizeNoteParams(60, 100, Number.NaN, 3.2).when).toBeCloseTo(3.2, 6);
  });

  it('过期的 when 被夹到 now，不会把调度排到过去', () => {
    expect(normalizeNoteParams(60, 100, 1, 5).when).toBe(5);
    expect(normalizeNoteParams(60, 100, 6, 5).when).toBe(6);
  });

  it('力度 0 合法（相当于静音）', () => {
    expect(normalizeNoteParams(60, 0).velocity).toBe(0);
  });
});

describe('velocityToGain', () => {
  it('力度越大增益越大，且不会削顶', () => {
    expect(velocityToGain(0)).toBe(0);
    expect(velocityToGain(127)).toBeCloseTo(0.9, 6);
    expect(velocityToGain(100)).toBeGreaterThan(velocityToGain(50));
    expect(velocityToGain(200)).toBeCloseTo(0.9, 6);
    expect(velocityToGain(-10)).toBe(0);
  });
});
