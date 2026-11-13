import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AUTOPIANO_SAMPLE_DIR, AUTOPIANO_SAMPLES } from '@/audio/autopianoSamples';
import { nameToMidi } from '@/audio/note';

const SAMPLE_DIR = join(process.cwd(), 'public', AUTOPIANO_SAMPLE_DIR);

describe('AutoPiano 采样表', () => {
  it('覆盖 C2–C7 全部 61 个半音', () => {
    expect(AUTOPIANO_SAMPLES).toHaveLength(61);
    const midis = AUTOPIANO_SAMPLES.map(([note]) => nameToMidi(note));
    expect(midis).toEqual(Array.from({ length: 61 }, (_, i) => 36 + i));
  });

  it('音名与文件名都不重复', () => {
    const notes = AUTOPIANO_SAMPLES.map(([note]) => note);
    const files = AUTOPIANO_SAMPLES.map(([, file]) => file);
    expect(new Set(notes).size).toBe(notes.length);
    expect(new Set(files).size).toBe(files.length);
  });

  it('文件名沿用 AutoPiano 原仓库编号（a=白键 / b=黑键）', () => {
    for (const [note, file] of AUTOPIANO_SAMPLES) {
      expect(file).toMatch(/^[ab]\d+\.mp3$/);
      const isBlack = note.includes('#');
      expect(file.startsWith(isBlack ? 'b' : 'a')).toBe(true);
    }
  });

  it('映射到的每个文件都真实存在于 public/samples/piano', () => {
    const missing = AUTOPIANO_SAMPLES.filter(
      ([, file]) => !existsSync(join(SAMPLE_DIR, file)),
    ).map(([, file]) => file);
    expect(missing).toEqual([]);
  });

  it('目录里没有多余/漏映射的采样文件', () => {
    const onDisk = readdirSync(SAMPLE_DIR).filter((file) => file.endsWith('.mp3'));
    const mapped = new Set(AUTOPIANO_SAMPLES.map(([, file]) => file));
    expect(onDisk.filter((file) => !mapped.has(file))).toEqual([]);
    expect(onDisk).toHaveLength(AUTOPIANO_SAMPLES.length);
  });

  it('采样起点是 C2（36），即 88 键里最低三个音要靠移调', () => {
    const lowest = Math.min(...AUTOPIANO_SAMPLES.map(([note]) => nameToMidi(note) as number));
    const highest = Math.max(...AUTOPIANO_SAMPLES.map(([note]) => nameToMidi(note) as number));
    expect(lowest).toBe(36);
    expect(highest).toBe(96);
  });
});
