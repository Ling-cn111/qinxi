import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseAny } from '@/parser/parseAny';
import { PianoKeyMap } from '@/keyboard/keyMap';

const FIXTURES = join(__dirname, 'fixtures');
const keyMap = new PianoKeyMap();

describe('parseAny：统一入口', () => {
  it('字符谱走 textAdapter（keyMap 映射），与旧解析结果一致', async () => {
    const result = await parseAny({ text: 'ggll;;l', keyMap }, 'text');
    expect(result.format).toBe('text');
    expect(result.notes.map((note) => note.pitch)).toEqual([60, 60, 67, 67, 69, 69, 67]);
  });

  it('auto：按扩展名路由 .mid', async () => {
    const bytes = readFileSync(join(FIXTURES, 'minimal.mid'));
    const result = await parseAny({ bytes, fileName: 'song.MID' }, 'auto');
    expect(result.format).toBe('midi');
    expect(result.notes.map((note) => note.pitch)).toEqual([60, 62, 64]);
  });

  it('auto：按扩展名路由 .musicxml', async () => {
    const text = readFileSync(join(FIXTURES, 'minimal.musicxml'), 'utf-8');
    const result = await parseAny({ text, fileName: 'song.musicxml' }, 'auto');
    expect(result.format).toBe('musicxml');
    expect(result.notes.map((note) => note.pitch)).toEqual([60, 64, 67]);
  });

  it('auto：按扩展名路由 .abc', async () => {
    const result = await parseAny(
      { text: 'X:1\nM:4/4\nL:1/4\nK:C\nC E G2|', fileName: 'tune.abc' },
      'auto',
    );
    expect(result.format).toBe('abc');
    expect(result.notes.map((note) => note.pitch)).toEqual([60, 64, 67]);
  });

  it('auto：无文件名时嗅探 MThd 魔数 → MIDI', async () => {
    const bytes = readFileSync(join(FIXTURES, 'minimal.mid'));
    const result = await parseAny({ bytes }, 'auto');
    expect(result.format).toBe('midi');
  });

  it('auto：无文件名时文本 < 开头 → MusicXML', async () => {
    const text = readFileSync(join(FIXTURES, 'minimal.musicxml'), 'utf-8');
    const result = await parseAny({ text }, 'auto');
    expect(result.format).toBe('musicxml');
  });

  it('auto：无文件名且不是 < 开头的文本 → 字符谱', async () => {
    const result = await parseAny({ text: 'gghhjj', keyMap }, 'auto');
    expect(result.format).toBe('text');
  });

  it('未知扩展名直接报错（不静默猜格式）', async () => {
    await expect(parseAny({ text: 'gg', keyMap, fileName: 'song.pdf' }, 'auto')).rejects.toThrow(
      /不支持的谱面格式/,
    );
  });

  it('三种格式产出同一坐标系：同拍位同音高 → Transport / 判定引擎无感', async () => {
    // 夹具三个文件都是「C/E/G（或 C/D/E），拍位 0/1/2」——MIDI 是 C D E，
    // MusicXML 是 C E G，ABC 是 C E G：各自断言自己的音高，
    // 这里验证的是三个适配器返回的 startBeat 全部落在整数拍位上。
    const midi = await parseAny({ bytes: readFileSync(join(FIXTURES, 'minimal.mid')) }, 'midi');
    const xml = await parseAny(
      { text: readFileSync(join(FIXTURES, 'minimal.musicxml'), 'utf-8') },
      'musicxml',
    );
    const abc = await parseAny({ text: 'X:1\nM:4/4\nL:1/4\nK:C\nC E G2|' }, 'abc');
    for (const result of [midi, xml, abc]) {
      expect(result.notes.map((note) => note.startBeat)).toEqual([0, 1, 2]);
    }
  });
});
