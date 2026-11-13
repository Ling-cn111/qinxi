import { describe, expect, it } from 'vitest';
import { DEFAULT_INSTRUMENT_ID, findInstrument, INSTRUMENTS } from '@/data/instruments';

describe('音色目录', () => {
  it('id 唯一', () => {
    const ids = INSTRUMENTS.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('当前只有 AutoPiano 的高音立式钢琴接入采样', () => {
    const available = INSTRUMENTS.filter((item) => item.available);
    expect(available).toHaveLength(1);
    expect(available[0].id).toBe(DEFAULT_INSTRUMENT_ID);
    expect(available[0].badge).toBe('MP3');
  });

  it('默认音色必须存在且可用，否则面板一打开就是死状态', () => {
    const fallback = findInstrument(DEFAULT_INSTRUMENT_ID);
    expect(fallback).toBeDefined();
    expect(fallback?.available).toBe(true);
  });

  it('GM 音色编号在 1–128 之间且不重复', () => {
    const programs = INSTRUMENTS.map((item) => item.program).filter(
      (value): value is number => typeof value === 'number',
    );
    expect(programs.length).toBe(INSTRUMENTS.length - 2); // 两个 AutoPiano 自有采样没有编号
    for (const program of programs) {
      expect(program).toBeGreaterThanOrEqual(1);
      expect(program).toBeLessThanOrEqual(128);
    }
    expect(new Set(programs).size).toBe(programs.length);
  });

  it('每条都有中英文名，供卡片显示', () => {
    for (const item of INSTRUMENTS) {
      expect(item.name.length).toBeGreaterThan(0);
      expect(item.latin.length).toBeGreaterThan(0);
    }
  });
});
