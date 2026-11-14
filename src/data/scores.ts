import { parseScore, type ParseResult } from '@/parser/adapters/textAdapter';
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
    subtitle: '贝多芬 · C 大调主题（完整四句 · 1=C 4/4）',
    bpm: 104,
    stepBeats: 0.5,
    /**
     * 简谱 1=C 4/4（g=1 h=2 j=3 k=4 l=5）。节奏：字符 = 半拍（八分），
     * 四分音符写成「字符 + ~」，二分音符（简谱的 –）= 「字符 + ~~~」；
     * 中段「2 34 3 x」里的 3、4 按标准唱法占一拍（两个八分）。
     */
    text: `// 3 3 4 5 | 5 4 3 2 | 1 1 2 3 | 3 2 2 –
j~j~k~l~l~k~j~h~g~g~h~j~j~h~h~~~
// 欢乐女神，圣洁美丽，灿烂光芒照大地。
// 3 3 4 5 | 5 4 3 2 | 1 1 2 3 | 2 1 1 –
j~j~k~l~l~k~j~h~g~g~h~j~h~g~g~~~
// 我们心中充满热情，来到你的圣殿里。
// 2 2 3 1 | 2 34 3 1 | 2 34 3 2 | 1 2 5 –
h~h~j~g~h~jkj~g~h~jkj~h~g~h~l~~~
// 你的力量能使人们，消除一切分歧。
// 3 3 4 5 | 5 4 3 2 | 1 1 2 3 | 2 1 1 –
j~j~k~l~l~k~j~h~g~g~h~j~h~g~g~~~
// 在你光辉照耀下面，人们团结成兄弟。`,
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
