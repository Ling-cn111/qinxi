import type { NoteEvent } from '@/types';

/**
 * 自主学弹（learn）模式的纯逻辑层。
 *
 * 与跟弹的根本区别：**没有时钟推进**。Transport 在学弹里完全不参与计时，
 * 进度由「按对了才往后走」驱动 —— 所以这一层不需要拍位、不需要秒，
 * 只对着谱面下标工作，方便单元测试。
 *
 * ## 核心概念：组（group）
 *
 * 同一 startBeat 的若干音是一组（和弦）。学弹以组为最小推进单位：
 * 组内的音**全部弹出**后，指针才推到下一组；只弹了组里的一部分，
 * 指针留在原地等剩下的音。
 */

/** cursor 所在组的结束下标（不含）。cursor 越界时原样返回 */
export function groupEndIndex(notes: readonly NoteEvent[], cursor: number): number {
  if (cursor < 0 || cursor >= notes.length) return cursor;
  const beat = notes[cursor].startBeat;
  let end = cursor;
  while (end < notes.length && notes[end].startBeat === beat) end += 1;
  return end;
}

/** 弹奏进度的最小结构：调用方可以用 Set<下标>，也可以用 Map<下标, 等级>（同 judge.ts 的约定） */
export interface LearnMarks {
  has(index: number): boolean;
}

/**
 * 学弹按键匹配：在当前组里找「未弹过且音高相同」的音符下标。
 * 没命中（错音 / 该音已弹过）返回空数组 —— 调用方据此只计错音、不推进。
 */
export function findLearnMatch(
  notes: readonly NoteEvent[],
  cursor: number,
  judged: LearnMarks,
  pitch: number,
): number[] {
  if (cursor < 0 || cursor >= notes.length) return [];
  const beat = notes[cursor].startBeat;
  const matched: number[] = [];
  for (let index = cursor; index < notes.length && notes[index].startBeat === beat; index += 1) {
    if (judged.has(index)) continue;
    if (notes[index].pitch === pitch) matched.push(index);
  }
  return matched;
}

/** 当前组是否已全部弹出（调用方据此把指针推到组尾） */
export function isGroupComplete(
  notes: readonly NoteEvent[],
  cursor: number,
  judged: LearnMarks,
): boolean {
  const end = groupEndIndex(notes, cursor);
  for (let index = cursor; index < end; index += 1) {
    if (!judged.has(index)) return false;
  }
  return end > cursor;
}

/**
 * 「下一个要弹的音」的琴键提示集合：从 from 开始找第一个未弹的音，
 * 返回它所在组里所有未弹音符的音高（和弦的几个键一起亮黄）。
 * 全部弹完返回空集合。
 */
export function nextTargetHints(
  notes: readonly NoteEvent[],
  judged: LearnMarks,
  from = 0,
): Set<number> {
  const hints = new Set<number>();
  for (let index = from; index < notes.length; index += 1) {
    if (judged.has(index)) continue;
    const beat = notes[index].startBeat;
    for (let j = index; j < notes.length && notes[j].startBeat === beat; j += 1) {
      if (!judged.has(j)) hints.add(notes[j].pitch);
    }
    break;
  }
  return hints;
}
