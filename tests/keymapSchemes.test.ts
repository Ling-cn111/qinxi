import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bindingsSignature,
  isKeymapScheme,
  loadKeymapSchemes,
  MAX_SCHEME_NAME,
  newSchemeId,
  saveKeymapSchemes,
  type KeymapScheme,
} from '@/keyboard/keymapSchemes';

function fakeStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, value),
  } as Storage;
}

const KEY = 'qinxi:keymap:schemes:v1';

const sample: KeymapScheme = {
  id: 's-1',
  name: '左手低音',
  bindings: [{ code: 'KeyQ', modifier: 'none', pitch: 36 }],
  createdAt: 1700000000000,
};

describe('键位方案存储', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('没有记录时返回空列表', () => {
    vi.stubGlobal('localStorage', fakeStorage());
    expect(loadKeymapSchemes()).toEqual([]);
  });

  it('localStorage 不可用（隐私模式）时安全降级', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(loadKeymapSchemes()).toEqual([]);
    expect(() => saveKeymapSchemes([sample])).not.toThrow();
  });

  it('保存后能原样读回', () => {
    vi.stubGlobal('localStorage', fakeStorage());
    saveKeymapSchemes([sample]);
    expect(loadKeymapSchemes()).toEqual([sample]);
  });

  it('坏 JSON 当成没有方案', () => {
    vi.stubGlobal('localStorage', fakeStorage({ [KEY]: '{oops' }));
    expect(loadKeymapSchemes()).toEqual([]);
  });

  it('过滤掉字段不合法的条目，并去重 id', () => {
    vi.stubGlobal(
      'localStorage',
      fakeStorage({
        [KEY]: JSON.stringify([
          sample,
          { ...sample, name: '   ' },
          { ...sample, name: 'x'.repeat(MAX_SCHEME_NAME + 1) },
          { ...sample, id: 's-2', bindings: [{ code: 'KeyW' }] },
          { ...sample, id: 's-3', name: '  重名  ' },
        ]),
      }),
    );
    const list = loadKeymapSchemes();
    expect(list.map((item) => item.id)).toEqual(['s-1', 's-3']);
    // 名字读回时去掉首尾空格
    expect(list[1].name).toBe('重名');
  });

  it('校验函数拒绝缺字段的对象', () => {
    expect(isKeymapScheme(sample)).toBe(true);
    expect(isKeymapScheme({ ...sample, id: '' })).toBe(false);
    expect(isKeymapScheme({ ...sample, bindings: 'nope' })).toBe(false);
    expect(isKeymapScheme({ ...sample, bindings: [{ code: null, modifier: 'none', pitch: 60 }] })).toBe(
      true,
    );
  });

  it('签名与顺序无关，但能区分不同绑定', () => {
    const a = [
      { code: 'KeyQ', modifier: 'none' as const, pitch: 60 },
      { code: null, modifier: 'none' as const, pitch: 62 },
    ];
    const b = [
      { code: null, modifier: 'none' as const, pitch: 62 },
      { code: 'KeyQ', modifier: 'none' as const, pitch: 60 },
    ];
    expect(bindingsSignature(a)).toBe(bindingsSignature(b));
    expect(bindingsSignature(a)).not.toBe(
      bindingsSignature([{ code: 'KeyQ', modifier: 'none', pitch: 61 }]),
    );
    expect(bindingsSignature([])).toBe('');
  });

  it('方案的 id 不重复', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newSchemeId()));
    expect(ids.size).toBe(50);
  });
});
