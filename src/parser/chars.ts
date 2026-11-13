import type { KeyModifier } from '@/types';

/**
 * 谱面字符 → 「键帽字符 + 修饰键」。
 *
 * 谱面的字符是**键帽上的字**，不是音名：`g` 表示键盘上标着 G 的那颗键，
 * 具体发哪个音交给 `PianoKeyMap.findByChar()` 决定 —— 这样换键位表、改自定义键位时，
 * 一份谱子仍然按当前键位解释，不需要改谱。
 *
 * 大写字母按 Shift 处理（AutoPiano 社区谱用 `S` / `⇧S` 表示黑键那一颗），
 * 默认的 C 大调布局没有 Shift 绑定，所以大写字符在默认表下会解析失败并给出提示。
 */

/**
 * 主键区可以用在谱面里的标点。
 * `[ ] - . ~` 平时是语法符号，被 `\` 转义后才走到这里（`\-` = 减号键）。
 */
const PUNCTUATION = new Set([',', '/', ';', "'", '=', '\\', '`', '+', '-', '.', '[', ']']);

export interface KeyChar {
  /** 传给 `PianoKeyMap.findByChar` 的键帽字符（小写字母 / 数字 / 标点） */
  char: string;
  modifier: KeyModifier;
}

/**
 * 把谱面里的一个字符规范成键帽字符。
 * 返回 `null` 表示这不是键帽上的字（中文、emoji、语法符号…）。
 */
export function normalizeKeyChar(input: string): KeyChar | null {
  if (input.length !== 1) return null;
  if (input >= 'a' && input <= 'z') return { char: input, modifier: 'none' };
  if (input >= 'A' && input <= 'Z') return { char: input.toLowerCase(), modifier: 'shift' };
  if (input >= '0' && input <= '9') return { char: input, modifier: 'none' };
  if (PUNCTUATION.has(input)) return { char: input, modifier: 'none' };
  // ⇧` 打出的是 ~，被语法占用了，转义后按这个映射还原
  if (input === '~') return { char: '`', modifier: 'shift' };
  return null;
}

/** 语法符号：出现在谱面里不当作音符 */
export const SYNTAX_CHARS = new Set(['[', ']', '-', '.', '~', '\\', '#', '/']);
