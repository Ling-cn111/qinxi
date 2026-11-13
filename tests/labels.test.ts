import { describe, expect, it } from 'vitest';
import { noteLabelFor, solfegeFor, splitHint } from '@/keyboard/labels';

describe('琴键标注', () => {
  it('白键唱名按 C 大调固定唱名法', () => {
    expect(solfegeFor(60)).toBe('Do'); // C4
    expect(solfegeFor(62)).toBe('Re');
    expect(solfegeFor(64)).toBe('Mi');
    expect(solfegeFor(65)).toBe('Fa');
    expect(solfegeFor(67)).toBe('Sol');
    expect(solfegeFor(69)).toBe('La');
    expect(solfegeFor(71)).toBe('Si');
  });

  it('黑键唱名用升号 + 下方白键的音节', () => {
    expect(solfegeFor(61)).toBe('♯Do'); // C#4
    expect(solfegeFor(66)).toBe('♯Fa');
    expect(solfegeFor(70)).toBe('♯La');
    expect(solfegeFor(37)).toBe('♯Do'); // C#2，低音区同样成立
  });

  it('跨八度不改变唱名（固定唱名，非首调）', () => {
    expect(solfegeFor(36)).toBe('Do');
    expect(solfegeFor(48)).toBe('Do');
    expect(solfegeFor(72)).toBe('Do');
  });

  it('三档音名模式互不串味', () => {
    expect(noteLabelFor(61, 'note')).toBe('C#4');
    expect(noteLabelFor(61, 'solfege')).toBe('♯Do');
    expect(noteLabelFor(61, 'none')).toBeUndefined();
  });

  it('黑键提示拆成「修饰键 + 字符」两行', () => {
    expect(splitHint('⇧Z')).toEqual({ mod: '⇧', char: 'Z' });
    expect(splitHint('⌥X')).toEqual({ mod: '⌥', char: 'X' });
    expect(splitHint('G')).toEqual({ mod: '', char: 'G' });
    expect(splitHint(undefined)).toBeUndefined();
  });
});
