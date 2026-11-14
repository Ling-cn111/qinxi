import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { abcAdapter, musicXmlAdapter, mxlAdapter } from '@/parser/adapters/musicXmlAdapter';

const FIXTURE = join(__dirname, 'fixtures', 'minimal.musicxml');

const MINIMAL_ABC = [
  'X:1',
  'T:QinXi ABC',
  'M:4/4',
  'L:1/4',
  'K:C',
  'C E G2|',
].join('\n');

describe('musicXmlAdapter（@webmusic/score loadScore）', () => {
  it('解析拍位、音高、时值（divisions 折算成四分音符）', async () => {
    const text = readFileSync(FIXTURE, 'utf-8');
    const result = await musicXmlAdapter.parse({ text, fileName: 'minimal.musicxml' });

    expect(result.format).toBe('musicxml');
    expect(result.notes.map((note) => note.pitch)).toEqual([60, 64, 67]);
    // divisions=2：C4/E4 duration=2 → 一拍；G4 duration=4 → 两拍
    expect(result.notes.map((note) => note.startBeat)).toEqual([0, 1, 2]);
    expect(result.notes.map((note) => note.durationBeats)).toEqual([1, 1, 2]);
  });

  it('接受字节输入（文件导入的真实路径）', async () => {
    const bytes = readFileSync(FIXTURE);
    const result = await musicXmlAdapter.parse({ bytes });
    expect(result.notes.map((note) => note.pitch)).toEqual([60, 64, 67]);
  });

  it('休止符不产出音符，但后续音的拍位正确', async () => {
    const xml = [
      '<score-partwise version="3.1">',
      '<part-list><score-part id="P1"/></part-list>',
      '<part id="P1"><measure number="1">',
      '<attributes><divisions>1</divisions></attributes>',
      '<note><rest/><duration>2</duration></note>',
      '<note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration></note>',
      '</measure></part></score-partwise>',
    ].join('');
    const result = await musicXmlAdapter.parse({ text: xml });
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0]).toMatchObject({ pitch: 60, startBeat: 2 });
  });
});

describe('abcAdapter（第三批 · @webmusic/score）', () => {
  it('解析 ABC 记谱的音高与拍位', async () => {
    const result = await abcAdapter.parse({ text: MINIMAL_ABC });
    expect(result.format).toBe('abc');
    expect(result.notes.map((note) => note.pitch)).toEqual([60, 64, 67]);
    // L:1/4 → 每个音符一拍，G2 两拍
    expect(result.notes.map((note) => note.startBeat)).toEqual([0, 1, 2]);
    expect(result.notes.map((note) => note.durationBeats)).toEqual([1, 1, 2]);
  });
});

describe('mxlAdapter', () => {
  it('扩展名单独注册，解析走同一条 loadScore 管道', () => {
    expect(mxlAdapter.extensions).toEqual(['.mxl']);
    expect(mxlAdapter.id).toBe('mxl');
  });
});
