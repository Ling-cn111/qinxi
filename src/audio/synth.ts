import { noteFrequency } from './note';

/**
 * 离线合成音色（备用采样源）。
 *
 * 用途：当 Salamander 远程采样不可用（离线、被墙、CDN 抖动）时，
 * 用加法合成现场渲染一份「类钢琴」的 AudioBuffer，保证任何时候都能弹响。
 * 它只是兜底，音色不如真实采样，README 中已注明。
 */
export function renderPianoTone(ctx: BaseAudioContext, midi: number, duration = 2.4): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(sampleRate * duration));
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const out = buffer.getChannelData(0);

  const f0 = noteFrequency(midi);
  const nyquist = sampleRate / 2;
  const maxPartials = midi > 84 ? 5 : midi > 72 ? 7 : 10;

  const phases: number[] = [];
  const steps: number[] = [];
  const amps: number[] = [];
  const decays: number[] = [];

  for (let n = 1; n <= maxPartials; n++) {
    // 轻微非谐性，让高次分音听起来更像真实琴弦
    const freq = f0 * n * (1 + 0.0004 * n * n);
    if (freq >= nyquist * 0.9) break;
    phases.push(0);
    steps.push((2 * Math.PI * freq) / sampleRate);
    amps.push(Math.pow(n, -1.25));
    decays.push(Math.exp(-(1.5 + n * 0.55) / sampleRate));
  }

  const partialCount = amps.length;
  // 低音区起音稍慢一点，符合钢琴听感
  const attack = Math.min(0.012, Math.max(0.002, 0.006 + (72 - midi) * 0.0002));
  const attackSamples = Math.max(1, Math.floor(attack * sampleRate));
  let peak = 0;

  for (let i = 0; i < length; i++) {
    let s = 0;
    for (let k = 0; k < partialCount; k++) {
      phases[k] += steps[k];
      s += amps[k] * Math.sin(phases[k]);
      amps[k] *= decays[k];
    }
    const env = i < attackSamples ? i / attackSamples : 1;
    out[i] = s * env;
    const abs = out[i] < 0 ? -out[i] : out[i];
    if (abs > peak) peak = abs;
  }

  const scale = peak > 0 ? 0.85 / peak : 1;
  for (let i = 0; i < length; i++) out[i] *= scale;
  // 尾部 60ms 淡出，避免 buffer 结束时的硬切
  const fade = Math.min(length, Math.floor(sampleRate * 0.06));
  for (let i = 0; i < fade; i++) out[length - 1 - i] *= i / fade;

  return buffer;
}

/** 采样锚点：合成音色每 6 个半音渲染一份，兼顾音质与预渲染耗时 */
export const SYNTH_ANCHOR_STEP = 6;

export function synthAnchorFor(pitch: number, min = 21, max = 108): number {
  const anchor = Math.floor((pitch - min) / SYNTH_ANCHOR_STEP) * SYNTH_ANCHOR_STEP + min;
  return Math.min(max, Math.max(min, anchor));
}
