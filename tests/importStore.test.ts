import { describe, expect, it } from 'vitest';
import {
  base64ToBytes,
  bytesToBase64,
  clearStoredImports,
  loadStoredImports,
  saveStoredImports,
  type ImportStore,
  type StoredImport,
} from '@/parser/importStore';

const KEY = 'qinxi:imports:v1';
const LEGACY_KEY = 'qinxi:imported:v1';

/** Map 版 localStorage 桩（node 环境没有 localStorage） */
function shim(): ImportStore & { dump(): Map<string, string> } {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
    dump: () => map,
  };
}

const ITEM_A: StoredImport = { id: 'i-a', name: 'a.mid', data: 'TVRoZAA=', encoding: 'base64' };
const ITEM_B: StoredImport = { id: 'i-b', name: 'b.musicxml', data: '<score/>', encoding: 'text' };

describe('importStore：导入谱面持久化（常驻列表）', () => {
  it('base64 往返无损（含 0x80 以上的字节）', () => {
    const bytes = Uint8Array.from([0x4d, 0x54, 0x68, 0x64, 0x00, 0xff, 0x80, 0x7f]);
    const restored = base64ToBytes(bytesToBase64(bytes));
    expect([...restored]).toEqual([...bytes]);
  });

  it('保存多条后能原样读回', () => {
    const store = shim();
    expect(saveStoredImports([ITEM_A, ITEM_B], store)).toBe(2);
    expect(loadStoredImports(store)).toEqual([ITEM_A, ITEM_B]);
  });

  it('重写列表 = 移除条目（逐条 × 的实现路径）', () => {
    const store = shim();
    saveStoredImports([ITEM_A, ITEM_B], store);
    saveStoredImports([ITEM_B], store);
    expect(loadStoredImports(store)).toEqual([ITEM_B]);
  });

  it('累计超限从后往前丢弃，返回实际持久化条数', () => {
    const store = shim();
    const big: StoredImport = { id: 'i-big', name: 'big.mid', data: 'A'.repeat(3_000_000), encoding: 'base64' };
    const bigger: StoredImport = { id: 'i-bigger', name: 'bigger.mid', data: 'B'.repeat(3_000_000), encoding: 'base64' };
    // 第一条放得下，第二条超限 → 只持久化 1 条
    expect(saveStoredImports([big, bigger], store)).toBe(1);
    expect(loadStoredImports(store)).toEqual([big]);
  });

  it('v1 单条旧存档自动迁移进列表', () => {
    const store = shim();
    store.setItem(LEGACY_KEY, JSON.stringify({ name: 'old.mid', data: 'TVRoZAA=', encoding: 'base64' }));
    const list = loadStoredImports(store);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: 'old.mid', data: 'TVRoZAA=', encoding: 'base64' });
    // 迁移后旧键清除、新键写入
    expect(store.getItem(LEGACY_KEY)).toBeNull();
    expect(store.getItem(KEY)).not.toBeNull();
  });

  it('已有新列表时忽略旧存档并清掉旧键', () => {
    const store = shim();
    saveStoredImports([ITEM_A], store);
    store.setItem(LEGACY_KEY, JSON.stringify({ name: 'old.mid', data: 'x', encoding: 'base64' }));
    expect(loadStoredImports(store)).toEqual([ITEM_A]);
    expect(store.getItem(LEGACY_KEY)).toBeNull();
  });

  it('损坏的 JSON 读回空列表并被清除', () => {
    const store = shim();
    store.setItem(KEY, '{not-json');
    expect(loadStoredImports(store)).toEqual([]);
    expect(store.dump().size).toBe(0);
  });

  it('字段缺失（结构不对）也按损坏处理', () => {
    const store = shim();
    store.setItem(KEY, JSON.stringify([{ foo: 1 }]));
    expect(loadStoredImports(store)).toEqual([]);
    expect(store.dump().size).toBe(0);
  });

  it('clearStoredImports 清掉全部；没有条目也不报错', () => {
    const store = shim();
    saveStoredImports([ITEM_A], store);
    clearStoredImports(store);
    expect(loadStoredImports(store)).toEqual([]);
    expect(() => clearStoredImports(store)).not.toThrow();
  });

  it('没有 storage（undefined）时全部安全降级', () => {
    expect(saveStoredImports([ITEM_A], undefined)).toBe(0);
    expect(loadStoredImports(undefined)).toEqual([]);
    expect(() => clearStoredImports(undefined)).not.toThrow();
  });
});
