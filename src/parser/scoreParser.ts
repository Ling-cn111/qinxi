import type { PianoKeyMap } from '@/keyboard/keyMap';
import type { NoteEvent } from '@/types';
import { normalizeKeyChar } from './chars';

/**
 * AutoPiano / VirtualPiano 风格的字符谱解析器。
 *
 * ## 语法
 *
 * | 写法 | 含义 |
 * | --- | --- |
 * | `g` | 按一下 G 这颗键（发什么音由当前键位表决定），占 1 个 step |
 * | `[gjl]` | 和弦，括号里的键同时按下，整组占 1 个 step |
 * | `-` / `.` | 休止，占 1 个 step（连续写 `---` 就是 3 个 step 的休止） |
 * | `~` | 延长前一个音（和弦则延长其中所有音）1 个 step，本身也占 1 个 step |
 * | 空格 / 换行 | 一段连续的空白算 **1 个 step** 的休止；谱面开头的空白不算 |
 * | `//` 或 `#` 到行尾 | 注释，不占时间 |
 * | `\x` | 转义：把语法符号当琴键用，例如 `\-` 是减号键、`\[` 是左中括号键 |
 *
 * 一个 step 的时值 = `stepBeats` 拍（默认 0.5，即八分音符）。
 * `startBeat` 直接由「第几个 step」推出，不依赖任何播放状态 —— 解析是纯函数。
 *
 * ## 两个刻意的设计
 *
 * - **空白游程只算 1 个 step**：`g   l` 与 `g l`、`g\nl` 等价。
 *   否则手写谱子里对齐用的缩进会变成一串休止。要写长休止请用 `-`。
 * - **解析失败不抛错，记 `warnings`**：社区谱里混进多余字符是常事，
 *   整份谱子因为一个字符报废太粗暴。需要严格模式时传 `strict: true`，直接抛 `ScoreParseError`。
 */

/** 一个 step 的默认时值（拍） */
export const DEFAULT_STEP_BEATS = 0.5;

export interface ParseWarning {
  /** 1 起 */
  line: number;
  /** 1 起 */
  column: number;
  message: string;
  /** 出问题的原字符（如果有） */
  char?: string;
}

export interface ParseOptions {
  /** 键位表：字符 → 音高。请传「默认布局」的表（C2 起），别传跟随视口的那张 */
  keyMap: PianoKeyMap;
  /** 每个 step 的时值（拍），默认 0.5 */
  stepBeats?: number;
  /** 整份谱子的起始拍位，默认 0 */
  startBeat?: number;
  /** 遇到无法解析的字符时是否直接抛错，默认 false（只记 warning） */
  strict?: boolean;
}

export interface ParseResult {
  notes: NoteEvent[];
  warnings: ParseWarning[];
  /** 总 step 数（含休止与延长） */
  steps: number;
  /** 总时长（拍）= steps × stepBeats */
  beats: number;
  /** 和弦个数（含 2 个音以上的方括号组） */
  chordCount: number;
  /** 休止占掉的 step 数 */
  restSteps: number;
}

export class ScoreParseError extends Error {
  readonly warnings: ParseWarning[];

  constructor(warnings: ParseWarning[]) {
    const first = warnings[0];
    super(
      first
        ? `谱面解析失败（${warnings.length} 处）：第 ${first.line} 行第 ${first.column} 列 ${first.message}`
        : '谱面解析失败',
    );
    this.name = 'ScoreParseError';
    this.warnings = warnings;
  }
}

const WHITESPACE = /\s/;

/**
 * 剥掉注释（`//` 或 `#` 到行尾），保留换行。
 *
 * 先剥再解析，而不是在扫描时跳过：否则 `g // 说明` 里 `//` 前那个空格会先算 1 个休止，
 * 注释后的换行再算 1 个，一行注释就白吃 2 个 step。剥掉之后 `g // 说明\nh` 与 `g\nh` 完全等价。
 */
function stripComments(text: string): string {
  if (!text.includes('//') && !text.includes('#')) return text;
  return text
    .split('\n')
    .map((line) => {
      const slash = line.indexOf('//');
      const hash = line.indexOf('#');
      const cuts = [slash, hash].filter((index) => index >= 0);
      return cuts.length === 0 ? line : line.slice(0, Math.min(...cuts));
    })
    .join('\n');
}

