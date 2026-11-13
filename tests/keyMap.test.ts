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

describe('默认布局：照给定键位表，只有白键', () => {
  it('覆盖 C2–C7 共 36 个白键，没有任何黑键', () => {
    const pitches = keyMap.pitches;
    expect(pitches).toHaveLength(36);
    expect(pitches[0]).toBe(36);
    expect(pitches[pitches.length - 1]).toBe(96);
    for (const pitch of pitches) {
      expect([0, 2, 4, 5, 7, 9, 11]).toContain(pitch % 12);
    }
  });

  it('下排 Z–M 是 C2–B2', () => {
    expect(keyMap.lookup('KeyZ', 'none')?.pitch).toBe(36);
    expect(keyMap.lookup('KeyX', 'none')?.pitch).toBe(38);
    expect(keyMap.lookup('KeyC', 'none')?.pitch).toBe(40);
    expect(keyMap.lookup('KeyV', 'none')?.pitch).toBe(41);
    expect(keyMap.lookup('KeyB', 'none')?.pitch).toBe(43);
    expect(keyMap.lookup('KeyN', 'none')?.pitch).toBe(45);
    expect(keyMap.lookup('KeyM', 'none')?.pitch).toBe(47);
    expect(midiToName(keyMap.lookup('KeyZ', 'none')!.pitch)).toBe('C2');
  });

  it('上排前半 Q–T 是 C3–G3，后半 Y–] 跳到 C5–B5', () => {
    expect(keyMap.lookup('KeyQ', 'none')?.pitch).toBe(48);
    expect(keyMap.lookup('KeyW', 'none')?.pitch).toBe(50);
    expect(keyMap.lookup('KeyE', 'none')?.pitch).toBe(52);
    expect(keyMap.lookup('KeyR', 'none')?.pitch).toBe(53);
    expect(keyMap.lookup('KeyT', 'none')?.pitch).toBe(55);
    expect(keyMap.lookup('KeyY', 'none')?.pitch).toBe(72);
    expect(keyMap.lookup('KeyU', 'none')?.pitch).toBe(74);
    expect(keyMap.lookup('BracketRight', 'none')?.pitch).toBe(83);
    expect(keyMap.lookup('Backslash', 'none')).toBeUndefined();
  });

  it("中排 D–' 接着 A3–B4", () => {
    expect(keyMap.lookup('KeyD', 'none')?.pitch).toBe(57);
    expect(keyMap.lookup('KeyF', 'none')?.pitch).toBe(59);
    expect(keyMap.lookup('KeyG', 'none')?.pitch).toBe(60);
    expect(keyMap.lookup('KeyH', 'none')?.pitch).toBe(62);
    expect(keyMap.lookup('KeyJ', 'none')?.pitch).toBe(64);
    expect(keyMap.lookup('KeyK', 'none')?.pitch).toBe(65);
    expect(keyMap.lookup('KeyL', 'none')?.pitch).toBe(67);
    expect(keyMap.lookup('Semicolon', 'none')?.pitch).toBe(69);
    expect(keyMap.lookup('Quote', 'none')?.pitch).toBe(71);
    expect(keyMap.lookup('KeyA', 'none')).toBeUndefined();
  });

  it('数字排 5–= 是 C6–C7', () => {
    expect(keyMap.lookup('Digit5', 'none')?.pitch).toBe(84);
    expect(keyMap.lookup('Digit6', 'none')?.pitch).toBe(86);
    expect(keyMap.lookup('Digit9', 'none')?.pitch).toBe(91);
    expect(keyMap.lookup('Digit0', 'none')?.pitch).toBe(93);
    expect(keyMap.lookup('Minus', 'none')?.pitch).toBe(95);
    expect(keyMap.lookup('Equal', 'none')?.pitch).toBe(96);
    expect(midiToName(keyMap.lookup('Equal', 'none')!.pitch)).toBe('C7');
  });

  it('删掉的黑键与空闲键都不发声', () => {
    const idle = [
      'KeyS',
      'Digit2',
      'Digit3',
      'Digit1',
      'Digit4',
      'Backquote',
      'Comma',
      'Period',
      'Slash',
      'Numpad5',
    ];
    for (const code of idle) {
      expect(keyMap.lookup(code, 'none')).toBeUndefined();
    }
  });

  it('通篇没有修饰键绑定，也没有黑键绑定', () => {
    expect(keyMap.bindings.every((item) => item.modifier === 'none')).toBe(true);
    expect(keyMap.bindings.every((item) => [0, 2, 4, 5, 7, 9, 11].includes(item.pitch % 12))).toBe(
      true,
    );
  });

  it('每个可弹音高都有展示标签', () => {
    for (const pitch of keyMap.pitches) {
      expect(keyMap.labelFor(pitch)).toBeTruthy();
    }
  });

  it('字符索引供谱面解析使用（大小写不敏感）', () => {
    expect(keyMap.findByChar('G')?.pitch).toBe(60); // C4
    expect(keyMap.findByChar('g')?.pitch).toBe(60);
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
  it('五行，每行列出「键 + 音」，小键盘标为空闲', () => {
    expect(KEYMAP_ROWS).toHaveLength(5);
    expect(KEYMAP_ROWS[0].keys.startsWith('Z C2 · X D2')).toBe(true);
    expect(KEYMAP_ROWS[0].range).toBe('C2–B2');
    expect(KEYMAP_ROWS[2].keys.startsWith('Q C3 · W D3')).toBe(true);
    expect(KEYMAP_ROWS[2].range).toBe('C3–B5');
    expect(KEYMAP_ROWS[4].keys).toContain('空闲');
    expect(KEYMAP_ROWS[4].range).toBe('—');
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

describe('键位跟随音区（整体平移八度）', () => {
  const low = new PianoKeyMap({ startMidi: 24 }); // 低音区 C1–C6
  const high = new PianoKeyMap({ startMidi: 48 }); // 高音区 C3–C8

  it('低音区把整组键位挪到 C1 起', () => {
    expect(low.lookup('KeyZ', 'none')?.pitch).toBe(24); // C1
    expect(low.lookup('Equal', 'none')?.pitch).toBe(84); // C6
    expect(low.pitches).toHaveLength(36);
    expect(Math.min(...low.pitches)).toBe(24);
  });

  it('高音区把整组键位挪到 C3 起，最高到 C8', () => {
    expect(high.lookup('KeyZ', 'none')?.pitch).toBe(48); // C3
    expect(high.lookup('Equal', 'none')?.pitch).toBe(108); // C8
    expect(high.pitches).toHaveLength(36);
  });

  it('每档平移后仍然只有白键、没有修饰键', () => {
    for (const map of [low, high]) {
      expect(map.bindings.every((item) => item.modifier === 'none')).toBe(true);
      expect(map.bindings.every((item) => [0, 2, 4, 5, 7, 9, 11].includes(item.pitch % 12))).toBe(
        true,
      );
    }
  });

  it('自定义绑定跟着音区一起平移（存的是默认布局坐标）', () => {
    const map = new PianoKeyMap({
      startMidi: 24,
      custom: [{ code: 'KeyQ', modifier: 'none', pitch: 60 }],
    });
    // 存的是 C4（默认布局坐标），低音区整体降八度 → 落到 C3
    expect(map.lookup('KeyQ', 'none')?.pitch).toBe(48);
    expect(map.lookup('KeyZ', 'none')?.pitch).toBe(24);
  });

  it('平移后越界的自定义绑定会被丢掉，回落到默认键位', () => {
    const map = new PianoKeyMap({
      startMidi: 48,
      custom: [{ code: 'KeyQ', modifier: 'none', pitch: 108 }], // C8 + 12 越界
    });
    expect(map.lookup('KeyQ', 'none')?.pitch).toBe(60); // 默认 Q = C3
  });

  it('空置记录也跟着平移', () => {
    const map = new PianoKeyMap({
      startMidi: 24,
      custom: [{ code: null, modifier: 'none', pitch: 36 }], // 空置 C2
    });
    expect(map.clearedPitches.has(24)).toBe(true);
    expect(map.clearedPitches.has(36)).toBe(false);
  });

  it('平移后音名标签跟着变，键位字符不变', () => {
    expect(low.labelFor(24)).toBe('Z');
    expect(high.labelFor(48)).toBe('Z');
    expect(low.findByChar('z')?.pitch).toBe(24);
    expect(high.findByChar('z')?.pitch).toBe(48);
  });
});
