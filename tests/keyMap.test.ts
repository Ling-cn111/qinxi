import { describe, expect, it } from 'vitest';
import {
  BASE_START_MIDI,
  KEYMAP_ROWS,
  modifierFromEvent,
  PianoKeyMap,
  whitePitchSequence,
} from '@/keyboard/keyMap';
import { midiToName } from '@/audio/note';

const keyMap = new PianoKeyMap();

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

describe('默认布局：一排一个八度，只有白键', () => {
  it('覆盖 C2–B6 共 35 个白键，没有任何黑键', () => {
    const pitches = keyMap.pitches;
    expect(pitches).toHaveLength(35);
    expect(pitches[0]).toBe(36);
    expect(pitches[pitches.length - 1]).toBe(95);
    for (const pitch of pitches) {
      expect([0, 2, 4, 5, 7, 9, 11]).toContain(pitch % 12);
    }
  });

  it('下排 Z–M 正好是 C2–B2', () => {
    expect(keyMap.lookup('KeyZ', 'none')?.pitch).toBe(36);
    expect(keyMap.lookup('KeyX', 'none')?.pitch).toBe(38);
    expect(keyMap.lookup('KeyC', 'none')?.pitch).toBe(40);
    expect(keyMap.lookup('KeyV', 'none')?.pitch).toBe(41);
    expect(keyMap.lookup('KeyB', 'none')?.pitch).toBe(43);
    expect(keyMap.lookup('KeyN', 'none')?.pitch).toBe(45);
    expect(keyMap.lookup('KeyM', 'none')?.pitch).toBe(47);
  });

  it('每排的起点都是 C：A= C3、Q= C4、1= C5、小键盘 7= C6', () => {
    expect(keyMap.lookup('KeyA', 'none')?.pitch).toBe(48);
    expect(keyMap.lookup('KeyQ', 'none')?.pitch).toBe(60);
    expect(keyMap.lookup('Digit1', 'none')?.pitch).toBe(72);
    expect(keyMap.lookup('Numpad7', 'none')?.pitch).toBe(84);
    expect(midiToName(keyMap.lookup('KeyQ', 'none')!.pitch)).toBe('C4');
  });

  it('每排第 7 个键是 B（不是 C）', () => {
    expect(keyMap.lookup('KeyM', 'none')?.pitch).toBe(47); // B2
    expect(keyMap.lookup('KeyJ', 'none')?.pitch).toBe(59); // B3
    expect(keyMap.lookup('KeyU', 'none')?.pitch).toBe(71); // B4
    expect(keyMap.lookup('Digit7', 'none')?.pitch).toBe(83); // B5
    expect(keyMap.lookup('Numpad1', 'none')?.pitch).toBe(95); // B6
  });

  it('通篇没有修饰键绑定，也没有黑键绑定', () => {
    expect(keyMap.bindings.every((item) => item.modifier === 'none')).toBe(true);
    expect(keyMap.bindings.every((item) => [0, 2, 4, 5, 7, 9, 11].includes(item.pitch % 12))).toBe(
      true,
    );
  });

  it('默认布局里白键之外的空闲键不发声', () => {
    expect(keyMap.lookup('Digit8', 'none')).toBeUndefined();
    expect(keyMap.lookup('KeyI', 'none')).toBeUndefined();
    expect(keyMap.lookup('KeyK', 'none')).toBeUndefined();
    expect(keyMap.lookup('Comma', 'none')).toBeUndefined();
  });

  it('每个可弹音高都有展示标签', () => {
    for (const pitch of keyMap.pitches) {
      expect(keyMap.labelFor(pitch)).toBeTruthy();
    }
  });

  it('字符索引供谱面解析使用（大小写不敏感）', () => {
    expect(keyMap.findByChar('G')?.pitch).toBe(55); // G3
    expect(keyMap.findByChar('g')?.pitch).toBe(55);
    expect(keyMap.findByChar('#')).toBeUndefined();
  });

  it('支持自定义基准音高（整体平移八度）', () => {
    const shifted = new PianoKeyMap({ startMidi: 48 });
    expect(shifted.baseStartMidi).toBe(48);
    expect(shifted.lookup('KeyZ', 'none')?.pitch).toBe(48);
    expect(Math.max(...shifted.pitches)).toBeLessThanOrEqual(108);
  });

  it('默认基准音高为 C2', () => {
    expect(BASE_START_MIDI).toBe(36);
    expect(keyMap.baseStartMidi).toBe(36);
  });
});

describe('布局摘要（键位页文案）', () => {
  it('五行、每行七个键、音域连续', () => {
    expect(KEYMAP_ROWS).toHaveLength(5);
    for (const row of KEYMAP_ROWS) {
      expect(row.keys.split(' ')).toHaveLength(7);
      expect(row.range).toMatch(/^[A-G]\d–B\d$/);
    }
    expect(KEYMAP_ROWS[0].keys).toBe('Z X C V B N M');
    expect(KEYMAP_ROWS[0].range).toBe('C2–B2');
    expect(KEYMAP_ROWS[4].keys).toBe('N7 N8 N9 N4 N5 N6 N1');
    expect(KEYMAP_ROWS[4].range).toBe('C6–B6');
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
