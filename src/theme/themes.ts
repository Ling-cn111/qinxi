/**
 * 外观主题。
 *
 * 主题只改「背景与外壳」：页面底色、顶栏、控制台、面板、强调色。
 * 琴体本身（顶盖黑漆、黑白琴键、键床）不走主题变量，任何主题下都是同一架琴。
 *
 * 加一套新主题：往 `THEMES` 里加一个对象，`tokens` 的字段一个都不能少（类型会卡住），
 * 然后在 `style.css` 的 `:root` 里同步 `stage` 的值（它是首屏默认值，必须与这里一致）。
 */
export interface ThemeTokens {
  /** 页面底色 */
  bg: string;
  /** 更深的底色：输入框、凹陷区 */
  bgDeep: string;
  /** 控制台面板 */
  surface: string;
  /** 面板内的卡片 */
  surface2: string;
  /** 卡片 hover */
  surfaceHover: string;
  /** 卡片禁用 */
  surfaceDim: string;
  /** 选中项背景（强调色淡淡一层） */
  surfaceActive: string;
  /** 选中页签背景 */
  surfaceTab: string;
  /** 正文字色的 RGB 三元组，配合 alpha 使用 */
  inkRgb: string;
  /** 分隔线 / 叠白的 RGB 三元组 */
  wRgb: string;
  /** 强调色 */
  accent: string;
  /** 强调色 RGB 三元组 */
  accentRgb: string;
  /** 强调色的亮版（选中态文字） */
  accentStrong: string;
  /** 强调色的暗版（滑轨填充） */
  accentDim: string;
  /** 危险操作色 */
  danger: string;
  dangerRgb: string;
  dangerStrong: string;
  /** body 的 background-image 整串 */
  backdrop: string;
  /** 强调色发光（赛博风用，其余主题为 none） */
  glow: string;
  /** 音符柱渐变的三段 RGB */
  vizTopRgb: string;
  vizMidRgb: string;
  vizBottomRgb: string;
}

export interface Theme {
  id: string;
  /** 中文名，显示在菜单里 */
  name: string;
  /** 英文小标 */
  latin: string;
  /** 一句话说明 */
  hint: string;
  /** 菜单色块：底色 + 强调色 */
  swatch: readonly [string, string];
  tokens: ThemeTokens;
}

/** 主题 token → CSS 变量名。加字段时这里必须同步，否则 TS 报错。 */
export const THEME_VARS: Readonly<Record<keyof ThemeTokens, string>> = {
  bg: '--qin-bg',
  bgDeep: '--qin-bg-deep',
  surface: '--qin-surface',
  surface2: '--qin-surface-2',
  surfaceHover: '--qin-surface-hover',
  surfaceDim: '--qin-surface-dim',
  surfaceActive: '--qin-surface-active',
  surfaceTab: '--qin-surface-tab',
  inkRgb: '--qin-ink-rgb',
  wRgb: '--qin-w-rgb',
  accent: '--qin-accent',
  accentRgb: '--qin-accent-rgb',
  accentStrong: '--qin-accent-strong',
  accentDim: '--qin-accent-dim',
  danger: '--qin-danger',
  dangerRgb: '--qin-danger-rgb',
  dangerStrong: '--qin-danger-strong',
  backdrop: '--qin-backdrop',
  glow: '--qin-glow',
  vizTopRgb: '--qin-viz-top-rgb',
  vizMidRgb: '--qin-viz-mid-rgb',
  vizBottomRgb: '--qin-viz-bottom-rgb',
};

