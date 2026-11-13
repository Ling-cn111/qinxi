import type { NoteEvent } from '@/types';

/**
 * 「此刻哪些音正在响」——琴键高亮的唯一数据源。
 *
 * 纯函数：给定谱面与当前拍位，返回所有 `startBeat <= beat < startBeat + durationBeats`
 * 的音符。App 的渲染循环（rAF）每个画面帧用它从 `Transport.beat` 推出该亮的键，
 * 时钟与 onTick 同源（都是 `AudioContext.currentTime`），所以高亮不会超前或滞后于声音。
 */
export function activeNotesAt(
  notes: readonly NoteEvent[],
  beat: number,
  epsilon = 1e-9,
): NoteEvent[] {
  const result: NoteEvent[] = [];
  for (const note of notes) {
    const endsAt = note.startBeat + note.durationBeats;
    if (note.startBeat <= beat + epsilon && beat < endsAt - epsilon) {
      result.push(note);
    }
  }
  return result;
}

/** 浅比较两个音高集合是否相同（避免每帧都触发 Vue 重渲染） */
export function samePitchSet(a: ReadonlySet<number>, b: ReadonlySet<number>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}
