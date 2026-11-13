/**
 * 音频增益与包络的纯函数层。
 *
 * AutoPiano 对齐规格：
 * 1. 逐音归一化：加载后按峰值把每个音拉到 -1dBFS（0.89）；
 * 2. 包络：8ms 线性 attack + setTargetAtTime 指数衰减，衰减时常数随音区变化；
 * 3. 总线：默认 0.7，同时活跃 source 超过 12 个时按比例下压，最低 0.4。
 *
 * 这一层不碰 AudioContext，便于单测。
 */

/** 归一化目标峰值 ≈ -1 dBFS */
export const TARGET_PEAK = 0.89;

/** 起音时间（秒） */
export const ATTACK_SECONDS = 0.008;

/** 衰减时常数（秒）：低音 / 中音 / 高音 */
export const DECAY_SECONDS_LOW = 2.5;
export const DECAY_SECONDS_MID = 1.8;
export const DECAY_SECONDS_HIGH = 1.2;

/** 音区边界：低于 C3 算低音，C5 及以上算高音 */
export const LOW_REGISTER_LIMIT = 48;
export const HIGH_REGISTER_LIMIT = 72;

/** 总线基础增益 */
export const BUS_BASE_GAIN = 0.7;
/** 总线限幅下限 */
export const BUS_MIN_GAIN = 0.4;
/** 超过这个复音数开始下压总线 */
export const SOFT_POLYPHONY = 12;

/** 归一化增益的合理区间：避免极安静的采样被放大到爆音 */
const MIN_NORMALIZED_GAIN = 0.05;
const MAX_NORMALIZED_GAIN = 8;

/** 取 AudioBuffer 所有声道的绝对峰值 */
export function peakOf(channels: ArrayLike<Float32Array>): number {
  let peak = 0;
  for (let c = 0; c < channels.length; c += 1) {
    const data = channels[c];
    for (let i = 0; i < data.length; i += 1) {
      const value = data[i] < 0 ? -data[i] : data[i];
      if (value > peak) peak = value;
    }
  }
  return peak;
}

/** gain = target / peak，让该音的峰值落在目标电平 */
export function normalizedGainFor(peak: number, target = TARGET_PEAK): number {
  if (!Number.isFinite(peak) || peak <= 0) return 1;
  const gain = target / peak;
  return Math.min(MAX_NORMALIZED_GAIN, Math.max(MIN_NORMALIZED_GAIN, gain));
}

/** 按音区返回衰减时常数 */
export function decaySecondsForPitch(pitch: number): number {
  if (pitch < LOW_REGISTER_LIMIT) return DECAY_SECONDS_LOW;
  if (pitch < HIGH_REGISTER_LIMIT) return DECAY_SECONDS_MID;
  return DECAY_SECONDS_HIGH;
}

/**
 * 总线增益：基础 0.7 × 用户音量 × 复音下压系数。
 * 活跃数超过 12 时按 12/active 等比衰减，最多压到 0.4（不含用户音量）。
 */
export function busGainFor(activeVoices: number, volume = 1): number {
  const safeVolume = Math.min(1, Math.max(0, volume));
  const active = Math.max(0, activeVoices);
  const duck = active > SOFT_POLYPHONY ? Math.max(BUS_MIN_GAIN / BUS_BASE_GAIN, SOFT_POLYPHONY / active) : 1;
  return BUS_BASE_GAIN * duck * safeVolume;
}