export const THEMES: readonly Theme[] = [
  {
    id: 'stage',
    name: '舞台',
    latin: 'STAGE',
    hint: '深灰底 · 暖木色顶光',
    swatch: ['#1a1a1a', '#cfa46a'],
    tokens: {
      bg: '#1a1a1a',
      bgDeep: '#141414',
      surface: '#171717',
      surface2: '#202020',
      surfaceHover: '#242424',
      surfaceDim: '#1c1c1c',
      surfaceActive: '#241b12',
      surfaceTab: '#221a12',
      inkRgb: '231, 227, 220',
      wRgb: '255, 255, 255',
      accent: '#cfa46a',
      accentRgb: '207, 164, 106',
      accentStrong: '#e5c79a',
      accentDim: '#b98d55',
      danger: '#8f3a2d',
      dangerRgb: '207, 120, 90',
      dangerStrong: '#e8b4a2',
      backdrop:
        'radial-gradient(1100px 520px at 50% -12%, rgba(150, 108, 66, 0.2), rgba(150, 108, 66, 0) 62%), radial-gradient(760px 420px at 50% 8%, rgba(231, 227, 220, 0.05), rgba(231, 227, 220, 0) 70%)',
      glow: 'none',
      vizTopRgb: '255, 233, 200',
      vizMidRgb: '224, 160, 90',
      vizBottomRgb: '126, 70, 26',
    },
  },
  {
    id: 'cyber',
    name: '赛博',
    latin: 'CYBER',
    hint: '墨蓝底 · 霓虹青网格',
    swatch: ['#06070d', '#38e8ff'],
    tokens: {
      bg: '#06070d',
      bgDeep: '#04050a',
      surface: '#0a0d16',
      surface2: '#0d111c',
      surfaceHover: '#121a29',
      surfaceDim: '#080a12',
      surfaceActive: '#08202b',
      surfaceTab: '#071722',
      inkRgb: '212, 242, 255',
      wRgb: '150, 214, 255',
      accent: '#38e8ff',
      accentRgb: '56, 232, 255',
      accentStrong: '#9df6ff',
      accentDim: '#1c8ea6',
      danger: '#a3214f',
      dangerRgb: '255, 92, 138',
      dangerStrong: '#ff9bbb',
      backdrop:
        'radial-gradient(900px 420px at 50% -8%, rgba(56, 232, 255, 0.16), rgba(56, 232, 255, 0) 64%), radial-gradient(720px 380px at 10% 2%, rgba(255, 60, 172, 0.13), rgba(255, 60, 172, 0) 70%), radial-gradient(720px 380px at 90% 4%, rgba(120, 84, 255, 0.15), rgba(120, 84, 255, 0) 70%), repeating-linear-gradient(0deg, rgba(56, 232, 255, 0.05) 0 1px, rgba(56, 232, 255, 0) 1px 3px), repeating-linear-gradient(90deg, rgba(56, 232, 255, 0.035) 0 1px, rgba(56, 232, 255, 0) 1px 46px), repeating-linear-gradient(0deg, rgba(56, 232, 255, 0.035) 0 1px, rgba(56, 232, 255, 0) 1px 46px)',
      glow: '0 0 14px rgba(56, 232, 255, 0.34)',
      vizTopRgb: '198, 252, 255',
      vizMidRgb: '56, 200, 255',
      vizBottomRgb: '26, 60, 140',
    },
  },
  {
    id: 'ink',
    name: '水墨',
    latin: 'INK',
    hint: '墨底 · 朱砂宣纸纹',
    swatch: ['#121516', '#c8503f'],
    tokens: {
      bg: '#121516',
      bgDeep: '#0b0d0e',
      surface: '#15191a',
      surface2: '#1a1f20',
      surfaceHover: '#1f2526',
      surfaceDim: '#111415',
      surfaceActive: '#2a1512',
      surfaceTab: '#22110f',
      inkRgb: '232, 228, 216',
      wRgb: '226, 220, 205',
      accent: '#c8503f',
      accentRgb: '200, 80, 63',
      accentStrong: '#e0a08e',
      accentDim: '#8f3a2d',
      danger: '#7a2a1f',
      dangerRgb: '214, 104, 74',
      dangerStrong: '#e9a892',
      backdrop:
        'radial-gradient(1100px 520px at 50% -14%, rgba(214, 228, 220, 0.1), rgba(214, 228, 220, 0) 62%), radial-gradient(780px 340px at 16% 0%, rgba(200, 80, 63, 0.08), rgba(200, 80, 63, 0) 70%), repeating-linear-gradient(45deg, rgba(226, 220, 205, 0.032) 0 1px, rgba(226, 220, 205, 0) 1px 74px), repeating-linear-gradient(-45deg, rgba(226, 220, 205, 0.032) 0 1px, rgba(226, 220, 205, 0) 1px 74px), repeating-linear-gradient(0deg, rgba(226, 220, 205, 0.03) 0 1px, rgba(226, 220, 205, 0) 1px 6px), radial-gradient(780px 260px at 24% 104%, rgba(226, 220, 205, 0.05), rgba(226, 220, 205, 0) 70%), radial-gradient(620px 200px at 66% 100%, rgba(226, 220, 205, 0.04), rgba(226, 220, 205, 0) 72%), linear-gradient(180deg, rgba(21, 25, 26, 0) 56%, rgba(226, 220, 205, 0.035) 100%), linear-gradient(180deg, #15191a, #0c0e0f)',
      glow: 'none',
      vizTopRgb: '246, 226, 206',
      vizMidRgb: '200, 104, 82',
      vizBottomRgb: '86, 40, 32',
    },
  },
];

export const DEFAULT_THEME_ID = 'stage';
export const THEME_STORAGE_KEY = 'qinxi:theme:v1';

export function findTheme(id: string): Theme | undefined {
  return THEMES.find((item) => item.id === id);
}

/** 主题 → CSS 变量表，直接给 `style.setProperty` 用 */
export function themeVars(theme: Theme): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [key, varName] of Object.entries(THEME_VARS)) {
    vars[varName] = theme.tokens[key as keyof ThemeTokens];
  }
  return vars;
}

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    // 隐私模式下访问 localStorage 会抛错
    return null;
  }
}

/** 读上次选的主题；未知 id / 存储坏了都回落到默认主题 */
export function loadThemeId(): string {
  const store = storage();
  if (!store) return DEFAULT_THEME_ID;
  try {
    const raw = store.getItem(THEME_STORAGE_KEY);
    return raw && findTheme(raw) ? raw : DEFAULT_THEME_ID;
  } catch {
    return DEFAULT_THEME_ID;
  }
}

export function saveThemeId(id: string): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(THEME_STORAGE_KEY, id);
  } catch {
    // 配额满或被禁用时静默失败：本次会话仍然生效
  }
}
