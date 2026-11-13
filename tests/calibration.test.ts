import { describe, expect, it } from 'vitest';
import {
  CALIBRATION_OFFSET_LIMIT_MS,
  CALIBRATION_UNSTABLE_STDDEV_MS,
  computeOffset,
  loadInputOffsetMs,
  saveInputOffsetMs,
} from '@/game/calibration';

describe('computeOffset：平均值计算', () => {
  it('稳定玩家：剔除一个最大一个最小后取平均', () => {
    // 剔除 104 与 96，剩 100+103+99+102+98+101 = 603 → /6 = 100.5
    const result = computeOffset([100, 104, 96, 103, 99, 102, 98, 101]);
    expect(result.offsetMs).toBeCloseTo(100.5, 9);
    expect(result.sampleCount).toBe(8);
    expect(result.stable).toBe(true);
  });

  it('典型「按晚」玩家：offset 是正的', () => {
    const result = computeOffset([118, 122, 119, 121, 117, 123, 120, 116]);
    expect(result.offsetMs).toBeGreaterThan(100);
    expect(result.stable).toBe(true);
  });

  it('样本 < 3 时不剔除，全量平均', () => {
    expect(computeOffset([50, 90]).offsetMs).toBeCloseTo(70, 9);
    expect(computeOffset([42]).offsetMs).toBe(42);
  });

  it('空样本：0 且不稳定', () => {
    expect(computeOffset([])).toMatchObject({ offsetMs: 0, stddevMs: 0, sampleCount: 0, stable: false });
  });
});

describe('computeOffset：异常值剔除', () => {
  it('一个手抖极值不影响结果', () => {
    // 剔除 0 与 200，剩 6 个 100 → offset 100
    const result = computeOffset([0, 200, 100, 100, 100, 100, 100, 100]);
    expect(result.offsetMs).toBeCloseTo(100, 9);
    expect(result.stable).toBe(true);
  });

  it('首尾各一个极值（乱按）也被剔掉', () => {
    const result = computeOffset([-500, 100, 99, 101, 100, 98, 102, 700]);
    expect(result.offsetMs).toBeCloseTo(100, 9);
  });

  it('剔除后的标准差才代表稳定度（极值不计入）', () => {
    const result = computeOffset([0, 200, 100, 100, 100, 100, 100, 100]);
    expect(result.stddevMs).toBe(0); // 剩下的全是 100
  });
});

describe('computeOffset：稳定性判定', () => {
  it('标准差超大（没跟上节拍）→ 校准失败', () => {
    const wild = [10, 250, -180, 60, 220, -90, 130, 5];
    const result = computeOffset(wild);
    expect(result.stddevMs).toBeGreaterThan(CALIBRATION_UNSTABLE_STDDEV_MS);
    expect(result.stable).toBe(false);
  });

  it('临界附近：刚好等于阈值算稳定（闭区间）', () => {
    // 构造标准差恰为阈值的样本：[±55 交替] 的总体标准差 = 55
    const samples = [-55, 55, -55, 55, -55, 55, -55, 55];
    const result = computeOffset(samples);
    expect(result.stddevMs).toBeCloseTo(CALIBRATION_UNSTABLE_STDDEV_MS, 6);
    expect(result.stable).toBe(true);
  });

  it('轻微抖动（±15ms）是稳定的', () => {
    const result = computeOffset([100, 115, 85, 110, 90, 105, 95, 100]);
    expect(result.stable).toBe(true);
  });
});

describe('持久化', () => {
  /** 内存版 Storage，模拟 localStorage */
  function memoryStorage(): { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void; data: Map<string, string> } {
    const data = new Map<string, string>();
    return {
      data,
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => data.set(k, v),
    };
  }

  it('存取往返一致', () => {
    const storage = memoryStorage();
    saveInputOffsetMs(storage, -35);
    expect(loadInputOffsetMs(storage)).toBe(-35);
    saveInputOffsetMs(storage, 120.5);
    expect(loadInputOffsetMs(storage)).toBe(120.5);
  });

  it('没有存过 → 默认 0', () => {
    expect(loadInputOffsetMs(memoryStorage())).toBe(0);
  });

  it('坏数据（非数字）→ 回落 0，不抛错', () => {
    const storage = memoryStorage();
    storage.setItem('qinxi:calibration:v1', 'abc');
    expect(loadInputOffsetMs(storage)).toBe(0);
  });

  it('超限值在读取与写入两端都被钳到 ±500', () => {
    const storage = memoryStorage();
    storage.setItem('qinxi:calibration:v1', '9999');
    expect(loadInputOffsetMs(storage)).toBe(CALIBRATION_OFFSET_LIMIT_MS);
    storage.setItem('qinxi:calibration:v1', '-9999');
    expect(loadInputOffsetMs(storage)).toBe(-CALIBRATION_OFFSET_LIMIT_MS);
    saveInputOffsetMs(storage, 8888);
    expect(Number(storage.data.get('qinxi:calibration:v1'))).toBe(CALIBRATION_OFFSET_LIMIT_MS);
  });
});
