/**
 * 导入谱面的持久化（localStorage）。
 *
 * 存的是**原始文件**（base64 / 文本）而不是解析结果：
 * - 换键位表后重开页面还能按新键位重新映射字符谱；
 * - 解析器升级（拍位换算修正）后老数据自动跟着修正。
 *
 * 体积守卫：localStorage 通常只有 ~5MB，超过 4.5MB 的 base64 不落盘，
 * 本次会话内仍然可用（importedScore 在内存里），只在控制台提醒。
 */

const IMPORT_KEY = 'qinxi:imported:v1';
/** base64 长度上限（约 3.4MB 二进制） */
const MAX_STORED_CHARS = 4_500_000;

export interface StoredImport {
  /** 原始文件名（扩展名决定解析格式） */
  name: string;
  /** 二进制文件的 base64，或纯文本文件的内容 */
  data: string;
  /** data 是 base64 还是明文 */
  encoding: 'base64' | 'text';
}

export interface ImportStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** 浏览器的 localStorage；拿不到（node 测试 / 隐私模式）返回 undefined */
function defaultStore(): ImportStore | undefined {
  try {
    if (typeof globalThis.localStorage !== 'undefined') return globalThis.localStorage;
  } catch {
    /* 访问 localStorage 本身就可能被禁 */
  }
  return undefined;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/** 保存导入的原始文件。超过体积上限返回 false（不落盘，本次会话仍可用） */
export function saveStoredImport(
  stored: StoredImport,
  store: ImportStore | undefined = defaultStore(),
): boolean {
  if (!store) return false;
  if (stored.data.length > MAX_STORED_CHARS) return false;
  try {
    store.setItem(IMPORT_KEY, JSON.stringify(stored));
    return true;
  } catch {
    return false; // 配额满等写入失败：静默降级为「仅本次会话」
  }
}

/** 读取上次导入的原始文件；没有或损坏返回 null（损坏时顺手清掉） */
export function loadStoredImport(
  store: ImportStore | undefined = defaultStore(),
): StoredImport | null {
  if (!store) return null;
  try {
    const raw = store.getItem(IMPORT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredImport;
    if (typeof parsed.name !== 'string' || typeof parsed.data !== 'string') {
      store.removeItem(IMPORT_KEY);
      return null;
    }
    return parsed;
  } catch {
    try {
      store.removeItem(IMPORT_KEY);
    } catch { /* 忽略 */ }
    return null;
  }
}

/** 用户明确移除导入谱面 / 切回内置曲目时清除 */
export function clearStoredImport(store: ImportStore | undefined = defaultStore()): void {
  if (!store) return;
  try {
    store.removeItem(IMPORT_KEY);
  } catch { /* 忽略 */ }
}
