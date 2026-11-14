import { describe, expect, it } from 'vitest';
import { PianoKeyMap } from '@/keyboard/keyMap';
import { normalizeKeyChar } from '@/parser/chars';
import { parseScore, ScoreParseError } from '@/parser/scoreParser';
import { BUILT_IN_SCORES, findScore, loadScore } from '@/data/scores';

/** 默认键位表（C2 起）：`g`=C4(60) `h`=D4(62) `j`=E4(64) `k`=F4(65) `l`=G4(67) `;`=A4(69) */
const keyMap = new PianoKeyMap();

const pitches = (text: string) => {
  const result = parseScore(text, { keyMap });
  expect(result.warnings).toEqual([]);
  return result.notes.map((note) => note.pitch);
};

const beats = (text: string) => {
  const result = parseScore(text, { keyMap });
  expect(result.warnings).toEqual([]);
  return result.notes.map((note) => note.startBeat);
};

describe('谱面字符表', () => {
  it('字母按小节键帽字符处理，大写按 Shift', () => {
    expect(normalizeKeyChar('g')).toEqual({ char: 'g', modifier: 'none' });
    expect(normalizeKeyChar('G')).toEqual({ char: 'g', modifier: 'shift' });
  });

  it('数字与标点保留原样，中文与空白不认', () => {
    expect(normalizeKeyChar('5')).toEqual({ char: '5', modifier: 'none' });
    expect(normalizeKeyChar(';')).toEqual({ char: ';', modifier: 'none' });
    expect(normalizeKeyChar('中')).toBeNull();
    expect(normalizeKeyChar(' ')).toBeNull();
    expect(normalizeKeyChar('gg')).toBeNull();
  });
});

describe('解析器：时间与音高', () => {
  it('连续字符按 step 排开，startBeat = step × stepBeats', () => {
    const result = parseScore('ggll', { keyMap });
    expect(result.warnings).toEqual([]);
    expect(result.notes.map((note) => note.pitch)).toEqual([60, 60, 67, 67]);
    expect(result.notes.map((note) => note.startBeat)).toEqual([0, 0.5, 1, 1.5]);
    expect(result.notes.every((note) => note.durationBeats === 0.5)).toBe(true);
    expect(result.steps).toBe(4);
    expect(result.beats).toBe(2);
    expect(result.restSteps).toBe(0);
  });

  it('一段连续空白只算 1 个 step：空格、换行、缩进等价', () => {
    expect(beats('g l')).toEqual([0, 1]);
    expect(beats('g   l')).toEqual([0, 1]);
    expect(beats('g\n  l')).toEqual([0, 1]);
    expect(beats('g\n\nl')).toEqual([0, 1]);
  });

  it('谱面开头的空白不算休止', () => {
    const result = parseScore('   g', { keyMap });
    expect(result.notes[0].startBeat).toBe(0);
    expect(result.restSteps).toBe(0);
  });

  it('"-" 与 "." 都是显式休止，各占一个 step', () => {
    expect(beats('g--h')).toEqual([0, 1.5]);
    expect(beats('g..h')).toEqual([0, 1.5]);
    expect(parseScore('g-..', { keyMap }).steps).toBe(4);
  });

  it('自定义 stepBeats 与 startBeat 偏移', () => {
    expect(beats('gg')).toEqual([0, 0.5]);
    const quarter = parseScore('gg', { keyMap, stepBeats: 0.25 });
    expect(quarter.notes.map((note) => note.startBeat)).toEqual([0, 0.25]);
    expect(quarter.beats).toBe(0.5);
    expect(parseScore('g', { keyMap, startBeat: 4 }).notes[0].startBeat).toBe(4);
  });

  it('参数不合法直接报错', () => {
    expect(() => parseScore('g', { keyMap, stepBeats: 0 })).toThrow(RangeError);
    expect(() => parseScore('g', { keyMap, stepBeats: -1 })).toThrow(RangeError);
    expect(() => parseScore('g', { keyMap, startBeat: -1 })).toThrow(RangeError);
  });

  it('音名与字符对应得上（键位表驱动，不是硬编码）', () => {
    expect(pitches('ghjkl')).toEqual([60, 62, 64, 65, 67]);
    expect(pitches(";'")).toEqual([69, 71]);
    expect(pitches('qw')).toEqual([48, 50]); // 上排 C3 D3
    expect(pitches('zm')).toEqual([36, 47]); // 下排 C2 B2
  });

  it('保留谱面原始字符，供键盘谱高亮用', () => {
    const result = parseScore('gj', { keyMap });
    expect(result.notes.map((note) => note.keyboardKey)).toEqual(['g', 'j']);
  });

  it('id 互不重复', () => {
    const result = parseScore('gggg', { keyMap });
    expect(new Set(result.notes.map((note) => note.id)).size).toBe(4);
  });
});

