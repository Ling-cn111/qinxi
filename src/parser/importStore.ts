/**
 * 导入谱面的持久化（localStorage）。
 *
 * 存的是**原始文件**（base64 / 文本）而不是解析结果：
 * - 换键位表后重开页面还能按新键位重新映射字符谱；
 * - 解析器升级（拍位换算修正）后老数据自动跟着修正。
 *
 * 导入谱面是**常驻列表**：切歌不丢、刷新不丢，只有用户点 × 才移除。
 * 体积守卫：localStorage 通常只有 ~5MB，累计超过 4.5MB 的部分不落盘
 * （本次会话内仍可用），只在控制台提醒。
 */

const IMPORTS_KEY = 'qinxi:imports:v1';
/** v1 单条版存档：迁移进列表后清除 */
const LEGACY_KEY = 'qinxi:imported:v1';
/** 全部导入文件 base64 的总字符上限（约 3.4MB 二进制） */
const MAX_TOTAL_CHARS = 4_500_000;

export interface StoredImport {
  /** 运行时条目 id（importEntries 与存档一一对应） */
  id: string;
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

function isValidList(value: unknown): value is StoredImport[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as StoredImport).id === 'string' &&
        typeof (item as StoredImport).name === 'string' &&
        typeof (item as StoredImport).data === 'string',
    )
  );
}

/**
 * 保存整份导入列表，返回实际持久化的条数。
 * 累计体积超过上限时从后往前丢弃（越晚导入的越先丢弃），本次会话内仍可用。
 */
export function saveStoredImports(
  list: readonly StoredImport[],
  store: ImportStore | undefined = defaultStore(),
): number {
  if (!store) return 0;
  let total = 0;
  let kept = 0;
  for (const item of list) {
    if (total + item.data.length > MAX_TOTAL_CHARS) break;
    total += item.data.length;
    kept += 1;
  }
  try {
    store.setItem(IMPORTS_KEY, JSON.stringify(list.slice(0, kept)));
    return kept;
  } catch {
    return 0; // 配额满等写入失败：静默降级为「仅本次会话」
  }
}

/**
 * 读取导入列表。兼容 v1 单条存档（迁移进列表后清掉旧键）；
 * 存档损坏时清空返回 []。
 */
export function loadStoredImports(
  store: ImportStore | undefined = defaultStore(),
): StoredImport[] {
  if (!store) return [];
  try {
    let raw = store.getItem(IMPORTS_KEY);
    const legacyRaw = store.getItem(LEGACY_KEY);
    if (legacyRaw !== null) {
      store.removeItem(LEGACY_KEY);
      if (raw === null) {
        try {
          const old = JSON.parse(legacyRaw) as Partial<StoredImport>;
          if (typeof old.name === 'string' && typeof old.data === 'string') {
            const migrated: StoredImport[] = [
              {
                id: 'legacy-0',
                name: old.name,
                data: old.data,
                encoding: old.encoding === 'text' ? 'text' : 'base64',
              },
            ];
            store.setItem(IMPORTS_KEY, JSON.stringify(migrated));
            raw = JSON.stringify(migrated);
          }
        } catch {
          /* 旧存档损坏：直接丢弃 */
        }
      }
    }
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidList(parsed)) {
      store.removeItem(IMPORTS_KEY);
      return [];
    }
    return parsed;
  } catch {
    try {
      store.removeItem(IMPORTS_KEY);
    } catch {
      /* 忽略 */
    }
    return [];
  }
}

/** 用户明确移除全部导入谱面时清除（逐条移除走 saveStoredImports 重写） */
export function clearStoredImports(store: ImportStore | undefined = defaultStore()): void {
  if (!store) return;
  try {
    store.removeItem(IMPORTS_KEY);
    store.removeItem(LEGACY_KEY);
  } catch {
    /* 忽略 */
  }
}
