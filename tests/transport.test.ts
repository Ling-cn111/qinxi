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
  const loopJumps: number[] = [];
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
      onLoopJump: (aBeat) => {
        loopJumps.push(aBeat);
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
    loopJumps,
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

describe('Transport：rawBeat（琴键高亮用）', () => {
  it('起播留白期间是负数，不会让首音提前亮', () => {
    const run = harness({ notes: [note(60, 0)], leadIn: 0.05 });
    run.transport.play();
    run.setClock(0);
    expect(run.transport.rawBeat).toBeCloseTo(-0.1, 10); // (0 - 0.05) / 0.5
    expect(run.transport.beat).toBe(0); // 对外展示仍钳制在 0
    run.setClock(0.05);
    expect(run.transport.rawBeat).toBeCloseTo(0, 10);
  });

  it('play(leadInOverride)：跟弹预备——锚点推到 2s 后，前 2s 是负拍位', () => {
    const run = harness({ notes: [note(60, 0), note(62, 2)], leadIn: 0.05 });
    run.transport.play(2);
    run.setClock(0);
    // (0 - 2) / 0.5 = -4 拍：第一条音还差 2s 才到判定线（长条正在下落）
    expect(run.transport.rawBeat).toBeCloseTo(-4, 10);
    run.setClock(0.9); // 还没到，不排程不发声
    run.tick();
    expect(run.scheduled).toHaveLength(0);
    run.setClock(1.95); // 进入 100ms 前瞻窗才交出
    run.tick();
    expect(run.scheduled.map((n) => n.pitch)).toEqual([60]);
    expect(run.scheduled[0].when).toBeCloseTo(2, 10);
    run.setClock(2.95);
    run.tick();
    expect(run.scheduled.map((n) => n.pitch)).toEqual([60, 62]); // beat 2 → 2 + 2s + 1s
    run.setClock(1.5); // 倒回时钟也无所谓，已排的不撤
    run.tick();
    expect(run.scheduled).toHaveLength(2);
  });

  it('播放中实时推进，暂停后冻结', () => {
    const run = harness({ notes: [note(60, 0), note(62, 2)], leadIn: 0 });
    run.transport.play();
    run.setClock(0.6);
    expect(run.transport.rawBeat).toBeCloseTo(1.2, 10);
    run.transport.pause();
    run.setClock(5);
    expect(run.transport.rawBeat).toBeCloseTo(1.2, 10);
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

describe('Transport：变速（setTempo）', () => {
  it('播放中变速：拍位连续，后续音符按新拍长排程', () => {
    // 120 BPM = 0.5s/拍；变速到 60 BPM = 1s/拍
    const run = harness({ bpm: 120, notes: [note(60, 0), note(62, 2), note(64, 4)] });
    run.transport.play();
    run.setClock(1); // beat = 2
    expect(run.transport.rawBeat).toBeCloseTo(2, 10);

    const cancelBefore = run.spy.cancel;
    run.transport.setTempo(60);
    expect(run.spy.cancel).toBe(cancelBefore + 1); // 旧拍长下已排的音作废
    expect(run.transport.bpm).toBe(60);
    // 同一时刻拍位不变（重锚到当前拍）
    expect(run.transport.rawBeat).toBeCloseTo(2, 10);

    // 时钟再走 1s：新拍长 1s/拍 → beat 只前进 1 拍（旧速度会走 2 拍）
    run.setClock(2);
    expect(run.transport.rawBeat).toBeCloseTo(3, 10);

    // beat 4 的音落在 clock 3（重锚点 beat2@clock1 之后 2 拍 × 1s）
    run.setClock(2.95);
    run.tick();
    expect(run.scheduled.some((n) => n.pitch === 64 && Math.abs(n.when - 3) < 1e-9)).toBe(true);
  });

  it('空闲 / 暂停中变速：只改拍长，下次播放按新速度', () => {
    const run = harness({ bpm: 120, notes: [note(60, 0), note(62, 2)] });
    run.transport.pause(); // 未播放时 pause 直接返回
    run.transport.setTempo(60);
    expect(run.transport.bpm).toBe(60);
    run.transport.play();
    run.setClock(1);
    expect(run.transport.rawBeat).toBeCloseTo(1, 10); // 1s = 1 拍（新拍长）
  });

  it.each([0, -5, Number.NaN, Number.POSITIVE_INFINITY])('setTempo(%p) 抛 RangeError', (bpm) => {
    const run = harness({ notes: [note(60, 0)] });
    expect(() => run.transport.setTempo(bpm as number)).toThrow(RangeError);
  });
});

describe('Transport：A-B 循环', () => {
  it('到达 B 点无缝跳回 A 点：锚点平移、时间连续、A 段的音立刻补上', () => {
    // 60 BPM = 1s/拍，leadIn 0
    const run = harness({ bpm: 60, notes: [note(60, 0), note(62, 1), note(64, 2), note(65, 3), note(67, 4)] });
    run.transport.setLoop(1, 3);
    expect(run.transport.loopRange).toEqual({ a: 1, b: 3 });

    run.transport.play();
    run.setClock(3.05); // beat 3.05 ≥ B=3 → 本 tick 跳回 A=1
    run.tick();

    expect(run.loopJumps).toEqual([1]);
    // 跳回后此刻拍位恰为 A
    expect(run.transport.rawBeat).toBeCloseTo(1, 10);
    // A 点的音（beat 1）被立即补排在本 tick（when = 此刻 3.05）
    const last = run.scheduled[run.scheduled.length - 1];
    expect(last.pitch).toBe(62);
    expect(last.when).toBeCloseTo(3.05, 6);

    // 循环段继续按原速推进：beat 2 的音落在 4.05
    run.setClock(4.05);
    run.tick();
    expect(run.scheduled.some((n) => n.pitch === 64 && Math.abs(n.when - 4.05) < 1e-6)).toBe(true);
  });

  it('[A, B) 语义：B 点（含）之后的音不排程，循环中永不触发 onEnd', () => {
    const run = harness({ bpm: 60, notes: [note(60, 0), note(62, 1), note(64, 2), note(65, 3), note(67, 4)] });
    run.transport.setLoop(1, 3);
    run.transport.play();
    // 跑 8 拍的时间（跨多个循环），B 点的音（65）永远不响
    for (let t = 0.5; t <= 8; t += 0.5) {
      run.setClock(t);
      run.tick();
    }
    expect(run.scheduled.some((n) => n.pitch === 65)).toBe(false);
    expect(run.scheduled.some((n) => n.pitch === 67)).toBe(false);
    expect(run.spy.end).toBe(0); // 循环中永不播完
  });

  it('clearLoop 后恢复整曲播放，能正常播完', () => {
    const run = harness({ bpm: 60, notes: [note(60, 0), note(62, 1), note(64, 2), note(65, 3), note(67, 4)] });
    run.transport.setLoop(1, 3);
    run.transport.play();
    run.setClock(1.05); // 循环段中段，还没到 B
    run.tick();
    run.transport.clearLoop();
    expect(run.transport.loopRange).toBeNull();
    run.setClock(5.2); // 排程上限解除，整曲自然播完（总长 4.5 拍）
    run.tick();
    // B 点之后的音恢复排程
    expect(run.scheduled.some((n) => n.pitch === 65)).toBe(true);
    expect(run.spy.end).toBe(1);
  });

  it('播放中 seek 到 B 点之后，下一个 tick 立即被拉回 A 点', () => {
    const run = harness({ bpm: 60, notes: [note(60, 0), note(62, 1), note(64, 2), note(65, 3)] });
    run.transport.setLoop(1, 3);
    run.transport.play();
    run.transport.seek(3.5);
    run.setClock(3.5);
    run.tick();
    expect(run.transport.rawBeat).toBeCloseTo(1, 10);
  });

  it.each([
    [-1, 3],
    [3, 3],
    [2, 1],
    [Number.NaN, 3],
  ])('setLoop(%p, %p) 抛 RangeError', (a, b) => {
    const run = harness({ notes: [note(60, 0)] });
    expect(() => run.transport.setLoop(a as number, b as number)).toThrow(RangeError);
  });

  it('装新谱（load）时清掉旧循环点', () => {
    const run = harness({ notes: [note(60, 0), note(62, 1)] });
    run.transport.setLoop(0, 1);
    run.transport.load([note(72, 0), note(74, 1)]);
    expect(run.transport.loopRange).toBeNull();
  });
});
