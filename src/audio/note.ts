/**
 * MIDI 音高工具 + 播放参数校验。
 * 这一层保持纯函数，方便在 Node 环境下做单元测试（不依赖 AudioContext）。
 */

export const MIN_MIDI = 21; // A0，88 键钢琴最低音
export const MAX_MIDI = 108; // C8，88 键钢琴最高音

const PITCH_CLASS_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** 每个八度中黑键相对根音的半音偏移 */
const BLACK_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);

/** 白键音级（C D E F G A B） */
export const WHITE_PITCH_CLASSES = [0, 2, 4, 5, 7, 9, 11] as const;

export function isBlackKey(midi: number): boolean {
  return BLACK_PITCH_CLASSES.has(((midi % 12) + 12) % 12);
}

/** 是否存在比该白键高半音的黑键（C/D/F/G/A 有，E/B 没有） */
export function hasBlackAbove(midi: number): boolean {
  const pc = ((midi % 12) + 12) % 12;
  return pc === 0 || pc === 2 || pc === 5 || pc === 7 || pc === 9;
}

/** 是否存在比该白键低半音的黑键（D/E/G/A/B 有，C/F 没有） */
export function hasBlackBelow(midi: number): boolean {
  const pc = ((midi % 12) + 12) % 12;
  return pc === 2 || pc === 4 || pc === 7 || pc === 9 || pc === 11;
}

/** 21 → 'A0'，60 → 'C4' */
export function midiToName(midi: number): string {
  const pc = ((midi % 12) + 12) % 12;
  return `${PITCH_CLASS_NAMES[pc]}${Math.floor(midi / 12) - 1}`;
}

/** 'C4' / 'C#4' / 'Ds4'（Salamander 采样命名）→ MIDI；非法输入返回 null */
export function nameToMidi(name: string): number | null {
  const match = /^([A-Ga-g])([#sb]?)(-?\d+)$/.exec(name.trim());
  if (!match) return null;
  const [, letter, accidental, octave] = match;
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[letter.toUpperCase() as 'C'];
  const shift = accidental ? 1 : 0;
  const midi = (Number(octave) + 1) * 12 + base + shift;
  if (midi < 0 || midi > 127) return null;
  return midi;
}

export function noteFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export interface NormalizedNoteParams {
  pitch: number;
  velocity: number;
  /** 已按 `>= now` 修正过的调度时刻（AudioContext 时间轴，单位秒） */
  when: number;
}

/**
 * 校验并归一化一次发声请求。
 * 非法音高 / 力度直接抛 RangeError（这是使用方 bug，必须尽早暴露）；
 * 过期的 `when` 会被夹到 `now`，避免把音频调度排到过去造成爆音。
 */
export function normalizeNoteParams(
  pitch: number,
  velocity = 100,
  when: number = Number.NaN,
  now = 0,
): NormalizedNoteParams {
  if (!Number.isInteger(pitch) || pitch < MIN_MIDI || pitch > MAX_MIDI) {
    throw new RangeError(`音高必须是 ${MIN_MIDI}–${MAX_MIDI} 之间的整数，收到 ${pitch}`);
  }
  if (!Number.isFinite(velocity) || velocity < 0 || velocity > 127) {
    throw new RangeError(`力度必须在 0–127 之间，收到 ${velocity}`);
  }
  const target = Number.isFinite(when) ? Math.max(when, now) : now;
  return { pitch, velocity: Math.round(velocity), when: target };
}

/** 力度（0–127）→ 线性增益（约 0–0.9），带轻微幂曲线以获得更自然的强弱差 */
export function velocityToGain(velocity: number): number {
  const v = Math.min(127, Math.max(0, velocity)) / 127;
  return Math.pow(v, 1.4) * 0.9;
}
