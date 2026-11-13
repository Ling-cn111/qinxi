import { parseScore, type ParseResult } from '@/parser/scoreParser';
import type { PianoKeyMap } from '@/keyboard/keyMap';

/**
 * 内置示例谱面。
 *
 * 正文是**真正的字符谱**（和社区谱一个写法），不是先写成 MIDI 再倒推 ——
 * 这样它同时是解析器的验收样本：`tests/scoreParser.test.ts` 会断言解析出来的音高。
 *
 * 默认 C 大调键位（C2 起）那套映射下，中音区的字符是：
 * `g`=C4 `h`=D4 `j`=E4 `k`=F4 `l`=G4 `;`=A4 `'`=B4。
 * 换键位表时谱面字符的落音会跟着变（谱子按字符写，不按音高写）。
 */
export interface BuiltInScore {
  id: string;
  title: string;
  /** 副标题：风格 / 难度提示 */
  subtitle: string;
  bpm: number;
  /** 一个字符的时值（拍） */
  stepBeats: number;
  text: string;
}

export const BUILT_IN_SCORES: readonly BuiltInScore[] = [
  {
    id: 'twinkle',
    title: '小星星',
    subtitle: 'C 大调 · 单音 + 结尾和弦',
    bpm: 96,
    stepBeats: 0.5,
    text: `// 小星星 —— 每行一个乐句，换行处的空白算 1 个 step 的休止
ggll;;l~
kkjjhhg~

llkkjjh~
llkkjjh~

ggll;;l~
kkjjhhg~
[gjl]`,
  },
  {
    id: 'ode-to-joy',
    title: '欢乐颂',
    subtitle: '贝多芬 · C 大调主题',
    bpm: 104,
    stepBeats: 0.5,
    text: `// 欢乐颂 —— E E F G | G F E D | C C D E | E D D
jjkllkjh
hhjkjhh~

jjkllkjh
hhjkhgg~`,
  },
];

export const DEFAULT_SCORE_ID = BUILT_IN_SCORES[0].id;

export function findScore(id: string): BuiltInScore | undefined {
  return BUILT_IN_SCORES.find((item) => item.id === id);
}

/** 按当前键位表把内置谱解析成 NoteEvent[] */
export function loadScore(score: BuiltInScore, keyMap: PianoKeyMap): ParseResult {
  return parseScore(score.text, { keyMap, stepBeats: score.stepBeats });
}
