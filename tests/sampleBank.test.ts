import { describe, expect, it } from 'vitest';
import { SampleBank } from '@/audio/sampleBank';

const fakeBuffer = (id: string) => ({ id } as unknown as AudioBuffer);

describe('SampleBank', () => {
  it('空库返回 null', () => {
    const bank = new SampleBank();
    expect(bank.find(60)).toBeNull();
    expect(bank.size).toBe(0);
  });

  it('选择最近的采样锚点并算出播放速率', () => {
    const bank = new SampleBank();
    bank.set({ midi: 60, buffer: fakeBuffer('C4'), source: 'autopiano' });
    bank.set({ midi: 72, buffer: fakeBuffer('C5'), source: 'autopiano' });

    const exact = bank.find(60);
    expect(exact?.anchorMidi).toBe(60);
    expect(exact?.ratio).toBeCloseTo(1, 6);

    const upper = bank.find(71);
    expect(upper?.anchorMidi).toBe(72);
    expect(upper?.ratio).toBeCloseTo(Math.pow(2, -1 / 12), 6);

    const lower = bank.find(66);
    expect(lower?.anchorMidi).toBe(60);
    expect(lower?.ratio).toBeCloseTo(Math.pow(2, 0.5), 6);
  });

  it('采样范围外的音用最近锚点移调，保证 88 键不哑', () => {
    const bank = new SampleBank();
    bank.set({ midi: 36, buffer: fakeBuffer('C2'), source: 'autopiano' });
    bank.set({ midi: 96, buffer: fakeBuffer('C7'), source: 'autopiano' });

    const lowest = bank.find(21); // A0，比最低采样低 15 个半音
    expect(lowest?.anchorMidi).toBe(36);
    expect(lowest?.ratio).toBeCloseTo(Math.pow(2, -15 / 12), 6);

    const highest = bank.find(108); // C8，比最高采样高 12 个半音
    expect(highest?.anchorMidi).toBe(96);
    expect(highest?.ratio).toBeCloseTo(2, 6);
  });

  it('来源优先级：autopiano > salamander > synth，低优先级不覆盖高优先级', () => {
    const bank = new SampleBank();
    bank.set({ midi: 60, buffer: fakeBuffer('synth'), source: 'synth' });
    bank.set({ midi: 60, buffer: fakeBuffer('salamander'), source: 'salamander' });
    expect(bank.find(60)?.buffer).toEqual(fakeBuffer('salamander'));

    bank.set({ midi: 60, buffer: fakeBuffer('autopiano'), source: 'autopiano' });
    expect(bank.find(60)?.buffer).toEqual(fakeBuffer('autopiano'));

    // 再回退低优先级不会顶掉
    bank.set({ midi: 60, buffer: fakeBuffer('synth-2'), source: 'synth' });
    expect(bank.find(60)?.buffer).toEqual(fakeBuffer('autopiano'));
    expect(bank.size).toBe(1);
    expect(bank.countOf('autopiano')).toBe(1);
  });

  it('dropSource 只清掉指定来源', () => {
    const bank = new SampleBank();
    bank.set({ midi: 69, buffer: fakeBuffer('synth'), source: 'synth' });
    bank.set({ midi: 60, buffer: fakeBuffer('auto'), source: 'autopiano' });
    bank.dropSource('synth');
    expect(bank.size).toBe(1);
    expect(bank.find(69)?.anchorMidi).toBe(60);
    expect(bank.find(69)?.source).toBe('autopiano');
  });

  it('库为空时 resolve 会调用工厂生成兜底锚点，且只生成一次', () => {
    const bank = new SampleBank();
    let calls = 0;
    const factory = (midi: number) => {
      calls += 1;
      return { buffer: fakeBuffer(`synth-${midi}`), gain: 1.05 };
    };

    const first = bank.resolve(60, factory);
    const second = bank.resolve(62, factory);
    expect(calls).toBe(1);
    expect(first.anchorMidi).toBe(57);
    expect(second.anchorMidi).toBe(57);
    expect(second.ratio).toBeCloseTo(Math.pow(2, 5 / 12), 6);
    expect(bank.list()[0].source).toBe('synth');
    expect(first.gain).toBeCloseTo(1.05, 6);
    expect(first.gain).toBeCloseTo(1.05, 6);
  });

  it('归一化增益随锚点解析出来，未标注时为 1', () => {
    const bank = new SampleBank();
    bank.set({ midi: 60, buffer: fakeBuffer('C4'), gain: 2.4, source: 'autopiano' });
    bank.set({ midi: 72, buffer: fakeBuffer('C5'), source: 'autopiano' });
    expect(bank.find(60)?.gain).toBeCloseTo(2.4, 6);
    expect(bank.find(72)?.gain).toBe(1);
  });

  it('归一化增益随锚点解析出来，未标注时为 1', () => {
    const bank = new SampleBank();
    bank.set({ midi: 60, buffer: fakeBuffer('C4'), gain: 2.4, source: 'autopiano' });
    bank.set({ midi: 72, buffer: fakeBuffer('C5'), source: 'autopiano' });
    expect(bank.find(60)?.gain).toBeCloseTo(2.4, 6);
    expect(bank.find(72)?.gain).toBe(1);
  });

  it('prewarm 预渲染指定音区', () => {
    const bank = new SampleBank();
    bank.prewarm((midi) => ({ buffer: fakeBuffer(`s-${midi}`), gain: 1 }), [57, 69, 81]);
    expect(bank.size).toBe(3);
    expect(bank.list().map((anchor) => anchor.midi)).toEqual([57, 69, 81]);
  });

  it('anchor 按音高升序排列', () => {
    const bank = new SampleBank();
    bank.set({ midi: 81, buffer: fakeBuffer('a'), source: 'autopiano' });
    bank.set({ midi: 45, buffer: fakeBuffer('b'), source: 'autopiano' });
    bank.set({ midi: 60, buffer: fakeBuffer('c'), source: 'autopiano' });
    expect(bank.list().map((anchor) => anchor.midi)).toEqual([45, 60, 81]);
  });
});
