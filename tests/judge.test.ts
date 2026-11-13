import { describe, expect, it } from 'vitest';
import {
  beatAtTime,
  beatsToMs,
  collectMissed,
  gradeForDelta,
  GOOD_MS,
  judgeHit,
  msToBeats,
  PERFECT_MS,
  type Judgment,
} from '@/game/judge';
import type { NoteEvent } from '@/types';

const SPB96 = 60 / 96; // 0.625s/拍
const SPB120 = 0.5;
const SPB104 = 60 / 104;

function note(pitch: number, startBeat: number, durationBeats = 1): NoteEvent {
  return { id: `n${pitch}@${startBeat}`, pitch, startBeat, durationBeats };
}

const NONE = new Set<number>();

describe('gradeForDelta：分档边界（闭区间）', () => {
  it.each([
    [0, 'perfect'],
    [PERFECT_MS, 'perfect'],
    [-PERFECT_MS, 'perfect'],
    [80.0001, 'good'],
    [GOOD_MS, 'good'],
    [-GOOD_MS, 'good'],
    [160.0001, 'miss'],
    [-200, 'miss'],
  ] as const)('%fms → %s', (ms, grade) => {
    expect(gradeForDelta(ms)).toBe(grade);
  });
});

describe('时间 ↔ 拍位换算精度', () => {
  it('beatAtTime：96 BPM 下 0.3125s 正好是 0.5 拍', () => {
    // 0.3125 与 0.625 都是二进制精确值，结果必须分毫不差
    expect(beatAtTime(10.3125, 10, 0, SPB96)).toBe(0.5);
  });

  it.each([
    [60, 1], // 60 BPM：1 拍 = 1s
    [96, 0.625],
    [104, 60 / 104],
    [120, 0.5],
  ])('%i BPM 的秒/拍往返一致', (_bpm, spb) => {
    const beat = 7.75;
    const seconds = beat * spb;
    expect(beatAtTime(seconds, 0, 0, spb)).toBeCloseTo(beat, 12);
  });

  it('带非零锚点仍然成立（锚点 = 起播留白后的时刻）', () => {
    // anchorTime = 42.3，anchorBeat = 3；42.3 + 2×0.625 → 第 5 拍
    expect(beatAtTime(42.3 + 1.25, 42.3, 3, SPB96)).toBeCloseTo(5, 12);
  });

  it('毫秒 ↔ 拍位往返（96 BPM）', () => {
    const beats = msToBeats(37, SPB96);
    expect(beatsToMs(beats, SPB96)).toBeCloseTo(37, 9);
  });

  it('判定窗口换算：96 BPM 时 ±160ms = 0.256 拍', () => {
    expect(msToBeats(GOOD_MS, SPB96)).toBeCloseTo(0.256, 12);
    // 104 BPM 下窗口略宽（拍更短）
    expect(msToBeats(GOOD_MS, SPB104)).toBeGreaterThan(msToBeats(GOOD_MS, SPB96));
  });
});

describe('judgeHit：时间判定', () => {
  const notes = [note(60, 4)]; // C4 在第 4 拍

  function hit(deltaMs: number, pitch = 60, spb = SPB96): Judgment {
    return judgeHit(
      { pitch, hitBeat: 4 + msToBeats(deltaMs, spb) },
      notes,
      NONE,
      spb,
    );
  }

  it('正中 → Perfect，delta 为 0', () => {
    const result = hit(0);
    expect(result.grade).toBe('perfect');
    expect(result.index).toBe(0);
    expect(result.deltaMs).toBeCloseTo(0, 9);
    expect(result.note?.startBeat).toBe(4);
  });

  it('±80ms 内 → Perfect（原 Great 档已并入）', () => {
    expect(hit(30).grade).toBe('perfect');
    expect(hit(-30).grade).toBe('perfect');
    expect(hit(41).grade).toBe('perfect');
    expect(hit(75).grade).toBe('perfect');
    expect(hit(-79).grade).toBe('perfect');
  });

  it('80ms 出头 → Good', () => {
    expect(hit(81).grade).toBe('good');
    expect(hit(-85).grade).toBe('good');
  });

  it('±160ms 内 → Good；再晚哪怕 1ms 也抓不到（留给漏按清扫）', () => {
    expect(hit(159).grade).toBe('good');
    expect(hit(161)).toMatchObject({ grade: 'miss', index: -1, note: null });
    expect(hit(-161)).toMatchObject({ grade: 'miss', index: -1 });
  });

  it('不同 BPM 下窗口跟着换算（120 BPM 拍更短，窗口拍数不变）', () => {
    // 120 BPM：160ms = 0.32 拍；按 0.31 拍偏差仍是 Good
    const result = judgeHit({ pitch: 60, hitBeat: 4 + 0.31 }, notes, NONE, SPB120);
    expect(result.grade).toBe('good');
    expect(result.deltaMs).toBeCloseTo(155, 6);
  });
});

