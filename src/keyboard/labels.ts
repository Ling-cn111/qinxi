import { isBlackKey, midiToName } from '@/audio/note';

/**
 * 琴键标注。
 *
 * 三档显示由「显示」面板的三个开关决定：
 * - 显示按键提示 → 键帽上的电脑键盘字符（白键 `G`，黑键 `⇧G`）；
 * - 显示音名 → `C4` / `C♯4`；
 * - 显示唱名 → C 大调固定唱名 `Do` / `♯Do`。
 *
 * 音名与唱名共用键面下方同一行，界面上互斥。
 */
export type NoteLabelMode = 'none' | 'note' | 'solfege';

/** 12 个半音的唱名（黑键沿用下方白键的音节，另加升号） */
const SOLFEGE_BY_PITCH_CLASS = [
  'Do',
  'Do',
  'Re',
  'Re',
  'Mi',
  'Fa',
  'Fa',
  'Sol',
  'Sol',
  'La',
  'La',
  'Si',
] as const;

export function solfegeFor(midi: number): string {
  const pitchClass = ((midi % 12) + 12) % 12;
  const syllable = SOLFEGE_BY_PITCH_CLASS[pitchClass];
  return isBlackKey(midi) ? `♯${syllable}` : syllable;
}

/** 按当前模式取键面上的音名/唱名；`none` 返回 undefined（该行不渲染） */
export function noteLabelFor(midi: number, mode: NoteLabelMode): string | undefined {
  if (mode === 'solfege') return solfegeFor(midi);
  if (mode === 'note') return midiToName(midi);
  return undefined;
}

/**
 * 黑键的键位提示拆成两行：修饰键符号在上、字符在下。
 * `⇧Z` 在 25px 宽的黑键上单行会顶到边框，拆行后 12px 字号也放得下。
 */
export function splitHint(label: string | undefined): { mod: string; char: string } | undefined {
  if (!label) return undefined;
  const match = /^([⇧⌥])(.+)$/.exec(label);
  if (match) return { mod: match[1], char: match[2] };
  return { mod: '', char: label };
}
