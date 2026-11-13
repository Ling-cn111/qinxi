import type { NoteEvent } from '@/types';
import { createTicker, type Ticker, type TickerFactory } from './ticker';

/**
 * 自动播放的时间轴（手写，不依赖任何第三方调度库）。
 *
 * ## 时钟只有一个：`AudioContext.currentTime`
 *
 * 定时器只负责「醒来看看」，**从不参与计时**。每次醒来做三件事：
 *
 * 1. 从音频时钟算出「现在第几拍」；
 * 2. 把 `lookahead`（默认 100ms）之内该响的音，按**音频时间轴上的绝对时刻**交给引擎
 *    （引擎用 `AudioBufferSourceNode.start(when)` 精确落点，误差在采样级）；
 * 3. 把当前拍位通过 `onTick` 报给界面。
 *
 * 因为落点是绝对时刻，唤醒间隔抖动 ±10ms、甚至后台标签页被节流，都不会让音符提前或延后 ——
 * 这正是「不用 setTimeout 直接触发发声」的原因。若醒来时某个音的时刻已经过去（页面卡了），
 * 它会被拉到 `now` 发声并标记 `late`，**不吞音**。
 *
 * ## 状态机
 *
 * ```
 * idle --play--> playing --pause--> paused --play--> playing
 *                  |  \--stop-----> idle（拍位归零）
 *                  \--播完-------> idle（onEnd）
 * ```
 */

/** 默认前瞻窗（秒）：提前这么久把音交给引擎 */
export const DEFAULT_LOOKAHEAD_SECONDS = 0.1;
/** 默认唤醒间隔（毫秒） */
export const DEFAULT_TICK_INTERVAL_MS = 25;
/**
 * 起播前的留白（秒）。
 * `when` 至少要略大于「当前时刻」，否则等 onNote 走到引擎时已经过期，只能立刻发声；
 * 50ms 既听不出来，又给首音留出稳稳的排程余量。
 */
export const DEFAULT_LEAD_IN_SECONDS = 0.05;

/** 交给引擎的一个待发声音符 */
export interface ScheduledNote {
  /** 对应 NoteEvent.id，方便界面按音高 / 谱面位置高亮 */
  id: string;
  pitch: number;
  velocity: number;
  /** AudioContext 时间轴上的绝对发声时刻（秒） */
  when: number;
  /** 发声时长（秒） */
  duration: number;
  /** 原谱拍位 */
  beat: number;
  /** 排程时已经晚了（页面卡顿 / 节流），when 已被拉到当前时刻 */
  late: boolean;
}

/** 每次唤醒上报的位置 */
export interface TransportSnapshot {
  playing: boolean;
  /** 当前拍位（含小数） */
  beat: number;
  /** 当前时间（秒，谱面时间轴，从 0 开始） */
  seconds: number;
  totalBeats: number;
  totalSeconds: number;
  /** 0–1 */
  progress: number;
  /** 本次唤醒实际提前了多少秒排程（调试用；暂停时为 0） */
  scheduledAhead: number;
}

export interface TransportCallbacks {
  /** 该发这个音了（离真正发声还有 lookahead 秒） */
  onNote?: (note: ScheduledNote) => void;
  /** 位置变化（每个唤醒一次，play / pause / stop / seek 也会立刻上报一次） */
  onTick?: (snapshot: TransportSnapshot) => void;
  /** 整首都播完了 */
  onEnd?: () => void;
  /**
   * 把「已排程但还没响」的音作废（暂停 / 停止 / 跳转时触发）。
   * 引擎侧对应 `stopAll()` —— 前瞻窗里的音已经进了音频图，光停定时器是停不掉它们的。
   */
  onCancelAll?: () => void;
}

export interface TransportOptions {
  /** 权威时钟，必须是 `AudioContext.currentTime`（单位秒） */
  now: () => number;
  /** 每分钟拍数 */
  bpm: number;
  lookahead?: number;
  tickIntervalMs?: number;
  leadIn?: number;
  callbacks?: TransportCallbacks;
  /** 注入唤醒器，默认 Worker（不支持时回落 setInterval） */
  tickerFactory?: TickerFactory;
}

export interface LoadOptions {
  bpm?: number;
  /** 总拍数，省略则由音符推出（最后一个音的结束拍） */
  totalBeats?: number;
}

export class Transport {
  private readonly now: () => number;
  private readonly callbacks: TransportCallbacks;
  private readonly tickerFactory: TickerFactory;
  private readonly lookahead: number;
  private readonly tickIntervalMs: number;
  private readonly leadIn: number;

  private bpmValue: number;
  private notes: NoteEvent[] = [];
  /** 下一个待排程音符在 notes 里的下标 */
  private cursor = 0;
  private totalBeatsValue = 0;

  private playingValue = false;
  /** 锚点：某一刻（音频时钟秒）对应某一拍 */
  private anchorTime = 0;
  private anchorBeat = 0;
  /** 暂停后停留的拍位 */
  private pausedBeat = 0;

