import type { CustomBinding } from './keyMap';

/**
 * 自定义键位的本地持久化。
 * 只存「用户改过的」那几条，默认键位仍由 `PianoKeyMap` 生成 ——
 * 这样以后调整默认布局时，老用户的自定义不会跟着错位。
 */
const STORAGE_KEY = 'qinxi:keymap:v1';

const MODIFIERS = new Set(['none', 'shift', 'alt']);

function isCustomBinding(value: unknown): value is CustomBinding {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<CustomBinding>;
  return (
    typeof item.code === 'string' &&
    item.code.length > 0 &&
    typeof item.modifier === 'string' &&
    MODIFIERS.has(item.modifier) &&
    typeof item.pitch === 'number' &&
    Number.isInteger(item.pitch)
  );
}

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    // 隐私模式下访问 localStorage 会抛错
    return null;
  }
}

export function loadCustomBindings(): CustomBinding[] {
  const store = storage();
  if (!store) return [];
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isCustomBinding);
  } catch {
    return [];
  }
}

export function saveCustomBindings(list: readonly CustomBinding[]): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // 配额满或被禁用时静默失败：本次会话仍然生效
  }
}

export function clearCustomBindings(): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(STORAGE_KEY);
  } catch {
    /* 同上 */
  }
}
