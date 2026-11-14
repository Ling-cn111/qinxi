import { describe, expect, it } from 'vitest';
import {
  base64ToBytes,
  bytesToBase64,
  clearStoredImport,
  loadStoredImport,
  saveStoredImport,
  type ImportStore,
} from '@/parser/importStore';

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

describe('importStore：导入谱面持久化', () => {
  it('base64 往返无损（含 0x80 以上的字节）', () => {
    const bytes = Uint8Array.from([0x4d, 0x54, 0x68, 0x64, 0x00, 0xff, 0x80, 0x7f]);
    const restored = base64ToBytes(bytesToBase64(bytes));
    expect([...restored]).toEqual([...bytes]);
  });

  it('保存后能原样读回', () => {
    const store = shim();
    expect(saveStoredImport({ name: 'song.mid', data: 'TVRoZAA=', encoding: 'base64' }, store)).toBe(true);
    expect(loadStoredImport(store)).toEqual({ name: 'song.mid', data: 'TVRoZAA=', encoding: 'base64' });
  });

  it('超过体积上限不落盘（返回 false，且不写半个坏值）', () => {
    const store = shim();
    const huge = 'A'.repeat(4_500_001);
    expect(saveStoredImport({ name: 'big.mid', data: huge, encoding: 'base64' }, store)).toBe(false);
    expect(store.dump().size).toBe(0);
  });

  it('损坏的 JSON 读回 null 并被清除', () => {
    const store = shim();
    store.setItem('qinxi:imported:v1', '{not-json');
    expect(loadStoredImport(store)).toBeNull();
    expect(store.dump().size).toBe(0);
  });

  it('字段缺失（结构不对）也按损坏处理', () => {
    const store = shim();
    store.setItem('qinxi:imported:v1', JSON.stringify({ foo: 1 }));
    expect(loadStoredImport(store)).toBeNull();
    expect(store.dump().size).toBe(0);
  });

  it('clearStoredImport 清掉已有条目；没有条目也不报错', () => {
    const store = shim();
    saveStoredImport({ name: 'a.mid', data: 'x', encoding: 'base64' }, store);
    clearStoredImport(store);
    expect(loadStoredImport(store)).toBeNull();
    expect(() => clearStoredImport(store)).not.toThrow();
  });

  it('没有 storage（undefined）时全部安全降级', () => {
    expect(saveStoredImport({ name: 'a.mid', data: 'x', encoding: 'base64' }, undefined)).toBe(false);
    expect(loadStoredImport(undefined)).toBeNull();
    expect(() => clearStoredImport(undefined)).not.toThrow();
  });
});
