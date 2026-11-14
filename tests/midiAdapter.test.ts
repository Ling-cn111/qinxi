import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { midiAdapter } from '@/parser/adapters/midiAdapter';

/** 最小 MIDI 夹具：96 BPM，C4(1拍) D4(1拍) E4(2拍)，力度 0.8 → 102 */
const FIXTURE = join(__dirname, 'fixtures', 'minimal.mid');

describe('midiAdapter（@tonejs/midi）', () => {
  it('解析拍位、音高、时值与力度', async () => {
    const bytes = readFileSync(FIXTURE);
    const result = await midiAdapter.parse({ bytes, fileName: 'minimal.mid' });

    expect(result.format).toBe('midi');
    expect(result.bpm).toBe(96);
    expect(result.title).toBe('QinXi Minimal');
    expect(result.warnings).toEqual([]);
    expect(result.notes.map((note) => note.pitch)).toEqual([60, 62, 64]);
    expect(result.notes.map((note) => note.startBeat)).toEqual([0, 1, 2]);
    expect(result.notes.map((note) => note.durationBeats)).toEqual([1, 1, 2]);
    // 0.8 写入 MIDI 字节时量化到整数域 → 101/127 ≈ 0.7953，读回 101
    expect(result.notes.every((note) => note.velocity === 101)).toBe(true);
  });

  it('接受 Uint8Array 输入', async () => {
    const result = await midiAdapter.parse({ bytes: new Uint8Array(readFileSync(FIXTURE)) });
    expect(result.notes).toHaveLength(3);
  });

  it('缺少二进制输入时报 TypeError', async () => {
    await expect(midiAdapter.parse({ text: 'not-bytes' })).rejects.toThrow(TypeError);
  });
});
