import { describe, expect, it } from 'vitest';
import { LEGACY_DRIVE, LEGACY_LOWPASS_HZ, makeSoftClipCurve } from '@/audio/legacyTone';

describe('makeSoftClipCurve（降级染色用的软削波曲线）', () => {
  const curve = makeSoftClipCurve();

  it('曲线长度与默认参数一致', () => {
    expect(curve).toHaveLength(2048);
    expect(makeSoftClipCurve(LEGACY_DRIVE, 512)).toHaveLength(512);
  });

  it('端点归一化到 ±1，且处处有界', () => {
    expect(curve[0]).toBeCloseTo(-1, 6);
    expect(curve[curve.length - 1]).toBeCloseTo(1, 6);
    for (const value of curve) {
      expect(Math.abs(value)).toBeLessThanOrEqual(1.0000001);
    }
  });

  it('奇对称，不引入直流偏移', () => {
    // 偶数长度没有正中采样点，用奇对称性验证：curve[i] 与 curve[n-1-i] 互为相反数
    const n = curve.length;
    for (let i = 0; i < n; i += 137) {
      expect(curve[i] + curve[n - 1 - i]).toBeCloseTo(0, 6);
    }
    expect(Math.abs(curve[n / 2])).toBeLessThan(0.01);
  });

  it('单调递增，不会产生折叠失真', () => {
    for (let i = 1; i < curve.length; i += 1) {
      expect(curve[i]).toBeGreaterThan(curve[i - 1]);
    }
  });

  it('驱动越大，小信号被抬得越多（更"脏"）', () => {
    const soft = makeSoftClipCurve(1);
    const hard = makeSoftClipCurve(4);
    const probe = 1024 + 200; // 输入约 0.2
    expect(hard[probe]).toBeGreaterThan(soft[probe]);
  });

  it('低通截止频率设在 4.2kHz 附近，用于削掉现代采样的高频光泽', () => {
    expect(LEGACY_LOWPASS_HZ).toBeGreaterThan(3000);
    expect(LEGACY_LOWPASS_HZ).toBeLessThan(6000);
  });
});