describe('judgeHit：音高判定', () => {
  it('按错键（附近只有别的音高）→ Miss 错音，不消耗音符', () => {
    const notes = [note(60, 4), note(64, 6)];
    const result = judgeHit({ pitch: 62, hitBeat: 4 }, notes, NONE, SPB96);
    expect(result).toMatchObject({ grade: 'miss', index: -1, note: null, deltaMs: 0 });
  });

  it('按了正确的音但拍位差得远（提前太多）→ Miss，音符未被消耗', () => {
    const notes = [note(60, 4)];
    const judged = new Set<number>();
    const early = judgeHit({ pitch: 60, hitBeat: 2 }, notes, judged, SPB96);
    expect(early.grade).toBe('miss');
    expect(judged.size).toBe(0); // 本模块不写 judged，但命中结果可被调用方跳过
  });

  it('同音高两个音符，命中离得近的那个', () => {
    const notes = [note(60, 2), note(60, 6)];
    const result = judgeHit({ pitch: 60, hitBeat: 6.1 }, notes, NONE, SPB96);
    expect(result.index).toBe(1);
    expect(result.deltaMs).toBeCloseTo(beatsToMs(0.1, SPB96), 9);
  });

  it('已被判定过的音符不再参与匹配（重复按同一键 → Miss）', () => {
    const notes = [note(60, 4)];
    const judged = new Set<number>([0]);
    const result = judgeHit({ pitch: 60, hitBeat: 4.01 }, notes, judged, SPB96);
    expect(result).toMatchObject({ grade: 'miss', index: -1 });
  });

  it('和弦：只消耗被按中的那个音，同拍其他音不受影响', () => {
    const notes = [note(60, 4), note(64, 4), note(67, 4)];
    const result = judgeHit({ pitch: 64, hitBeat: 4 }, notes, NONE, SPB96);
    expect(result).toMatchObject({ grade: 'perfect', index: 1 });
  });
});

describe('collectMissed：漏按清扫', () => {
  const notes = [
    note(60, 0),
    note(62, 2),
    note(64, 4),
    note(65, 4), // 和弦第 4 拍两个音
    note(67, 8),
  ];

  it('窗口刚过的音算漏按，窗口内的不算', () => {
    // 96 BPM：160ms = 0.256 拍。currentBeat = 2.2 → 第 0 音（0 拍）窗口早已过去，
    // 第 1 音（2 拍）的窗口到 2.256 才过，还没漏
    const missed = collectMissed(notes, NONE, 2.2, SPB96);
    expect(missed).toEqual([0]);
  });

  it('和弦整组一起漏', () => {
    const missed = collectMissed(notes, NONE, 4.3, SPB96);
    expect(missed).toEqual([0, 1, 2, 3]);
  });

  it('已判定的不再返回', () => {
    const missed = collectMissed(notes, new Set<number>([0, 2]), 4.3, SPB96);
    expect(missed).toEqual([1, 3]);
  });

  it('全部弹完且时间走完后返回剩余全部', () => {
    const missed = collectMissed(notes, new Set<number>([0, 1, 2, 3, 4]), 100, SPB96);
    expect(missed).toEqual([]);
    const partial = collectMissed(notes, new Set<number>([0]), 100, SPB96);
    expect(partial).toEqual([1, 2, 3, 4]);
  });

  it('窗口边界：正好卡在 startBeat + 140ms 上不算漏（闭区间）', () => {
    const single = [note(60, 2)];
    const boundaryBeat = 2 + msToBeats(GOOD_MS, SPB96);
    expect(collectMissed(single, NONE, boundaryBeat, SPB96)).toEqual([]);
    expect(collectMissed(single, NONE, boundaryBeat + 1e-6, SPB96)).toEqual([0]);
  });
});

describe('变速下的判定不变性（窗口按物理毫秒锁定）', () => {
  const SPB96 = 0.625; // 96 BPM
  const SPB48 = 1.25; // 96 BPM 的 50% 变速
  const notes = [note(60, 4)];

  // 物理偏差 δms → 拍差 = (δ/1000) / spb。判定把拍差 × spb 换回毫秒，
  // 所以无论速度怎么变，同一物理偏差永远落在同一档。
  // 偏差值避开 ±80/±160ms 的闭区间边界：边界处的浮点往返误差属于 gradeForDelta 的
  // 既有容差测试覆盖范围，这里验证的是「变速不变性」本身。
  const hitWithPhysicalDelta = (deltaSec: number, spb: number) =>
    judgeHit({ pitch: 60, hitBeat: 4 + deltaSec / spb }, notes, new Set<number>(), spb);

  it.each([
    [0.03, 'perfect'],
    [0.079, 'perfect'],
    [0.081, 'good'],
    [0.159, 'good'],
    [0.161, 'miss'],
    [0.2, 'miss'],
  ] as const)('50%% 变速下物理偏差 %f s → %s（与原速一致）', (deltaSec, grade) => {
    const slow = hitWithPhysicalDelta(deltaSec, SPB48);
    const normal = hitWithPhysicalDelta(deltaSec, SPB96);
    expect(slow.grade).toBe(grade);
    expect(normal.grade).toBe(grade);
    if (grade !== 'miss') {
      // 超出 Good 窗口的 miss 没有命中音，deltaMs 恒为 0，不参与换算断言
      expect(slow.deltaMs).toBeCloseTo(deltaSec * 1000, 6);
      expect(normal.deltaMs).toBeCloseTo(deltaSec * 1000, 6);
    }
  });

  it('变速不改变漏按清扫的窗口毫秒数', () => {
    // 96 BPM：160ms = 0.256 拍；48 BPM：160ms = 0.128 拍 —— 都恰好卡在窗口边界上不算漏
    expect(collectMissed(notes, new Set<number>(), 4 + 0.16 / SPB96, SPB96)).toEqual([]);
    expect(collectMissed(notes, new Set<number>(), 4 + 0.16 / SPB48, SPB48)).toEqual([]);
  });
});
