import type { NoteEvent } from '@/types';

/**
 * 跟弹判定引擎（纯函数，方便单元测试）。
 *
 * ## 判什么
 *
 * 用户按键的瞬间，从 `AudioContext.currentTime` 换算出当前拍位（`hitBeat`），
 * 与谱面里判定线附近的 `NoteEvent` 做**音高 + 时间**双重比对：
 *
 * - **音高**：只匹配同 pitch 的音符；附近没有同音高的音 → 直接 Miss（错音）；
 * - **时间**：按 |偏差| 分档（毫秒，对 96–120 BPM 的手感校准过）：
 *
 * | |偏差| | 判定 |
 * | --- | --- |
 * | ≤ 40ms | Perfect |
 * | 40–80ms | Great |
 * | 80–140ms | Good |
 * | > 140ms / 错音 / 漏按 | Miss |
 *
 * ## 边界约定
 *
 * 档位边界**闭区间**（40ms 整算 Perfect，80ms 整算 Great，140ms 整算 Good），
 * 浮点比较带 1e-9 容差 —— 单元测试用恰好在边界上的值锁死这个行为。
 *
 * ## 本模块刻意不知道的事
 *
 * - 不依赖 `AudioContext`：调用方传入拍位与 `secondsPerBeat`，时间换算也是纯函数；
 * - 不持有「已判定」状态：`judged` 集合由调用方维护（本模块只读），
 *   这样重放 / 撤销 / 统计都由界面层自由决定；
 * - 不要求 notes 有序（线性扫描），但调用方传解析器的有序输出效率一致。
 */

/** Perfect：偏差 ≤ 40ms */
export const PERFECT_MS = 40;
/** Great：偏差 ≤ 80ms */
export const GREAT_MS = 80;
/** Good：偏差 ≤ 140ms；再大就是 Miss */
export const GOOD_MS = 140;

/** 浮点比较容差（拍位） */
const EPS = 1e-9;

export type Grade = 'perfect' | 'great' | 'good' | 'miss';

/** 按毫秒偏差分档。边界闭区间：±40 → Perfect，±80 → Great，±140 → Good。 */
export function gradeForDelta(deltaMs: number): Grade {
  const abs = Math.abs(deltaMs);
  if (abs <= PERFECT_MS) return 'perfect';
  if (abs <= GREAT_MS) return 'great';
  if (abs <= GOOD_MS) return 'good';
  return 'miss';
}

/** 毫秒偏差 → 拍位偏差 */
export function msToBeats(ms: number, secondsPerBeat: number): number {
  return ms / 1000 / secondsPerBeat;
}

/** 拍位偏差 → 毫秒偏差 */
export function beatsToMs(beats: number, secondsPerBeat: number): number {
  return beats * secondsPerBeat * 1000;
}

/**
 * 时间轴换算：某一刻（秒）落在谱面第几拍。
 *
 * Transport 的拍位公式原样抽出来 —— 判定用的 hitBeat 必须和自动播放的
 * 拍位**同一个公式同一个锚点**，否则两边对不上。
 */
export function beatAtTime(
  timeSec: number,
  anchorTimeSec: number,
  anchorBeat: number,
  secondsPerBeat: number,
): number {
  return anchorBeat + (timeSec - anchorTimeSec) / secondsPerBeat;
}

/** 一次按键判定的输入 */
export interface HitInput {
  /** 按下的音高 */
  pitch: number;
  /** 按下时刻的拍位（从 AudioContext.currentTime 换算） */
  hitBeat: number;
}

/** 一次按键的判定结果 */
export interface Judgment {
  /** 命中的音符在 notes 里的下标；没命中任何音符（错音）时为 -1 */
  index: number;
  /** 命中的音符；错音时为 null */
  note: NoteEvent | null;
  /** 按下的音高（错音时它就是按错的那个音） */
  pitch: number;
  grade: Grade;
  /** 按键时刻 − 音符起始拍，换算成毫秒；错音时为 0 */
  deltaMs: number;
}

/** 判定进度的最小结构：调用方可以用 Set<下标>，也可以用 Map<下标, 等级> */
export interface JudgedMarks {
  has(index: number): boolean;
}

/**
 * 判定一次按键。
 *
 * 在**同 pitch 且未被判定过**的音符里找离 hitBeat 最近的一个：
 * - 距离在 Good 窗口（±140ms）内 → 按偏差分档（可能 Perfect / Great / Good）；
 * - 窗口内没有同 pitch 的未判定音符 → Miss（错音或按键太早 / 太晚）。
 *
 * 注意：超出 Good 窗口的按键不消耗音符 —— 音符留给「漏按清扫」去判 Miss
 * （见 `collectMissed`），避免「提前 1 秒乱按一下就把还没落下的音吃掉」。
 */
export function judgeHit(
  input: HitInput,
  notes: readonly NoteEvent[],
  judged: JudgedMarks,
  secondsPerBeat: number,
): Judgment {
  const windowBeats = msToBeats(GOOD_MS, secondsPerBeat);
  let best = -1;
  let bestDist = Number.POSITIVE_INFINITY;

  for (let index = 0; index < notes.length; index += 1) {
    if (judged.has(index)) continue;
    const note = notes[index];
    if (note.pitch !== input.pitch) continue;
    const dist = Math.abs(note.startBeat - input.hitBeat);
    if (dist <= windowBeats + EPS && dist < bestDist) {
      best = index;
      bestDist = dist;
    }
  }

  if (best < 0) {
    return { index: -1, note: null, pitch: input.pitch, grade: 'miss', deltaMs: 0 };
  }
  const note = notes[best];
  const deltaMs = beatsToMs(input.hitBeat - note.startBeat, secondsPerBeat);
  return { index: best, note, pitch: input.pitch, grade: gradeForDelta(deltaMs), deltaMs };
}

/**
 * 漏按清扫：找出「Good 窗口已经完全过去、但还没被判定」的音符下标。
 *
 * 界面层在渲染循环里周期性调用（每帧一次即可），返回的下标由调用方
 * 标记成 Miss 并计入统计。和弦（同一拍的多个音）会一起返回 ——
 * 漏按是按音符算的，漏一个音只 Miss 那一个音。
 */
export function collectMissed(
  notes: readonly NoteEvent[],
  judged: JudgedMarks,
  currentBeat: number,
  secondsPerBeat: number,
): number[] {
  const windowBeats = msToBeats(GOOD_MS, secondsPerBeat);
  const missed: number[] = [];
  for (let index = 0; index < notes.length; index += 1) {
    if (judged.has(index)) continue;
    if (notes[index].startBeat + windowBeats < currentBeat - EPS) missed.push(index);
  }
  return missed;
}
