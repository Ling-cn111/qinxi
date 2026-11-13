import { describe, expect, it, vi } from 'vitest';
import type { NoteEvent } from '@/types';
import {
  DEFAULT_LEAD_IN_SECONDS,
  DEFAULT_LOOKAHEAD_SECONDS,
  DEFAULT_TICK_INTERVAL_MS,
  Transport,
  type ScheduledNote,
  type TransportSnapshot,
} from '@/transport/transport';
import type { Ticker } from '@/transport/ticker';

const note = (pitch: number, startBeat: number, durationBeats = 0.5): NoteEvent => ({
  id: `n${pitch}@${startBeat}`,
  pitch,
  startBeat,
  durationBeats,
});

/**
 * 测试台：假时钟 + 手动唤醒。
 *
 * 真实实现里唤醒器只有「叫醒」的作用，时间全从 `now()` 取，
 * 所以测试里把 `now` 换成可控变量、把唤醒换成手动 `fire()`，就能精确复现任意时刻的调度行为。
 */
function harness(options: {
  bpm?: number;
  lookahead?: number;
  leadIn?: number;
  tickIntervalMs?: number;
  notes?: NoteEvent[];
  totalBeats?: number;
}) {
  let clock = 0;
  const scheduled: ScheduledNote[] = [];
  const ticks: TransportSnapshot[] = [];
  const spy = {
    end: 0,
    cancel: 0,
    tickerStarted: 0,
    tickerStopped: 0,
    interval: 0,
  };

  let fire: () => void = () => undefined;
  const tickers: Ticker[] = [];

  const transport = new Transport({
    now: () => clock,
    bpm: options.bpm ?? 120,
    lookahead: options.lookahead,
    leadIn: options.leadIn ?? 0,
    tickIntervalMs: options.tickIntervalMs,
    callbacks: {
      onNote: (item) => scheduled.push(item),
      onTick: (snapshot) => ticks.push(snapshot),
      onEnd: () => {
        spy.end += 1;
      },
      onCancelAll: () => {
        spy.cancel += 1;
      },
    },
    tickerFactory: (callback, intervalMs) => {
      fire = callback;
      spy.interval = intervalMs;
      const ticker: Ticker = {
        kind: 'interval',
        start: () => {
          spy.tickerStarted += 1;
        },
        stop: () => {
          spy.tickerStopped += 1;
        },
        dispose: () => undefined,
      };
      tickers.push(ticker);
      return ticker;
    },
  });

  if (options.notes) transport.load(options.notes, { totalBeats: options.totalBeats });

  return {
    transport,
    spy,
    ticks,
    scheduled,
    /** 推进音频时钟 */
    advance: (seconds: number) => {
      clock += seconds;
    },
    setClock: (seconds: number) => {
      clock = seconds;
    },
    get clock() {
      return clock;
    },
    /** 手动唤醒一次（相当于定时器到点） */
    tick: () => fire(),
    lastTick: () => ticks[ticks.length - 1],
    pitches: () => scheduled.map((item) => item.pitch),
    whens: () => scheduled.map((item) => item.when),
  };
}

