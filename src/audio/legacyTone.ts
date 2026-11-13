/**
 * 降级音色链：只在「本地 AutoPiano 采样和 Salamander 采样都拿不到」时才启用。
 *
 * 目的不是变好听，而是把过于干净/现代的采样听感压回「老旧录音」的质感：
 * 一条 4.2kHz 低通削掉高频光泽，再叠一层 tanh 软削波带来轻微谐波染色。
 */

/** 低通截止频率（Hz） */
export const LEGACY_LOWPASS_HZ = 4200;

/** 软削波驱动量，1 = 几乎线性，越大越脏 */
export const LEGACY_DRIVE = 2.2;

/**
 * 生成 tanh 软削波曲线。
 * 纯函数，便于单测：曲线单调、过零点为 0、端点归一化到 ±1、有界。
 */
export function makeSoftClipCurve(drive = LEGACY_DRIVE, samples = 2048): Float32Array {
  const curve = new Float32Array(samples);
  const norm = Math.tanh(drive);
  for (let i = 0; i < samples; i += 1) {
    const x = (i / (samples - 1)) * 2 - 1;
    curve[i] = Math.tanh(drive * x) / norm;
  }
  return curve;
}

export interface ToneChain {
  input: AudioNode;
  output: AudioNode;
}

export function createLegacyToneChain(ctx: AudioContext): ToneChain {
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = LEGACY_LOWPASS_HZ;
  lowpass.Q.value = 0.6;

  const shaper = ctx.createWaveShaper();
  shaper.curve = makeSoftClipCurve();
  shaper.oversample = '2x';

  lowpass.connect(shaper);
  return { input: lowpass, output: shaper };
}
