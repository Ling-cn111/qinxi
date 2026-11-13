import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearCustomBindings, loadCustomBindings, saveCustomBindings } from '@/keyboard/customKeymap';

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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('自定义键位持久化', () => {
  it('没有 localStorage 时安全降级（Node / 隐私模式）', () => {
    expect(loadCustomBindings()).toEqual([]);
    expect(() => saveCustomBindings([{ code: 'KeyG', modifier: 'none', pitch: 60 }])).not.toThrow();
    expect(() => clearCustomBindings()).not.toThrow();
  });

  it('保存后能原样读回（绑定与空置都存）', () => {
    vi.stubGlobal('localStorage', fakeStorage());
    const list = [
      { code: 'KeyG', modifier: 'none' as const, pitch: 60 },
      { code: 'Minus', modifier: 'shift' as const, pitch: 61 },
      { code: null, modifier: 'none' as const, pitch: 62 },
    ];
    saveCustomBindings(list);
    expect(loadCustomBindings()).toEqual(list);
  });

  it('损坏的 JSON 或非数组内容回落到空列表', () => {
    const store = fakeStorage();
    vi.stubGlobal('localStorage', store);
    store.setItem('qinxi:keymap:v1', '{oops');
    expect(loadCustomBindings()).toEqual([]);
    store.setItem('qinxi:keymap:v1', '{"code":"KeyG"}');
    expect(loadCustomBindings()).toEqual([]);
  });

  it('过滤掉字段不合法的条目，但保留「空置」记录', () => {
    const store = fakeStorage();
    vi.stubGlobal('localStorage', store);
    store.setItem(
      'qinxi:keymap:v1',
      JSON.stringify([
        { code: 'KeyG', modifier: 'none', pitch: 60 },
        { code: 'KeyH', modifier: 'hyper', pitch: 61 },
        { code: '', modifier: 'none', pitch: 62 },
        { code: 'KeyJ', modifier: 'none', pitch: '64' },
        { code: null, modifier: 'none', pitch: 65 },
      ]),
    );
    expect(loadCustomBindings()).toEqual([
      { code: 'KeyG', modifier: 'none', pitch: 60 },
      { code: null, modifier: 'none', pitch: 65 },
    ]);
  });

  it('清除后读到空列表', () => {
    const store = fakeStorage();
    vi.stubGlobal('localStorage', store);
    saveCustomBindings([{ code: 'KeyG', modifier: 'none', pitch: 60 }]);
    clearCustomBindings();
    expect(loadCustomBindings()).toEqual([]);
  });
});
