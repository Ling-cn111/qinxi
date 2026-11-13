import { describe, expect, it } from 'vitest';
import {
  ATTACK_SECONDS,
  BUS_BASE_GAIN,
  BUS_MIN_GAIN,
  busGainFor,
  DECAY_SECONDS_HIGH,
  DECAY_SECONDS_LOW,
  DECAY_SECONDS_MID,
  decaySecondsForPitch,
  normalizedGainFor,
  peakOf,
  SOFT_POLYPHONY,
  TARGET_PEAK,
} from '@/audio/gain';

describe('peakOf', () => {
  it('取所有声道的绝对峰值', () => {
    expect(peakOf([new Float32Array([0, 0.3, -0.7, 0.2])])).toBeCloseTo(0.7, 6);
    // 多声道取最大值
    expect(
      peakOf([new Float32Array([0.1, -0.2]), new Float32Array([0.05, -0.9])]),
    ).toBeCloseTo(0.9, 6);
  });

  it('全零返回 0', () => {
    expect(peakOf([new Float32Array([0, 0, 0])])).toBe(0);
  });
});

describe('normalizedGainFor（逐音归一化到 -1dBFS）', () => {
  it('目标峰值 0.89', () => {
    expect(TARGET_PEAK).toBe(0.89);
  });

  it('峰值 0.445 → 增益 2.0', () => {
    expect(normalizedGainFor(0.445)).toBeCloseTo(2, 6);
  });

  it('峰值 1.0 → 增益 0.89（过载的采样被压下来）', () => {
    expect(normalizedGainFor(1)).toBeCloseTo(0.89, 6);
  });

  it('归一化后峰值恒为 0.89', () => {
    for (const peak of [0.12, 0.35, 0.6, 0.89, 0.98]) {
      expect(peak * normalizedGainFor(peak)).toBeCloseTo(TARGET_PEAK, 6);
    }
  });

  it('静音或非法峰值退化为 1，不会算出 Infinity', () => {
    expect(normalizedGainFor(0)).toBe(1);
    expect(normalizedGainFor(-1)).toBe(1);
    expect(normalizedGainFor(Number.NaN)).toBe(1);
  });

  it('增益被夹在合理区间内', () => {
    expect(normalizedGainFor(1e-6)).toBeLessThanOrEqual(8);
    expect(normalizedGainFor(100)).toBeGreaterThanOrEqual(0.05);
  });
});

describe('decaySecondsForPitch（包络衰减时常数）', () => {
  it('低 / 中 / 高音分别是 2.5 / 1.8 / 1.2 秒', () => {
    expect(DECAY_SECONDS_LOW).toBe(2.5);
    expect(DECAY_SECONDS_MID).toBe(1.8);
    expect(DECAY_SECONDS_HIGH).toBe(1.2);
  });

  it('按 C3(48) / C5(72) 分界', () => {
    expect(decaySecondsForPitch(36)).toBe(2.5); // C2
    expect(decaySecondsForPitch(47)).toBe(2.5); // B2
    expect(decaySecondsForPitch(48)).toBe(1.8); // C3
    expect(decaySecondsForPitch(71)).toBe(1.8); // B4
    expect(decaySecondsForPitch(72)).toBe(1.2); // C5
    expect(decaySecondsForPitch(108)).toBe(1.2); // C8
  });

  it('起音时间是 8ms', () => {
    expect(ATTACK_SECONDS).toBe(0.008);
  });
});

describe('busGainFor（总线限幅）', () => {
  it('默认 0.7', () => {
    expect(BUS_BASE_GAIN).toBe(0.7);
    expect(busGainFor(0)).toBeCloseTo(0.7, 6);
    expect(busGainFor(1)).toBeCloseTo(0.7, 6);
  });

  it('活跃数不超过 12 时不降', () => {
    expect(SOFT_POLYPHONY).toBe(12);
    expect(busGainFor(12)).toBeCloseTo(0.7, 6);
  });

  it('超过 12 个按比例下降', () => {
    expect(busGainFor(13)).toBeCloseTo((0.7 * 12) / 13, 6);
    expect(busGainFor(18)).toBeCloseTo((0.7 * 12) / 18, 6);
  });

  it('最低压到 0.4', () => {
    expect(BUS_MIN_GAIN).toBe(0.4);
    expect(busGainFor(24)).toBeCloseTo(0.4, 6);
    expect(busGainFor(64)).toBeCloseTo(0.4, 6);
  });

  it('用户音量线性作用在总线之上', () => {
    expect(busGainFor(0, 0.5)).toBeCloseTo(0.35, 6);
    expect(busGainFor(0, 0)).toBe(0);
    expect(busGainFor(24, 1)).toBeCloseTo(0.4, 6);
  });
});
