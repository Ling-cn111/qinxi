import { isCustomBinding } from './customKeymap';
import type { CustomBinding } from './keyMap';

/**
 * 键位方案的本地持久化。
 *
 * 一个「方案」= 一组相对默认布局的改动（绑定 / 空置）+ 名字，和 `qinxi:keymap:v1`
 * 里存的是同一种条目，所以应用方案就是把它整段写进当前的改动列表。
 * 只存差量，默认布局以后再调整，老方案也不会跟着错位。
 */
const STORAGE_KEY = 'qinxi:keymap:schemes:v1';

/** 方案名长度上限：再长标签就撑坏「① 键位」那一行了 */
export const MAX_SCHEME_NAME = 16;

export interface KeymapScheme {
  id: string;
  name: string;
  bindings: CustomBinding[];
  createdAt: number;
}

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    // 隐私模式下访问 localStorage 会抛错
    return null;
  }
}

function readName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  if (!name || name.length > MAX_SCHEME_NAME) return null;
  return name;
}

/** 校验一条方案：名字非空且不超长、bindings 里每条都合法、id 唯一（由调用方再去重） */
export function isKeymapScheme(value: unknown): value is KeymapScheme {
  if (!value || typeof value !== 'object') return false;
  const item = value as { id?: unknown; name?: unknown; bindings?: unknown; createdAt?: unknown };
  if (typeof item.id !== 'string' || !item.id) return false;
  if (readName(item.name) === null) return false;
  if (!Array.isArray(item.bindings)) return false;
  return item.bindings.every(isCustomBinding);
}

export function loadKeymapSchemes(): KeymapScheme[] {
  const store = storage();
  if (!store) return [];
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const list: KeymapScheme[] = [];
    for (const entry of parsed) {
      if (!isKeymapScheme(entry)) continue;
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      list.push({
        id: entry.id,
        name: entry.name.trim(),
        bindings: entry.bindings.map((item) => ({ ...item })),
        createdAt: Number.isFinite(entry.createdAt) ? entry.createdAt : Date.now(),
      });
    }
    return list;
  } catch {
    return [];
  }
}

export function saveKeymapSchemes(list: readonly KeymapScheme[]): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // 配额满或被禁用时静默失败：本次会话内的方案仍然可用
  }
}

/**
 * 改动列表的签名：不关心顺序，只关心「哪个音被绑到哪颗键 / 哪个音被空置」。
 * 用来判断当前键位与某个已保存方案是否一致，从而高亮对应的标签。
 */
export function bindingsSignature(list: readonly CustomBinding[]): string {
  return list
    .map((item) => `${item.pitch}:${item.modifier}:${item.code ?? ''}`)
    .sort()
    .join('|');
}

export function newSchemeId(): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `s-${Date.now().toString(36)}-${random}`;
}
