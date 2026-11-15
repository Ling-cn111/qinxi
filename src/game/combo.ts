/**
 * 连击（Combo）状态机与成绩结算（纯函数，方便单元测试）。
 *
 * ## 连击规则
 *
 * - Perfect / Good 都算「击中」，连击 +1；
 * - Miss（错音 / 漏按 / 太早太晚）**瞬间归零**；
 * - `maxCombo` 只增不减，用于结算面板的「Max Combo」。
 *
 * 状态由调用方持有（界面层放 `ref` 里），本模块只做纯转移：传入旧状态与
 * 本次判定档位，返回新状态 —— 不依赖 Vue / AudioContext，可以整局重放。
 *
 * ## 结算
 *
 * - **准确率** = 击中数 / 总判定数（Miss 也计入分母，乱按的错音照罚）；
 * - **评级**按准确率分档：≥95% S、≥90% A、≥80% B、≥70% C、其余 D
 *   （边界闭区间，95% 整算 S）。
 */

import type { Grade } from './judge';

/** 连击状态：当前连击数 + 本局最大连击数 */
export interface ComboState {
  combo: number;
  maxCombo: number;
}

/** 三档计数的形状（调用方可以是 reactive 对象，本模块只读） */
export interface GradeCounts {
  perfect: number;
  good: number;
  miss: number;
}

/** Miss 之外都连击 */
export function isHit(grade: Grade): boolean {
  return grade !== 'miss';
}

/**
 * 连击状态转移：击中 +1（并推高 maxCombo），Miss 归零（maxCombo 不动）。
 * 返回新对象，不改传入状态 —— 调用方想原地写也可以直接抄字段。
 */
export function applyGradeToCombo(state: ComboState, grade: Grade): ComboState {
  if (grade === 'miss') {
    return { combo: 0, maxCombo: state.maxCombo };
  }
  const combo = state.combo + 1;
  return { combo, maxCombo: Math.max(state.maxCombo, combo) };
}

/** 准确率：击中数 / 总判定数；总判定数为 0 时约定为 0（避免 NaN） */
export function accuracyOf(counts: GradeCounts): number {
  const hits = counts.perfect + counts.good;
  const total = hits + counts.miss;
  return total === 0 ? 0 : hits / total;
}

/** 评级阈值：≥95% S / ≥90% A / ≥80% B / ≥70% C / 其余 D（边界闭区间） */
export const RATING_THRESHOLDS = { S: 0.95, A: 0.9, B: 0.8, C: 0.7 } as const;

export type Rating = 'S' | 'A' | 'B' | 'C' | 'D';

/** 准确率（0–1）→ 评级字母 */
export function ratingFor(accuracy: number): Rating {
  if (accuracy >= RATING_THRESHOLDS.S) return 'S';
  if (accuracy >= RATING_THRESHOLDS.A) return 'A';
  if (accuracy >= RATING_THRESHOLDS.B) return 'B';
  if (accuracy >= RATING_THRESHOLDS.C) return 'C';
  return 'D';
}