describe('解析器：和弦', () => {
  it('方括号里的音同时发声，整组占 1 个 step', () => {
    const result = parseScore('[gjl]', { keyMap });
    expect(result.warnings).toEqual([]);
    expect(result.notes.map((note) => note.pitch)).toEqual([60, 64, 67]);
    expect(result.notes.every((note) => note.startBeat === 0)).toBe(true);
    expect(result.notes.every((note) => note.durationBeats === 0.5)).toBe(true);
    expect(result.steps).toBe(1);
    expect(result.chordCount).toBe(1);
  });

  it('和弦后面还能接单音', () => {
    const result = parseScore('[gjl]h', { keyMap });
    expect(result.notes.map((note) => note.startBeat)).toEqual([0, 0, 0, 0.5]);
    expect(result.notes[3].pitch).toBe(62);
  });

  it('同一个音在括号里写两次只发一次', () => {
    const result = parseScore('[gg]', { keyMap });
    expect(result.notes).toHaveLength(1);
    expect(result.chordCount).toBe(0);
  });

  it('空括号算 1 个休止 step，网格不塌', () => {
    const result = parseScore('[]g', { keyMap });
    expect(result.notes[0].startBeat).toBe(0.5);
    expect(result.restSteps).toBe(1);
    expect(result.warnings[0].message).toContain('没有任何可发声的音');
  });

  it('漏写右括号：照解析并提示', () => {
    const result = parseScore('[gj', { keyMap });
    expect(result.notes.map((note) => note.pitch)).toEqual([60, 64]);
    expect(result.warnings.some((item) => item.message.includes('缺少右括号'))).toBe(true);
  });

  it('多余的右括号被跳过并提示', () => {
    const result = parseScore('g]h', { keyMap });
    expect(result.notes.map((note) => note.pitch)).toEqual([60, 62]);
    expect(result.warnings[0].message).toContain('多余的右括号');
  });
});

describe('解析器：延长与注释', () => {
  it('"~" 把前一个音延长一个 step', () => {
    const result = parseScore('g~~', { keyMap });
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0].durationBeats).toBe(1.5);
    expect(result.steps).toBe(3);
  });

  it('"~" 作用在和弦上时每个音都延长', () => {
    const result = parseScore('[gjl]~', { keyMap });
    expect(result.notes.every((note) => note.durationBeats === 1)).toBe(true);
  });

  it('前面没有音时 "~" 变成休止并提示', () => {
    const result = parseScore('~g', { keyMap });
    expect(result.notes[0].startBeat).toBe(0.5);
    expect(result.warnings[0].message).toContain('没有可延长的音');
  });

  it('注释不占时间', () => {
    expect(beats('g // 这一行是说明\nh')).toEqual([0, 1]);
    expect(beats('# 标题\ng')).toEqual([0]);
    expect(parseScore('// 只有注释', { keyMap }).steps).toBe(0);
  });

  it('注释里的语法符号不会被当成谱面', () => {
    const result = parseScore('g // [gjl] ~~ 中\nh', { keyMap });
    expect(result.notes.map((note) => note.pitch)).toEqual([60, 62]);
    expect(result.warnings).toEqual([]);
  });
});

