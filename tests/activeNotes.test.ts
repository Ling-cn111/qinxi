import { describe, expect, it } from 'vitest';
import type { NoteEvent } from '@/types';
import { activeNotesAt, samePitchSet } from '@/transport/activeNotes';

const note = (pitch: number, startBeat: number, durationBeats = 0.5): NoteEvent => ({
  id: `n${pitch}@${startBeat}`,
  pitch,
  startBeat,
  durationBeats,
});

const SCORE = [
  note(60, 0, 1), // C4 整拍
  note(64, 1, 0.5),
  note(67, 1, 0.5), // 与 E4 同拍（和弦）
  note(69, 2, 1.5), // A4 拖 1.5 拍
];

describe('activeNotesAt：琴键高亮的数据源', () => {
  it('起拍瞬间就算「正在响」', () => {
    expect(activeNotesAt(SCORE, 0).map((n) => n.pitch)).toEqual([60]);
  });

  it('结束拍那一瞬已经不算（松开）', () => {
    expect(activeNotesAt(SCORE, 1).map((n) => n.pitch)).toEqual([64, 67]);
    expect(activeNotesAt(SCORE, 0.999).map((n) => n.pitch)).toEqual([60]);
  });

  it('和弦里的音同一时刻全部亮起', () => {
    expect(activeNotesAt(SCORE, 1.25).map((n) => n.pitch)).toEqual([64, 67]);
  });

  it('延长的音持续亮到结束拍为止', () => {
    expect(activeNotesAt(SCORE, 3).map((n) => n.pitch)).toEqual([69]);
    expect(activeNotesAt(SCORE, 3.5)).toEqual([]);
  });

  it('浮点抖动在容差内不闪断', () => {
    // beat = 0.9999999 仍应算第 0 拍的音
    expect(activeNotesAt(SCORE, 1 - 1e-7).map((n) => n.pitch)).toEqual([60]);
  });

  it('谱面之外的拍位返回空，负数与越界都安全', () => {
    expect(activeNotesAt(SCORE, -1)).toEqual([]);
    expect(activeNotesAt(SCORE, 99)).toEqual([]);
  });

  it('空谱永远为空', () => {
    expect(activeNotesAt([], 0)).toEqual([]);
  });
});

describe('samePitchSet：避免每帧重渲染', () => {
  it('相同内容视为相同（无论插入顺序）', () => {
    expect(samePitchSet(new Set([60, 64]), new Set([64, 60]))).toBe(true);
    expect(samePitchSet(new Set(), new Set())).toBe(true);
  });

  it('数量或内容不同视为不同', () => {
    expect(samePitchSet(new Set([60]), new Set([60, 64]))).toBe(false);
    expect(samePitchSet(new Set([60]), new Set([62]))).toBe(false);
  });
});
