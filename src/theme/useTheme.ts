import { ref } from 'vue';
import {
  DEFAULT_THEME_ID,
  findTheme,
  loadThemeId,
  saveThemeId,
  themeVars,
  type Theme,
} from './themes';

/**
 * 当前主题。放在模块级单例里，而不是从 App 逐层传下去：
 * 画布（音符可视化）需要读主题色，菜单需要改主题，两边都直接用它。
 */
export const themeId = ref<string>(loadThemeId());

/** 当前主题对象；id 不合法时回落到默认主题 */
export function activeTheme(): Theme {
  const theme = findTheme(themeId.value) ?? findTheme(DEFAULT_THEME_ID);
  if (!theme) throw new Error(`主题表里没有默认主题 ${DEFAULT_THEME_ID}`);
  return theme;
}

/**
 * 把主题写进 `<html>` 的 CSS 变量上。
 * 变量写在行内样式里，优先级高于 `style.css` 的 `:root` 默认值。
 */
export function applyTheme(id: string, root?: HTMLElement): string {
  const theme = findTheme(id) ?? findTheme(DEFAULT_THEME_ID);
  if (!theme) return DEFAULT_THEME_ID;
  const target = root ?? (typeof document === 'undefined' ? null : document.documentElement);
  if (target) {
    for (const [name, value] of Object.entries(themeVars(theme))) {
      target.style.setProperty(name, value);
    }
    target.dataset.theme = theme.id;
  }
  return theme.id;
}

/** 切换主题：记账 + 落盘 + 立刻生效 */
export function setTheme(id: string): void {
  const theme = findTheme(id);
  if (!theme || theme.id === themeId.value) return;
  themeId.value = theme.id;
  applyTheme(theme.id);
  saveThemeId(theme.id);
}