describe('解析器：异常输入', () => {
  it('空字符串与纯空白都解析成空谱，不报错', () => {
    for (const text of ['', '   ', '\n\n\t']) {
      const result = parseScore(text, { keyMap });
      expect(result.notes).toEqual([]);
      expect(result.warnings).toEqual([]);
      expect(result.steps).toBe(0);
      expect(result.beats).toBe(0);
    }
  });

  it('非法字符：跳过、占一个 step、给出行列位置', () => {
    const result = parseScore('g中l', { keyMap });
    expect(result.notes.map((note) => note.pitch)).toEqual([60, 67]);
    expect(result.notes.map((note) => note.startBeat)).toEqual([0, 1]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatchObject({ line: 1, column: 2, char: '中' });
  });

  it('行号跟着换行走', () => {
    const result = parseScore('g\nh\n中', { keyMap });
    expect(result.warnings[0].line).toBe(3);
    expect(result.warnings[0].column).toBe(1);
  });

  it('当前键位表里没绑定的键：跳过并提示，不当作错误', () => {
    const result = parseScore('s', { keyMap });
    expect(result.notes).toEqual([]);
    expect(result.warnings[0].message).toContain('没有绑定任何琴键');
    expect(result.steps).toBe(1);
  });

  it('大写字母在默认（仅白键）布局下解析不出来', () => {
    const result = parseScore('G', { keyMap });
    expect(result.notes).toEqual([]);
    expect(result.warnings).toHaveLength(1);
  });

  it('转义后语法符号可以当琴键：\\- 是减号键（B6）', () => {
    const result = parseScore('\\-', { keyMap });
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0].pitch).toBe(95);
    expect(result.notes[0].keyboardKey).toBe('-');
  });

  it('转义符后面什么都没有时提示，不吃掉后续音', () => {
    const result = parseScore('g\\', { keyMap });
    expect(result.notes).toHaveLength(1);
    expect(result.warnings[0].message).toContain('后面没有字符');
  });

  it('strict 模式下有任何 warning 就抛 ScoreParseError', () => {
    expect(() => parseScore('g中', { keyMap, strict: true })).toThrow(ScoreParseError);
    try {
      parseScore('g中', { keyMap, strict: true });
    } catch (error) {
      expect(error).toBeInstanceOf(ScoreParseError);
      expect((error as ScoreParseError).warnings).toHaveLength(1);
      expect((error as ScoreParseError).message).toContain('第 1 行第 2 列');
    }
  });
});

describe('内置谱面', () => {
  it('两首谱都能解析且没有任何 warning', () => {
    for (const score of BUILT_IN_SCORES) {
      const result = loadScore(score, keyMap);
      expect(result.warnings, score.id).toEqual([]);
      expect(result.notes.length, score.id).toBeGreaterThan(10);
    }
  });

  it('小星星：首句音高对得上，末音是两拍的一半（延长）', () => {
    const score = findScore('twinkle');
    expect(score).toBeDefined();
    const result = loadScore(score!, keyMap);
    const firstPhrase = result.notes.slice(0, 7);
    expect(firstPhrase.map((note) => note.pitch)).toEqual([60, 60, 67, 67, 69, 69, 67]);
    expect(firstPhrase[6].durationBeats).toBe(1); // 末尾 `~` 延长了一个 step
    // 6 个乐句 × 7 音 + 结尾和弦 3 音
    expect(result.notes).toHaveLength(45);
    expect(result.chordCount).toBe(1);
  });

  it('小星星结尾是 C 大三和弦（C4 E4 G4 同时响）', () => {
    const result = loadScore(findScore('twinkle')!, keyMap);
    const tail = result.notes.slice(-3);
    expect(tail.map((note) => note.pitch)).toEqual([60, 64, 67]);
    expect(new Set(tail.map((note) => note.startBeat)).size).toBe(1);
  });

  it('欢乐颂：首句 E E F G G F E D，四句 62 音，第二句收在 2 1 1', () => {
    const result = loadScore(findScore('ode-to-joy')!, keyMap);
    expect(result.notes.slice(0, 8).map((note) => note.pitch)).toEqual([64, 64, 65, 67, 67, 65, 64, 62]);
    // 15 + 15 + 17 + 15（四句，末句同第二句）
    expect(result.notes).toHaveLength(62);
    // 第二句（此前误记作 2 2 3 4 3 2 2）：… 1 1 2 3 | 2 1 1 –
    expect(result.notes.slice(15).map((note) => note.pitch)).toEqual([
      64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 62, 60, 60, // 第二句
      62, 62, 64, 60, 62, 64, 65, 64, 60, 62, 64, 65, 64, 62, 60, 62, 67, // 第三句（中段）
      64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 62, 60, 60, // 第四句
    ]);
    // 末音 1（C4，末句收在 2 1 1 –）是二分音符：1 step + 3 个 ~ = 2 拍
    const last = result.notes[result.notes.length - 1];
    expect(last.pitch).toBe(60);
    expect(last.durationBeats).toBe(2);
    // 第三句收在 5（G4）也是二分音符（第三句从下标 30 起，17 个音）
    expect(result.notes[46].pitch).toBe(67);
    expect(result.notes[46].durationBeats).toBe(2);
    // 四分音符 = 字符 + 一个 ~ = 1 拍（首句的 E）
    expect(result.notes[0].durationBeats).toBe(1);
  });

  it('谱面总时长与 BPM / stepBeats 一致（小星星 ≈ 27.5 拍）', () => {
    const score = findScore('twinkle')!;
    const result = loadScore(score, keyMap);
    expect(result.beats).toBe(27.5);
    const seconds = (result.beats / score.bpm) * 60;
    expect(seconds).toBeGreaterThan(15);
    expect(seconds).toBeLessThan(20);
  });
});