  private ticker: Ticker | null = null;
  private lastSnapshot: TransportSnapshot;

  constructor(options: TransportOptions) {
    if (!(options.bpm > 0)) throw new RangeError('bpm 必须是正数');
    const lookahead = options.lookahead ?? DEFAULT_LOOKAHEAD_SECONDS;
    if (!(lookahead > 0)) throw new RangeError('lookahead 必须是正数');
    const tickIntervalMs = options.tickIntervalMs ?? DEFAULT_TICK_INTERVAL_MS;
    if (!(tickIntervalMs > 0)) throw new RangeError('tickIntervalMs 必须是正数');
    const leadIn = options.leadIn ?? DEFAULT_LEAD_IN_SECONDS;
    if (!(leadIn >= 0)) throw new RangeError('leadIn 不能是负数');

    this.now = options.now;
    this.bpmValue = options.bpm;
    this.lookahead = lookahead;
    this.tickIntervalMs = tickIntervalMs;
    this.leadIn = leadIn;
    this.callbacks = options.callbacks ?? {};
    this.tickerFactory = options.tickerFactory ?? createTicker;
    this.lastSnapshot = this.snapshotAt(0, 0);
  }

  // ------------------------------------------------------------ 基本属性

  get bpm(): number {
    return this.bpmValue;
  }

  /** 一拍多少秒 */
  get secondsPerBeat(): number {
    return 60 / this.bpmValue;
  }

  get playing(): boolean {
    return this.playingValue;
  }

  get totalBeats(): number {
    return this.totalBeatsValue;
  }

  get totalSeconds(): number {
    return this.totalBeatsValue * this.secondsPerBeat;
  }

  /** 当前拍位（播放中实时算，暂停时是停留点） */
  get beat(): number {
    return this.playingValue ? this.clampBeat(this.beatAt(this.now())) : this.pausedBeat;
  }

  /**
   * 未钳制的当前拍位。起播留白期间它是个小负数 —— 琴键高亮要用这个：
   * 用钳制后的 beat 会让第一个音在留白期就亮起来，比声音早 ~50ms。
   */
  get rawBeat(): number {
    return this.playingValue ? this.beatAt(this.now()) : this.pausedBeat;
  }

  /**
   * 绝对音频时刻 → 拍位（不钳制）。播放中才有效，暂停时返回停留点。
   * 延迟校准的修正入口：判定 / 清扫前先对时刻做修正
   * （`corrected = now − inputOffset`），再用本方法换算拍位 ——
   * 与内部 `rawBeat` 同一个公式同一个锚点，保证两边拍位可加减。
   */
  beatFromAudioTime(timeSec: number): number {
    return this.playingValue ? this.beatAt(timeSec) : this.pausedBeat;
  }

  get snapshot(): TransportSnapshot {
    return this.playingValue ? this.snapshotAt(this.beat, 0) : this.lastSnapshot;
  }

  // ------------------------------------------------------------ 拍 ↔ 秒

  /** 谱面拍位 → 秒（相对谱面开头） */
  beatToSeconds(beat: number): number {
    return beat * this.secondsPerBeat;
  }

  /** 秒 → 谱面拍位 */
  secondsToBeat(seconds: number): number {
    return seconds / this.secondsPerBeat;
  }

  // ------------------------------------------------------------ 装载与控制

  /** 装谱：按拍位排序，重置到开头 */
  load(notes: readonly NoteEvent[], options: LoadOptions = {}): void {
    if (options.bpm !== undefined) {
      if (!(options.bpm > 0)) throw new RangeError('bpm 必须是正数');
      this.bpmValue = options.bpm;
    }
    this.notes = [...notes].sort((a, b) => a.startBeat - b.startBeat || a.pitch - b.pitch);
    const last = this.notes[this.notes.length - 1];
    this.totalBeatsValue = options.totalBeats ?? (last ? last.startBeat + last.durationBeats : 0);
    this.cursor = 0;
    this.pausedBeat = 0;
    this.playingValue = false;
    this.ticker?.stop();
    this.lastSnapshot = this.snapshotAt(0, 0);
    this.callbacks.onTick?.(this.lastSnapshot);
  }

  /**
   * 开始播放。
   *
   * @param leadInOverride 覆盖本次起播的留白（秒）。跟弹模式传一个较大的值
   *   （比如 2s）：锚点推到未来，前几拍是「负拍位」，第一条音要过这么久才到判定线 ——
   *   下落长条正好从画布顶部落到线，玩家有完整的下落时间来反应。
   *   留白期间 `rawBeat` 是负数、`snapshot.beat` 钳在 0，漏按清扫不会误判。
   */
  play(leadInOverride?: number): void {
    if (this.playingValue || this.notes.length === 0) return;
    // 播到底之后再按播放：从头来
    if (this.pausedBeat >= this.totalBeatsValue) this.pausedBeat = 0;
    this.anchorBeat = this.pausedBeat;
    this.anchorTime = this.now() + (leadInOverride ?? this.leadIn);
    this.cursor = this.firstIndexAtOrAfter(this.anchorBeat);
    this.playingValue = true;
    this.ticker = this.tickerFactory(() => this.tick(), this.tickIntervalMs);
    this.ticker.start();
    // 立刻排一次，别干等 25ms
    this.tick();
  }