describe('Transport：拍位与秒的换算', () => {
  it('60 BPM：一拍 1 秒', () => {
    const { transport } = harness({ bpm: 60 });
    expect(transport.secondsPerBeat).toBe(1);
    expect(transport.beatToSeconds(1)).toBe(1);
    expect(transport.beatToSeconds(4)).toBe(4);
    expect(transport.secondsToBeat(4)).toBe(4);
  });

  it('120 BPM：一拍 0.5 秒', () => {
    const { transport } = harness({ bpm: 120 });
    expect(transport.secondsPerBeat).toBe(0.5);
    expect(transport.beatToSeconds(1)).toBe(0.5);
    expect(transport.beatToSeconds(3.5)).toBe(1.75);
    expect(transport.secondsToBeat(2)).toBe(4);
  });

  it('80 / 90 / 45 BPM 的换算都对得上', () => {
    expect(harness({ bpm: 80 }).transport.secondsPerBeat).toBeCloseTo(0.75, 10);
    expect(harness({ bpm: 90 }).transport.beatToSeconds(4)).toBeCloseTo(2.6667, 3);
    expect(harness({ bpm: 45 }).transport.beatToSeconds(2)).toBeCloseTo(8 / 3, 10);
    expect(harness({ bpm: 45 }).transport.secondsToBeat(8 / 3)).toBeCloseTo(2, 10);
  });

  it('拍位 → 秒 → 拍位 是可逆的（含小数拍）', () => {
    const { transport } = harness({ bpm: 100 });
    for (const beat of [0, 0.25, 1, 2.5, 7.75]) {
      expect(transport.secondsToBeat(transport.beatToSeconds(beat))).toBeCloseTo(beat, 10);
    }
  });

  it('BPM 变了，秒数跟着变（load 时可以换 BPM）', () => {
    const { transport } = harness({ bpm: 60, notes: [note(60, 0, 4)] });
    expect(transport.totalSeconds).toBe(4);
    transport.load([note(60, 0, 4)], { bpm: 120 });
    expect(transport.totalSeconds).toBe(2);
  });

  it('总时长 = 总拍数 × 每拍秒数', () => {
    const { transport } = harness({ bpm: 96, notes: [note(60, 0), note(62, 27, 0.5)] });
    expect(transport.totalBeats).toBe(27.5);
    expect(transport.totalSeconds).toBeCloseTo((27.5 / 96) * 60, 10);
  });
});

describe('Transport：前瞻调度', () => {
  it('默认 25ms 唤醒、100ms 前瞻', () => {
    expect(DEFAULT_TICK_INTERVAL_MS).toBe(25);
    expect(DEFAULT_LOOKAHEAD_SECONDS).toBe(0.1);
    expect(DEFAULT_LEAD_IN_SECONDS).toBeGreaterThan(0);
    const { spy } = harness({ notes: [] });
    expect(spy.interval).toBe(0);
  });

  it('只把前瞻窗内的音交出去：窗口外的一个都不碰', () => {
    const run = harness({ notes: [note(60, 0), note(61, 1), note(62, 2)] });
    run.transport.play();
    // 起播瞬间：只有第 0 拍的音（0s）在 0.1s 窗口内
    expect(run.pitches()).toEqual([60]);
    expect(run.whens()).toEqual([0]);

    // 0.39s 时窗口到 0.49s，第 1 拍（0.5s）还没到
    run.setClock(0.39);
    run.tick();
    expect(run.pitches()).toEqual([60]);

    // 0.41s 时窗口到 0.51s，第 1 拍进窗
    run.setClock(0.41);
    run.tick();
    expect(run.pitches()).toEqual([60, 61]);
    expect(run.whens()).toEqual([0, 0.5]);
  });

  it('落点是音频时间轴上的绝对时刻，与唤醒时刻无关', () => {
    const run = harness({ notes: [note(60, 0), note(62, 1), note(64, 2)] });
    run.transport.play();
    // 故意在很晚、很不整的时刻唤醒
    run.setClock(0.43);
    run.tick();
    run.setClock(0.47);
    run.tick();
    expect(run.whens()).toEqual([0, 0.5]);
    expect(run.scheduled[1].when - run.clock).toBeCloseTo(0.03, 10);
  });

  it('每个音只排一次，多次唤醒不重复', () => {
    const run = harness({ notes: [note(60, 0), note(62, 1)] });
    run.transport.play();
    for (let i = 0; i < 6; i += 1) {
      run.setClock(0.2 * (i + 1));
      run.tick();
    }
    expect(run.pitches()).toEqual([60, 62]);
  });

  it('和弦的三个音落在同一个 when 上', () => {
    const run = harness({ notes: [note(60, 1), note(64, 1), note(67, 1)] });
    run.transport.play();
    run.setClock(0.5);
    run.tick();
    expect(run.scheduled).toHaveLength(3);
    expect(new Set(run.whens())).toEqual(new Set([0.5]));
  });

  it('页面卡顿导致迟到：音被拉到当前时刻发声并标记 late，不吞音', () => {
    const run = harness({ notes: [note(60, 0), note(61, 1), note(62, 2), note(63, 3)] });
    run.transport.play();
    // 模拟后台标签页被节流，直接跳到 3s
    run.setClock(3);
    run.tick();
    expect(run.pitches()).toEqual([60, 61, 62, 63]);
    expect(run.scheduled[0].late).toBe(false);
    for (const item of run.scheduled.slice(1)) {
      expect(item.late).toBe(true);
      expect(item.when).toBe(3);
    }
    expect(run.spy.end).toBe(1);
  });

  it('自定义前瞻窗与唤醒间隔会被用到', () => {
    const run = harness({ notes: [note(60, 0), note(61, 1)], lookahead: 0.6, tickIntervalMs: 10 });
    run.transport.play();
    expect(run.spy.interval).toBe(10);
    // 0.6s 前瞻：第 1 拍（0.5s）在起播时就已经进了窗口
    expect(run.pitches()).toEqual([60, 61]);
  });

  it('乱序的谱面会被按拍位排好再调度', () => {
    const run = harness({ notes: [note(64, 2), note(60, 0), note(62, 1)] });
    run.transport.play();
    run.setClock(1.5);
    run.tick();
    expect(run.pitches()).toEqual([60, 62, 64]);
  });

  it('时长按拍数折成秒交给引擎', () => {
    const run = harness({ notes: [note(60, 0, 1.5)] });
    run.transport.play();
    expect(run.scheduled[0].duration).toBe(0.75); // 1.5 拍 × 0.5s
  });
});

