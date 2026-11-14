import { describe, expect, it } from 'vitest';
import {
  findLearnMatch,
  groupEndIndex,
  isGroupComplete,
  nextTargetHints,
} from '@/game/learn';
import type { NoteEvent } from '@/types';

function note(pitch: number, startBeat: number, durationBeats = 1): NoteEvent {
  return { id: `n${pitch}@${startBeat}`, pitch, startBeat, durationBeats };
}

/** 小汤一号：单音 → 和弦（三音组） → 单音 */
const NOTES: NoteEvent[] = [
  note(60, 0),
  note(60, 4),
  note(64, 8),
  note(67, 8),
  note(72, 8),
  note(64, 12),
];

describe('groupEndIndex：和弦组边界', () => {
  it('单音组的组尾就是下一个下标', () => {
    expect(groupEndIndex(NOTES, 0)).toBe(1);
  });

  it('三音和弦：cursor 指向组首，组尾越过整组', () => {
    expect(groupEndIndex(NOTES, 2)).toBe(5);
  });

  it('cursor 指向和弦组中间的成员，仍然框住整组', () => {
    expect(groupEndIndex(NOTES, 3)).toBe(5);
  });

  it('最后一组返回 notes.length', () => {
    expect(groupEndIndex(NOTES, 5)).toBe(6);
  });

  it('越界的 cursor 原样返回', () => {
    expect(groupEndIndex(NOTES, -1)).toBe(-1);
    expect(groupEndIndex(NOTES, 6)).toBe(6);
  });
});

describe('findLearnMatch：按对才命中', () => {
  it('按对当前音 → 命中该下标', () => {
    expect(findLearnMatch(NOTES, 0, new Set(), 60)).toEqual([0]);
  });

  it('按错音 → 空数组（不推进）', () => {
    expect(findLearnMatch(NOTES, 0, new Set(), 62)).toEqual([]);
  });

  it('和弦组里按其中一个成员音 → 只命中未弹过的那个', () => {
    const judged = new Set([2]);
    expect(findLearnMatch(NOTES, 2, judged, 67)).toEqual([3]);
  });

  it('组内同音高的音都已弹过 → 空数组', () => {
    const judged = new Set([2, 3, 4]);
    expect(findLearnMatch(NOTES, 2, judged, 64)).toEqual([]);
  });

  it('cursor 越界 → 空数组', () => {
    expect(findLearnMatch(NOTES, 99, new Set(), 60)).toEqual([]);
  });
});

describe('isGroupComplete：组内全部弹出才推进', () => {
  it('单音弹过即完整', () => {
    expect(isGroupComplete(NOTES, 0, new Set([0]))).toBe(true);
  });

  it('三音和弦只弹了两个 → 不完整', () => {
    expect(isGroupComplete(NOTES, 2, new Set([2, 4]))).toBe(false);
  });

  it('三音和弦弹满三个 → 完整', () => {
    expect(isGroupComplete(NOTES, 2, new Set([2, 3, 4]))).toBe(true);
  });

  it('空组（越界 cursor）不算完整', () => {
    expect(isGroupComplete(NOTES, 99, new Set())).toBe(false);
  });
});

describe('nextTargetHints：下一个要弹的音（琴键黄提示的数据源）', () => {
  it('从头开始 → 第一个音', () => {
    expect(nextTargetHints(NOTES, new Set())).toEqual(new Set([60]));
  });

  it('跳过已弹的音', () => {
    expect(nextTargetHints(NOTES, new Set([0]))).toEqual(new Set([60]));
    expect(nextTargetHints(NOTES, new Set([0, 1]))).toEqual(new Set([64, 67, 72]));
  });

  it('和弦组未弹满时，提示里只剩还没弹的成员音', () => {
    // 前两组已弹完，第三组（64/67/72）弹了 64 和 72，只剩 67 亮着
    expect(nextTargetHints(NOTES, new Set([0, 1, 2, 4]))).toEqual(new Set([67]));
  });

  it('全部弹完 → 空集合', () => {
    expect(nextTargetHints(NOTES, new Set([0, 1, 2, 3, 4, 5]))).toEqual(new Set());
  });

  it('from 指定起点（学弹模式从 cursor 找）', () => {
    expect(nextTargetHints(NOTES, new Set([2]), 2)).toEqual(new Set([67, 72]));
  });
});
