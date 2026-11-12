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
    bank.set({ midi: 60, buffer: fakeBuffer('C4'), source: 'remote' });
    bank.set({ midi: 72, buffer: fakeBuffer('C5'), source: 'remote' });

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

  it('远程采样不会被合成锚点覆盖，反之可以升级', () => {
    const bank = new SampleBank();
    bank.set({ midi: 60, buffer: fakeBuffer('synth'), source: 'synth' });
    bank.set({ midi: 60, buffer: fakeBuffer('remote'), source: 'remote' });
    expect(bank.find(60)?.buffer).toEqual(fakeBuffer('remote'));

    bank.set({ midi: 60, buffer: fakeBuffer('synth-2'), source: 'synth' });
    expect(bank.find(60)?.buffer).toEqual(fakeBuffer('remote'));
    expect(bank.size).toBe(1);
    expect(bank.remoteCount).toBe(1);
  });

  it('库为空时 resolve 会调用工厂生成兜底锚点，且只生成一次', () => {
    const bank = new SampleBank();
    let calls = 0;
    const factory = (midi: number) => {
      calls += 1;
      return fakeBuffer(`synth-${midi}`);
    };

    const first = bank.resolve(60, factory);
    const second = bank.resolve(62, factory);
    expect(calls).toBe(1);
    expect(first.anchorMidi).toBe(57);
    expect(second.anchorMidi).toBe(57);
    expect(second.ratio).toBeCloseTo(Math.pow(2, 5 / 12), 6);
    expect(bank.list()[0].source).toBe('synth');
  });

  it('prewarm 预渲染指定音区', () => {
    const bank = new SampleBank();
    bank.prewarm((midi) => fakeBuffer(`s-${midi}`), [57, 69, 81]);
    expect(bank.size).toBe(3);
    const ids = bank.list().map((anchor) => anchor.midi);
    expect(ids).toEqual([57, 69, 81]);
  });

  it('anchor 按音高升序排列', () => {
    const bank = new SampleBank();
    bank.set({ midi: 81, buffer: fakeBuffer('a'), source: 'remote' });
    bank.set({ midi: 45, buffer: fakeBuffer('b'), source: 'remote' });
    bank.set({ midi: 60, buffer: fakeBuffer('c'), source: 'remote' });
    expect(bank.list().map((anchor) => anchor.midi)).toEqual([45, 60, 81]);
  });
});
