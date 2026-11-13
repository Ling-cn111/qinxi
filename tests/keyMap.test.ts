import { describe, expect, it } from 'vitest';
import { BASE_START_MIDI, modifierFromEvent, PianoKeyMap, whitePitchSequence } from '@/keyboard/keyMap';
import { midiToName } from '@/audio/note';

const keyMap = new PianoKeyMap({ preset: 'wide' });

describe('whitePitchSequence', () => {
  it('从 C2 起连续取白键', () => {
    expect(whitePitchSequence(36, 8)).toEqual([36, 38, 40, 41, 43, 45, 47, 48]);
  });

  it('不会越过 C8（108）', () => {
    const sequence = whitePitchSequence(100, 10);
    expect(Math.max(...sequence)).toBeLessThanOrEqual(108);
    expect(sequence[sequence.length - 1]).toBe(108);
  });
});

describe('PianoKeyMap', () => {
  it('映射表覆盖 C2–C8 全部 73 个音', () => {
    const pitches = keyMap.pitches;
    expect(pitches[0]).toBe(36);
    expect(pitches[pitches.length - 1]).toBe(108);
    expect(pitches).toHaveLength(73);
    expect(pitches).toEqual(Array.from({ length: 73 }, (_, i) => 36 + i));
  });

  it('下排白键从 C2 开始连续排列', () => {
    expect(keyMap.lookup('KeyZ', 'none')?.pitch).toBe(36);
    expect(keyMap.lookup('KeyX', 'none')?.pitch).toBe(38);
    expect(keyMap.lookup('KeyC', 'none')?.pitch).toBe(40);
    expect(keyMap.lookup('KeyV', 'none')?.pitch).toBe(41);
    expect(keyMap.lookup('Slash', 'none')?.pitch).toBe(52);
  });

  it('中排 a 起接续下排，g 正好是中央 C', () => {
    expect(keyMap.lookup('KeyA', 'none')?.pitch).toBe(53);
    const g = keyMap.lookup('KeyG', 'none');
    expect(g?.pitch).toBe(60);
    expect(midiToName(g!.pitch)).toBe('C4');
  });

  it('Shift + 左侧白键得到黑键（⇧Z = C#2）', () => {
    const binding = keyMap.lookup('KeyZ', 'shift');
    expect(binding?.pitch).toBe(37);
    expect(binding?.label).toBe('⇧Z');
    expect(keyMap.lookup('KeyK', 'shift')?.pitch).toBe(66); // F4 → F#4
    expect(keyMap.lookup('KeyG', 'shift')?.pitch).toBe(61); // C4 → C#4
  });

  it('E / B 上方没有黑键，Shift 组合回落到 37 与 48 之外', () => {
    // KeyE = E3(52)，E 上方是 F，没有黑键
    expect(keyMap.lookup('KeyE', 'shift')).toBeUndefined();
    // KeyM = B3(59)，B 上方是 C，没有黑键
    expect(keyMap.lookup('KeyM', 'shift')).toBeUndefined();
  });

  it('Alt + 右侧白键是同义写法（⌥X 也是 C#2）', () => {
    expect(keyMap.lookup('KeyX', 'alt')?.pitch).toBe(37);
    expect(keyMap.labelFor(37)).toBe('⇧Z');
  });

  it('每个可弹音高都有展示标签', () => {
    for (const pitch of keyMap.pitches) {
      expect(keyMap.labelFor(pitch)).toBeTruthy();
    }
  });

  it('字符索引供谱面解析使用（大小写不敏感）', () => {
    expect(keyMap.findByChar('G')?.pitch).toBe(60);
    expect(keyMap.findByChar('g')?.pitch).toBe(60);
    expect(keyMap.findByChar('G', 'shift')?.pitch).toBe(61);
    expect(keyMap.findByChar('#')).toBeUndefined();
  });

  it('支持自定义基准音高', () => {
    const shifted = new PianoKeyMap({ preset: 'wide', startMidi: 48 });
    expect(shifted.baseStartMidi).toBe(48);
    expect(shifted.lookup('KeyZ', 'none')?.pitch).toBe(48);
    expect(Math.max(...shifted.pitches)).toBeLessThanOrEqual(108);
  });

  it('默认基准音高为 C2', () => {
    expect(BASE_START_MIDI).toBe(36);
    expect(keyMap.baseStartMidi).toBe(36);
  });
});

describe('modifierFromEvent', () => {
  const base = { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false };

  it('Ctrl / Meta 组合不参与演奏', () => {
    expect(modifierFromEvent({ ...base, ctrlKey: true })).toBeNull();
    expect(modifierFromEvent({ ...base, metaKey: true })).toBeNull();
  });

  it('优先识别 Shift，其次 Alt', () => {
    expect(modifierFromEvent({ ...base, shiftKey: true })).toBe('shift');
    expect(modifierFromEvent({ ...base, altKey: true })).toBe('alt');
    expect(modifierFromEvent(base)).toBe('none');
  });
});