  pause(): void {
    if (!this.playingValue) return;
    this.pausedBeat = this.clampBeat(this.beatAt(this.now()));
    this.playingValue = false;
    this.ticker?.stop();
    this.ticker = null;
    this.callbacks.onCancelAll?.();
    this.lastSnapshot = this.snapshotAt(this.pausedBeat, 0);
    this.callbacks.onTick?.(this.lastSnapshot);
  }

  stop(): void {
    const wasPlaying = this.playingValue;
    this.playingValue = false;
    this.ticker?.stop();
    this.ticker = null;
    this.cursor = 0;
    this.pausedBeat = 0;
    if (wasPlaying) this.callbacks.onCancelAll?.();
    this.lastSnapshot = this.snapshotAt(0, 0);
    this.callbacks.onTick?.(this.lastSnapshot);
  }

  /** 跳到某一拍（播放中会重排该拍之后的音） */
  seek(beat: number): void {
    const target = this.clampBeat(beat);
    this.pausedBeat = target;
    if (this.playingValue) {
      this.callbacks.onCancelAll?.();
      this.anchorBeat = target;
      this.anchorTime = this.now() + this.leadIn;
      this.cursor = this.firstIndexAtOrAfter(target);
      this.lastSnapshot = this.snapshotAt(target, 0);
      this.callbacks.onTick?.(this.lastSnapshot);
      return;
    }
    this.cursor = this.firstIndexAtOrAfter(target);
    this.lastSnapshot = this.snapshotAt(target, 0);
    this.callbacks.onTick?.(this.lastSnapshot);
  }

  dispose(): void {
    this.playingValue = false;
    this.ticker?.dispose();
    this.ticker = null;
    this.notes = [];
    this.cursor = 0;
  }

  // ------------------------------------------------------------ 内部

  private tick(): void {
    if (!this.playingValue) return;
    const now = this.now();
    const horizon = now + this.lookahead;
    let scheduledAhead = 0;

    while (this.cursor < this.notes.length) {
      const note = this.notes[this.cursor];
      const planned = this.audioTimeForBeat(note.startBeat);
      if (planned > horizon) break;

      const late = planned < now;
      const when = late ? now : planned;
      scheduledAhead = Math.max(scheduledAhead, when - now);
      this.callbacks.onNote?.({
        id: note.id,
        pitch: note.pitch,
        velocity: note.velocity ?? 100,
        when,
        duration: this.beatToSeconds(note.durationBeats),
        beat: note.startBeat,
        late,
      });
      this.cursor += 1;
    }

    const beat = this.clampBeat(this.beatAt(now));
    const finished = this.cursor >= this.notes.length && beat >= this.totalBeatsValue;
    this.lastSnapshot = this.snapshotAt(beat, scheduledAhead);
    this.callbacks.onTick?.(this.lastSnapshot);

    if (finished) this.finish();
  }

  private finish(): void {
    this.playingValue = false;
    this.ticker?.stop();
    this.ticker = null;
    this.pausedBeat = this.totalBeatsValue;
    this.lastSnapshot = this.snapshotAt(this.totalBeatsValue, 0);
    this.callbacks.onTick?.(this.lastSnapshot);
    this.callbacks.onEnd?.();
  }

  /** 拍位 → 音频时间轴上的绝对时刻 */
  private audioTimeForBeat(beat: number): number {
    return this.anchorTime + (beat - this.anchorBeat) * this.secondsPerBeat;
  }

  /** 音频时间 → 拍位 */
  private beatAt(time: number): number {
    return this.anchorBeat + (time - this.anchorTime) / this.secondsPerBeat;
  }

  /** 第一个「不早于 beat」的音，理论上正好卡在拍点上 */
  private firstIndexAtOrAfter(beat: number): number {
    let index = 0;
    while (index < this.notes.length && this.notes[index].startBeat < beat - 1e-9) index += 1;
    return index;
  }

  private clampBeat(beat: number): number {
    if (!Number.isFinite(beat)) return 0;
    return Math.min(this.totalBeatsValue, Math.max(0, beat));
  }

  private snapshotAt(beat: number, scheduledAhead: number): TransportSnapshot {
    const total = this.totalBeatsValue;
    const clamped = Math.min(total, Math.max(0, beat));
    return {
      playing: this.playingValue,
      beat: clamped,
      seconds: this.beatToSeconds(clamped),
      totalBeats: total,
      totalSeconds: this.beatToSeconds(total),
      progress: total > 0 ? clamped / total : 0,
      scheduledAhead,
    };
  }
}
