import { describe, expect, it } from 'vitest';
import {
  accuracyOf,
  applyGradeToCombo,
  isHit,
  ratingFor,
  RATING_THRESHOLDS,
  type ComboState,
} from '@/game/combo';
import type { Grade } from '@/game/judge';

/** 便捷构造：当前连击 c、最大连击 m */
const state = (combo: number, maxCombo = combo): ComboState => ({ combo, maxCombo });

describe('连击状态机', () => {
  it('Perfect / Good 都让连击 +1', () => {
    const grades: Grade[] = ['perfect', 'good'];
    for (const grade of grades) {
      expect(applyGradeToCombo(state(5, 9), grade).combo).toBe(6);
    }
  });

  it('连续击中时连击逐次累加', () => {
    let current = state(0);
    for (let i = 0; i < 12; i += 1) {
      current = applyGradeToCombo(current, 'perfect');
    }
    expect(current.combo).toBe(12);
    expect(current.maxCombo).toBe(12);
  });

  it('Miss 让连击瞬间归零，但 maxCombo 保留', () => {
    let current = state(0);
    for (let i = 0; i < 7; i += 1) current = applyGradeToCombo(current, 'good');
    expect(current).toEqual({ combo: 7, maxCombo: 7 });
    current = applyGradeToCombo(current, 'miss');
    expect(current.combo).toBe(0);
    expect(current.maxCombo).toBe(7);
    // 归零后重新连，maxCombo 不被更小的连击数压低
    current = applyGradeToCombo(current, 'perfect');
    current = applyGradeToCombo(current, 'perfect');
    expect(current).toEqual({ combo: 2, maxCombo: 7 });
  });

  it('maxCombo 只增不减：短连击不会回写历史最大值', () => {
    let current = state(0, 20);
    current = applyGradeToCombo(current, 'good');
    current = applyGradeToCombo(current, 'good');
    expect(current).toEqual({ combo: 2, maxCombo: 20 });
  });

  it('混合序列：整局重放得到正确的 combo / maxCombo 轨迹', () => {
    const sequence: Grade[] = [
      'perfect', 'perfect', 'good', 'good', 'miss',
      'good', 'good', 'perfect', 'perfect', 'perfect',
      'miss', 'miss', 'perfect',
    ];
    let current = state(0);
    const combos: number[] = [];
    for (const grade of sequence) {
      current = applyGradeToCombo(current, grade);
      combos.push(current.combo);
    }
    expect(combos).toEqual([1, 2, 3, 4, 0, 1, 2, 3, 4, 5, 0, 0, 1]);
    expect(current.maxCombo).toBe(5);
  });

  it('isHit：Perfect / Good 为 true，Miss 为 false', () => {
    expect(isHit('perfect')).toBe(true);
    expect(isHit('good')).toBe(true);
    expect(isHit('miss')).toBe(false);
  });
});

describe('准确率计算', () => {
  it('准确率 = 击中数 / 总判定数', () => {
    expect(accuracyOf({ perfect: 43, good: 2, miss: 5 })).toBe(45 / 50);
  });

  it('全部击中为 1，全部 Miss 为 0', () => {
    expect(accuracyOf({ perfect: 10, good: 0, miss: 0 })).toBe(1);
    expect(accuracyOf({ perfect: 0, good: 0, miss: 10 })).toBe(0);
  });

  it('总判定数为 0 时准确率约定为 0（不产生 NaN）', () => {
    expect(accuracyOf({ perfect: 0, good: 0, miss: 0 })).toBe(0);
  });

  it('错音计入 Miss（乱按照罚）', () => {
    // 9 击中 1 miss → 0.9；错音多按不会让准确率超过 1
    expect(accuracyOf({ perfect: 9, good: 0, miss: 1 })).toBeCloseTo(0.9);
  });
});

describe('评级', () => {
  it('阈值边界闭区间：95/90/80/70 整算高档', () => {
    expect(ratingFor(RATING_THRESHOLDS.S)).toBe('S');
    expect(ratingFor(RATING_THRESHOLDS.A)).toBe('A');
    expect(ratingFor(RATING_THRESHOLDS.B)).toBe('B');
    expect(ratingFor(RATING_THRESHOLDS.C)).toBe('C');
  });

  it('阈值下方一点掉档', () => {
    expect(ratingFor(0.9499)).toBe('A');
    expect(ratingFor(0.8999)).toBe('B');
    expect(ratingFor(0.7999)).toBe('C');
    expect(ratingFor(0.6999)).toBe('D');
  });

  it('五个评级各有一例', () => {
    expect(ratingFor(1)).toBe('S');
    expect(ratingFor(0.92)).toBe('A');
    expect(ratingFor(0.85)).toBe('B');
    expect(ratingFor(0.75)).toBe('C');
    expect(ratingFor(0.5)).toBe('D');
  });
});
