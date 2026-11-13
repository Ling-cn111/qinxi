import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_THEME_ID,
  findTheme,
  loadThemeId,
  saveThemeId,
  THEMES,
  THEME_STORAGE_KEY,
  THEME_VARS,
  themeVars,
  type ThemeTokens,
} from '@/theme/themes';
import { applyTheme, setTheme, themeId } from '@/theme/useTheme';

function fakeStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key: string) => data.get(key) ?? null,
    key: (index: number) => [...data.keys()][index] ?? null,
    removeItem: (key: string) => void data.delete(key),
    setItem: (key: string, value: string) => void data.set(key, value),
  } as Storage;
}

/** 用一个只有 style.setProperty + dataset 的壳冒充 <html> */
function fakeRoot() {
  const vars = new Map<string, string>();
  return {
    vars,
    dataset: {} as Record<string, string>,
    style: {
      setProperty: (name: string, value: string) => void vars.set(name, value),
      getPropertyValue: (name: string) => vars.get(name) ?? '',
    },
  };
}

/** 读出 style.css 里 :root 的默认值，用来跟 stage 主题对齐 */
function rootDefaults(): Map<string, string> {
  const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
  const block = css.slice(css.indexOf(':root'), css.indexOf('font-family'));
  const out = new Map<string, string>();
  const pattern = /(--qin-[a-z0-9-]+):\s*([^;]+);/g;
  let hit = pattern.exec(block);
  while (hit) {
    out.set(hit[1], hit[2].replace(/\s+/g, ' ').trim());
    hit = pattern.exec(block);
  }
  return out;
}

afterEach(() => {
  vi.unstubAllGlobals();
  setTheme(DEFAULT_THEME_ID);
});

describe('外观主题表', () => {
  it('id 唯一，且默认主题存在', () => {
    const ids = THEMES.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(findTheme(DEFAULT_THEME_ID)).toBeDefined();
  });

  it('每套主题都有中文名、英文小标和说明，菜单才排得下', () => {
    for (const theme of THEMES) {
      expect(theme.name.length).toBeGreaterThan(0);
      expect(theme.latin.length).toBeGreaterThan(0);
      expect(theme.hint.length).toBeGreaterThan(0);
      expect(theme.swatch).toHaveLength(2);
    }
  });

  it('每套主题的 token 都填满，没有空字符串', () => {
    for (const theme of THEMES) {
      for (const [key, value] of Object.entries(theme.tokens)) {
        expect(value, `${theme.id}.${key}`).toBeTruthy();
        expect(typeof value).toBe('string');
      }
    }
  });

  it('token 名与 CSS 变量一一对应', () => {
    const tokenKeys = Object.keys(THEMES[0].tokens).sort();
    expect(Object.keys(THEME_VARS).sort()).toEqual(tokenKeys);
    for (const varName of Object.values(THEME_VARS)) {
      expect(varName.startsWith('--qin-')).toBe(true);
    }
    expect(new Set(Object.values(THEME_VARS)).size).toBe(tokenKeys.length);
  });

  it('themeVars 输出全部变量，且值与主题一致', () => {
    const stage = findTheme('stage');
    expect(stage).toBeDefined();
    const vars = themeVars(stage!);
    const keys = Object.keys(stage!.tokens) as Array<keyof ThemeTokens>;
    expect(Object.keys(vars)).toHaveLength(keys.length);
    for (const key of keys) {
      expect(vars[THEME_VARS[key]]).toBe(stage!.tokens[key]);
    }
  });

  it('style.css 的 :root 默认值与 stage 主题完全一致（首屏不闪）', () => {
    const stage = findTheme('stage');
    expect(stage).toBeDefined();
    const defaults = rootDefaults();
    for (const [key, varName] of Object.entries(THEME_VARS)) {
      const expected = stage!.tokens[key as keyof ThemeTokens];
      expect(defaults.get(varName), varName).toBe(expected.replace(/\s+/g, ' ').trim());
    }
  });
});

describe('主题应用与持久化', () => {
  it('applyTheme 把变量写到根节点，并打上 data-theme', () => {
    const root = fakeRoot();
    const applied = applyTheme('cyber', root as unknown as HTMLElement);
    expect(applied).toBe('cyber');
    expect(root.dataset.theme).toBe('cyber');
    expect(root.vars.get('--qin-bg')).toBe(findTheme('cyber')!.tokens.bg);
    expect(root.vars.get('--qin-accent')).toBe(findTheme('cyber')!.tokens.accent);
  });

  it('未知 id 回落到默认主题，不抛错', () => {
    const root = fakeRoot();
    expect(applyTheme('nope', root as unknown as HTMLElement)).toBe(DEFAULT_THEME_ID);
    expect(root.dataset.theme).toBe(DEFAULT_THEME_ID);
  });

  it('没有 localStorage 时读回默认主题，写入不抛错', () => {
    expect(loadThemeId()).toBe(DEFAULT_THEME_ID);
    expect(() => saveThemeId('cyber')).not.toThrow();
  });

  it('保存后能读回；存了不认识的 id 则回落默认', () => {
    vi.stubGlobal('localStorage', fakeStorage());
    saveThemeId('china');
    expect(loadThemeId()).toBe('china');
    localStorage.setItem(THEME_STORAGE_KEY, 'nope');
    expect(loadThemeId()).toBe(DEFAULT_THEME_ID);
  });

  it('setTheme 切换单例、落盘并生效；同名重复调用是空操作', () => {
    vi.stubGlobal('localStorage', fakeStorage());
    setTheme('china');
    expect(themeId.value).toBe('china');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('china');
    expect(() => setTheme('china')).not.toThrow();
    setTheme('not-a-theme');
    expect(themeId.value).toBe('china');
  });
});