describe('Transport：播放控制', () => {
  it('play 之后进入 playing，唤醒器启动一次', () => {
    const run = harness({ notes: [note(60, 0)] });
    run.transport.play();
    expect(run.transport.playing).toBe(true);
    expect(run.spy.tickerStarted).toBe(1);
    expect(run.ticks.length).toBeGreaterThan(0);
  });

  it('pause 记住当前位置、停唤醒器、把排程中的音作废', () => {
    const run = harness({ notes: [note(60, 0), note(62, 2)] });
    run.transport.play();
    run.setClock(0.6);
    run.transport.pause();
    expect(run.transport.playing).toBe(false);
    expect(run.transport.beat).toBeCloseTo(1.2, 10); // 0.6s ÷ 0.5s/拍
    expect(run.spy.cancel).toBe(1);
    expect(run.spy.tickerStopped).toBe(1);
    expect(run.lastTick()?.beat).toBeCloseTo(1.2, 10);

    // 暂停后再唤醒不该有任何排程
    const before = run.scheduled.length;
    run.tick();
    expect(run.scheduled.length).toBe(before);
  });

  it('继续播放从暂停点接上，不重播已经过去的音', () => {
    const run = harness({ notes: [note(60, 0), note(62, 2), note(64, 4)] });
    run.transport.play();
    run.setClock(0.6);
    run.transport.pause();
    run.setClock(10); // 暂停期间过了很久，但谱面位置不动
    run.transport.play();
    expect(run.transport.beat).toBeCloseTo(1.2, 10);

    // 锚点重置：第 2 拍的音在 (2 - 1.2) × 0.5 = 0.4s 之后，即 10.4s
    run.setClock(10.25);
    run.tick();
    expect(run.pitches()).toEqual([60]); // 10.35 的前瞻窗还没够到 10.4
    run.setClock(10.35);
    run.tick();
    expect(run.pitches()).toEqual([60, 62]);
    expect(run.scheduled[1].when).toBeCloseTo(10.4, 10);
  });

  it('stop 回到开头，再次 play 从头开始', () => {
    const run = harness({ notes: [note(60, 0), note(62, 1)] });
    run.transport.play();
    run.setClock(0.5);
    run.tick();
    run.transport.stop();
    expect(run.transport.playing).toBe(false);
    expect(run.transport.beat).toBe(0);
    expect(run.spy.cancel).toBe(1);

    run.transport.play();
    expect(run.transport.beat).toBe(0);
    expect(run.pitches()).toEqual([60, 62, 60]);
  });

  it('paused 状态下 stop 不发多余的 cancel', () => {
    const run = harness({ notes: [note(60, 0)] });
    run.transport.play();
    run.transport.pause();
    run.transport.stop();
    expect(run.spy.cancel).toBe(1); // 只有 pause 那次
  });

  it('seek 到指定拍，播放中会重排', () => {
    const run = harness({ notes: [note(60, 0), note(62, 2), note(64, 4)] });
    run.transport.play();
    run.transport.seek(2);
    expect(run.transport.beat).toBe(2);
    expect(run.spy.cancel).toBe(1);
    run.tick();
    expect(run.pitches()).toEqual([60, 62]);
  });

  it('播完触发一次 onEnd，停在末尾', () => {
    const run = harness({ notes: [note(60, 0, 1)] }); // 总拍数 1，0.5s
    run.transport.play();
    run.setClock(0.6);
    run.tick();
    expect(run.spy.end).toBe(1);
    expect(run.transport.playing).toBe(false);
    expect(run.transport.beat).toBe(1);

    run.setClock(1);
    run.tick();
    expect(run.spy.end).toBe(1); // 不会重复触发

    // 播完再按播放 → 从头
    run.transport.play();
    expect(run.transport.beat).toBe(0);
  });

  it('空谱按播放不进入 playing，也不排程', () => {
    const run = harness({ notes: [] });
    run.transport.play();
    expect(run.transport.playing).toBe(false);
    expect(run.scheduled).toEqual([]);
  });

  it('snapshot 的 beat / seconds / progress 对得上', () => {
    const run = harness({ notes: [note(60, 0), note(62, 2)] }); // 总 2.5 拍 = 1.25s
    run.transport.play();
    run.setClock(0.25);
    run.tick();
    const snapshot = run.lastTick()!;
    expect(snapshot.beat).toBeCloseTo(0.5, 10);
    expect(snapshot.seconds).toBeCloseTo(0.25, 10);
    expect(snapshot.totalBeats).toBe(2.5);
    expect(snapshot.totalSeconds).toBeCloseTo(1.25, 10);
    expect(snapshot.progress).toBeCloseTo(0.2, 10);
    expect(snapshot.playing).toBe(true);
  });

  it('参数不合法直接报错', () => {
    const base = { now: () => 0, callbacks: {} };
    expect(() => new Transport({ ...base, bpm: 0 })).toThrow(RangeError);
    expect(() => new Transport({ ...base, bpm: -120 })).toThrow(RangeError);
    expect(() => new Transport({ ...base, bpm: 120, lookahead: 0 })).toThrow(RangeError);
    expect(() => new Transport({ ...base, bpm: 120, tickIntervalMs: 0 })).toThrow(RangeError);
    expect(() => new Transport({ ...base, bpm: 120, leadIn: -1 })).toThrow(RangeError);
  });

  it('dispose 之后不再调度', () => {
    const run = harness({ notes: [note(60, 0), note(62, 2)] });
    run.transport.play();
    run.transport.dispose();
    run.setClock(1);
    run.tick();
    expect(run.scheduled).toHaveLength(1);
  });
});

describe('Transport：唤醒器注入', () => {
  it('默认使用 Worker 唤醒器（Node 下回落 interval），由 tickerFactory 决定', () => {
    const factory = vi.fn((_onTick: () => void, _intervalMs: number) => ({
      kind: 'interval' as const,
      start: () => undefined,
      stop: () => undefined,
      dispose: () => undefined,
    }));
    const transport = new Transport({
      now: () => 0,
      bpm: 120,
      tickerFactory: factory,
      callbacks: {},
    });
    transport.load([note(60, 0)]);
    transport.play();
    expect(factory).toHaveBeenCalledTimes(1);
    expect(factory.mock.calls[0][1]).toBe(DEFAULT_TICK_INTERVAL_MS);
  });
});
