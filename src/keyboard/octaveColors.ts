/**
 * 八度配色。
 *
 * 每个八度一组颜色，键面标注与键盘图共用同一套，方便一眼定位「这一组是哪个音阶」。
 * 白键上用深色版、黑键上用浅色版 —— 不是两套色，是同一个色相在两种底色上的可读版本。
 * 整体压得比较灰，避免变成彩虹色块。
 */
export interface OctaveColor {
  /** 白键上的文字色（需要够深） */
  ink: string;
  /** 黑键上的文字色（需要够亮） */
  bright: string;
}

/** 索引 = 八度号（C4 所在组为 4） */
const PALETTE: readonly OctaveColor[] = [
  { ink: '#55606e', bright: '#9dafc4' }, // 0 石墨
  { ink: '#2c7a68', bright: '#86c7b4' }, // 1 青
  { ink: '#3d7a2b', bright: '#99c98a' }, // 2 绿
  { ink: '#9a6210', bright: '#e0ad5c' }, // 3 琥珀（对比度最高的中央区）
  { ink: '#b23a26', bright: '#e5907d' }, // 4 砖红
  { ink: '#a1335b', bright: '#dd93ae' }, // 5 玫红
  { ink: '#464b9c', bright: '#a6a9de' }, // 6 靛
  { ink: '#1f6a83', bright: '#8bbcd4' }, // 7 蓝绿
  { ink: '#5f5f5f', bright: '#a9a9a9' }, // 8 灰
];

export const MIN_OCTAVE = 0;
export const MAX_OCTAVE = PALETTE.length - 1;

/** 21（A0）→ 0，60（C4）→ 4 */
export function octaveOf(midi: number): number {
  return Math.floor(midi / 12) - 1;
}

function clampOctave(octave: number): number {
  if (octave < MIN_OCTAVE) return MIN_OCTAVE;
  if (octave > MAX_OCTAVE) return MAX_OCTAVE;
  return octave;
}

export function octaveColor(midi: number): OctaveColor {
  return PALETTE[clampOctave(octaveOf(midi))];
}

/** 取某个音在指定底色上的标注颜色 */
export function colorForPitch(midi: number, onBlack: boolean): string {
  const color = octaveColor(midi);
  return onBlack ? color.bright : color.ink;
}

/** 调色板本身（测试与图例用） */
export function octavePalette(): readonly OctaveColor[] {
  return PALETTE;
}