export function parseScore(text: string, options: ParseOptions): ParseResult {
  const stepBeats = options.stepBeats ?? DEFAULT_STEP_BEATS;
  if (!Number.isFinite(stepBeats) || stepBeats <= 0) {
    throw new RangeError('stepBeats 必须是正数');
  }
  const startBeat = options.startBeat ?? 0;
  if (!Number.isFinite(startBeat) || startBeat < 0) {
    throw new RangeError('startBeat 不能是负数');
  }

  const { keyMap } = options;
  const source = stripComments(text);
  const notes: NoteEvent[] = [];
  const warnings: ParseWarning[] = [];
  let step = 0;
  let chordCount = 0;
  let restSteps = 0;
  let nextId = 1;
  let line = 1;
  let column = 1;
  let index = 0;
  /** 上一组发声的音：`~` 延长它们 */
  let lastNotes: NoteEvent[] = [];
  /** 谱面开头、以及注释行之后的空白不算休止 */
  let seenContent = false;

  const warn = (message: string, at: { line: number; column: number; char?: string }) => {
    warnings.push({ line: at.line, column: at.column, message, char: at.char });
  };

  function advanceOne(): string {
    const ch = source[index];
    index += 1;
    if (ch === '\n') {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
    return ch;
  }

  /** 把一个键帽字符变成音；解析不出来就记 warning 并返回 null */
  function noteFor(char: string, at: { line: number; column: number }): NoteEvent | null {
    const normalized = normalizeKeyChar(char);
    if (!normalized) {
      warn(`无法识别的字符 “${char}”`, { ...at, char });
      return null;
    }
    const binding = keyMap.findByChar(normalized.char, normalized.modifier);
    if (!binding) {
      warn(`字符 “${char}” 在当前键位表里没有绑定任何琴键`, { ...at, char });
      return null;
    }
    return {
      id: `n${nextId++}`,
      pitch: binding.pitch,
      startBeat: startBeat + step * stepBeats,
      durationBeats: stepBeats,
      keyboardKey: char,
    };
  }

  while (index < source.length) {
    const ch = source[index];

    // ---------------------------------------------------------- 注释
        // ---------------------------------------------------------- 空白
    if (WHITESPACE.test(ch)) {
      while (index < source.length && WHITESPACE.test(source[index])) {
        if (source[index] === '\r') {
          index += 1;
          continue;
        }
        advanceOne();
      }
      // 一段连续空白 = 1 个 step 的休止；谱面开头不算
      if (seenContent) {
        step += 1;
        restSteps += 1;
        lastNotes = [];
      }
      continue;
    }

    seenContent = true;
    const at = { line, column, char: ch };

    // ---------------------------------------------------------- 转义
    if (ch === '\\') {
      advanceOne();
      if (index >= source.length || source[index] === '\r' || source[index] === '\n') {
        warn('转义符 “\\” 后面没有字符', at);
        if (source[index] === '\r') index += 1;
        step += 1;
        restSteps += 1;
        lastNotes = [];
        continue;
      }
      const literal = advanceOne();
      const note = noteFor(literal, at);
      if (note) notes.push(note);
      lastNotes = note ? [note] : [];
      step += 1;
      continue;
    }

    // ---------------------------------------------------------- 和弦
    if (ch === '[') {
      advanceOne();
      const items: string[] = [];
      let closed = false;
      while (index < source.length) {
        const inner = source[index];
        if (inner === '\r') {
          index += 1;
          continue;
        }
        // 和弦不跨行：换行视为漏写右括号
        if (inner === '\n') break;
        if (inner === ']') {
          advanceOne();
          closed = true;
          break;
        }
        if (inner === '\\') {
          advanceOne();
          if (index < source.length) items.push(advanceOne());
          continue;
        }
        items.push(advanceOne());
      }
      if (!closed) warn('和弦缺少右括号 “]”', at);

      const chordNotes: NoteEvent[] = [];
      const usedPitches = new Set<number>();
      for (const item of items) {
        if (WHITESPACE.test(item)) {
          warn('和弦里不能有空白字符', at);
          continue;
        }
        const note = noteFor(item, at);
        if (!note) continue;
        if (usedPitches.has(note.pitch)) continue;
        usedPitches.add(note.pitch);
        chordNotes.push(note);
      }
      if (chordNotes.length === 0) {
        // 空括号当作一个休止 step，谱面网格不塌
        warn('和弦里没有任何可发声的音', at);
        step += 1;
        restSteps += 1;
        lastNotes = [];
        continue;
      }
      notes.push(...chordNotes);
      if (chordNotes.length > 1) chordCount += 1;
      lastNotes = chordNotes;
      step += 1;
      continue;
    }

    // ---------------------------------------------------------- 多余右括号
    if (ch === ']') {
      advanceOne();
      warn('多余的右括号 “]”', at);
      step += 1;
      restSteps += 1;
      lastNotes = [];
      continue;
    }

    // ---------------------------------------------------------- 休止
    if (ch === '-' || ch === '.') {
      advanceOne();
      step += 1;
      restSteps += 1;
      lastNotes = [];
      continue;
    }

    // ---------------------------------------------------------- 延长
    if (ch === '~') {
      advanceOne();
      if (lastNotes.length === 0) {
        warn('“~” 前面没有可延长的音', at);
        step += 1;
        restSteps += 1;
        continue;
      }
      for (const note of lastNotes) note.durationBeats += stepBeats;
      step += 1;
      continue;
    }

    // ---------------------------------------------------------- 单音
    advanceOne();
    const note = noteFor(ch, at);
    if (note) notes.push(note);
    lastNotes = note ? [note] : [];
    step += 1;
  }

  if (options.strict && warnings.length > 0) {
    throw new ScoreParseError(warnings);
  }

  return {
    notes,
    warnings,
    steps: step,
    beats: step * stepBeats,
    chordCount,
    restSteps,
  };
}
