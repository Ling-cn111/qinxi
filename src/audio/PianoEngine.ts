import { nameToMidi, normalizeNoteParams } from './note';
import { SampleBank } from './sampleBank';
import { renderPianoTone } from './synth';
import { AUTOPIANO_SAMPLE_DIR, AUTOPIANO_SAMPLES } from './autopianoSamples';
import { NodePool } from './nodePool';
import { createLegacyToneChain, type ToneChain } from './legacyTone';
import { type SynthTone } from './sampleBank';
import {
  ATTACK_SECONDS,
  BUS_BASE_GAIN,
  busGainFor,
  decaySecondsForPitch,
  normalizedGainFor,
  peakOf,
} from './gain';

export type EngineSource = 'none' | 'autopiano' | 'salamander' | 'synth';

export interface EngineStatus {
  /** 当前音源：none 未就绪 / autopiano 原版采样 / salamander 降级采样 / synth 合成兜底 */
  source: EngineSource;
  loaded: number;
  total: number;
  ready: boolean;
  message: string;
}

interface Voice {
  pitch: number;
  source: AudioBufferSourceNode;
  gain: GainNode;
  startedAt: number;
  released: boolean;
  /** 释放被安排在哪一刻；`Infinity` = 还没安排 */
  releaseAt: number;
}

export interface PianoEngineOptions {
  /** 本地采样目录，默认 `public/samples/piano` */
  sampleDir?: string;
  /** 降级用的远程采样目录 */
  fallbackSampleUrl?: string;
  /** 降级采样文件名（不含扩展名） */
  fallbackSampleNames?: string[];
  volume?: number;
  maxPolyphony?: number;
}

/** 降级链路：本地 AutoPiano 采样拿不到时才启用，用 Salamander + 低通/软削波模拟旧录音质感 */
const FALLBACK_SAMPLE_URL = 'https://tonejs.github.io/audio/salamander';
const FALLBACK_SAMPLE_NAMES = [
  'C4', 'Ds4', 'Fs4', 'A4',
  'C3', 'Ds3', 'Fs3', 'A3',
  'C5', 'Ds5', 'Fs5', 'A5',
];

const FETCH_TIMEOUT_MS = 12_000;
const LOAD_CONCURRENCY = 6;
const DEFAULT_MAX_POLYPHONY = 64;
/** 中央 C，用于决定采样加载顺序 */
const CENTRE_MIDI = 60;

interface SampleTask {
  midi: number;
  url: string;
}

/**
 * 钢琴音频引擎。
 *
 * 声音来源优先级：本地 AutoPiano 单音 MP3 → 远程 Salamander（加低通/软削波染色）→ 现场合成。
 * 三条路径共用同一套复音管理、节点池与调度逻辑，只替换 buffer 来源这一层。
 * 所有发声都由 `AudioBufferSourceNode.start(when)` 直接调度，时钟只有 `AudioContext.currentTime`。
 */
export class PianoEngine {
  private ctx: AudioContext | null = null;
  /** 复音总线：所有发声先汇到这里，再由总线统一限幅后进 destination */
  private bus: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private toneChain: ToneChain | null = null;
  private volume = 1;
  private readonly bank = new SampleBank();
  private readonly gainPool: NodePool<GainNode>;

  private voices: Voice[] = [];
  private starting: Promise<void> | null = null;
  private disposed = false;
  private readonly listeners = new Set<(status: EngineStatus) => void>();

  private readonly sampleDir: string;
  private readonly fallbackSampleUrl: string;
  private readonly fallbackSampleNames: string[];
  private readonly maxPolyphony: number;

  status: EngineStatus = {
    source: 'none',
    loaded: 0,
    total: 0,
    ready: false,
    message: '音频未初始化',
  };

  constructor(options: PianoEngineOptions = {}) {
    this.sampleDir = options.sampleDir ?? `${import.meta.env.BASE_URL}${AUTOPIANO_SAMPLE_DIR}`;
    this.fallbackSampleUrl = options.fallbackSampleUrl ?? FALLBACK_SAMPLE_URL;
    this.fallbackSampleNames = options.fallbackSampleNames ?? FALLBACK_SAMPLE_NAMES;
    this.volume = Math.min(1, Math.max(0, options.volume ?? 1));
    this.maxPolyphony = options.maxPolyphony ?? DEFAULT_MAX_POLYPHONY;
    this.gainPool = new NodePool<GainNode>(() => {
      const ctx = this.ctx;
      if (!ctx) throw new Error('AudioContext 未初始化');
      return ctx.createGain();
    }, this.maxPolyphony);
  }

  /** 当前音频时钟（秒）。判定引擎唯一权威时钟。 */
  now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  get context(): AudioContext | null {
    return this.ctx;
  }

  get isReady(): boolean {
    return this.status.ready;
  }

  /** 已加载的真实采样数量（不含合成锚点） */
  get sampledCount(): number {
    return this.bank.countOf('autopiano') + this.bank.countOf('salamander');
  }

  onStatus(listener: (status: EngineStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => this.listeners.delete(listener);
  }

  /**
   * 初始化音频上下文并开始加载采样。
   * 必须在用户手势（按下琴键 / 点击）里调用，否则浏览器会挂起 AudioContext。
   */
  start(): Promise<void> {
    if (this.starting) return this.starting;
    this.starting = this.bootstrap();
    return this.starting;
  }

  private bootstrap(): Promise<void> {
    if (!this.ctx) {
      const Ctor: typeof AudioContext | undefined =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) {
        this.patch({ message: '当前浏览器不支持 Web Audio API', ready: false, source: 'none' });
        return Promise.resolve();
      }
      const ctx = new Ctor({ latencyHint: 'interactive' });
      this.ctx = ctx;
      this.buildGraph(ctx);
      // 预渲染中央音区一个合成锚点（约 25ms），保证第一次按键不会沉默
      this.bank.prewarm((midi) => this.synthTone(ctx, midi), [69]);
      ctx.onstatechange = () => this.syncState();
    }

    // 不 await：自动播放策略未放行时 resume() 会一直挂起，等待它会卡住后续状态更新
    this.resumeContext();

    this.patch({
      source: 'autopiano',
      ready: this.ctx.state === 'running',
      message:
        this.ctx.state === 'running' ? '正在加载 AutoPiano 采样…' : '音频待启用：点击页面或按一下琴键',
    });

    void this.loadSamples();
    return Promise.resolve();
  }

  private buildGraph(ctx: AudioContext): void {
    const bus = ctx.createGain();
    bus.gain.value = BUS_BASE_GAIN * this.volume;

    // 真峰值限制器：规格里的下压只在 >12 声部时生效，而实测 C4+E4+G4 的瞬时叠峰
    // 已达 +1.48dBFS，仅靠总线下压挡不住 3 音和弦的削顶，这里补一级阈值 -1dB 的限制。
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -1;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.12;

    bus.connect(limiter);
    limiter.connect(ctx.destination);
    this.bus = bus;
    this.limiter = limiter;
  }

  /** 总线增益 = 0.7 × 音量 × 复音下压系数（活跃 source > 12 时按比例降，最低 0.4） */
  private applyBusGain(): void {
    const bus = this.bus;
    const ctx = this.ctx;
    if (!bus || !ctx) return;
    const active = this.voices.filter((voice) => !voice.released).length;
    bus.gain.setTargetAtTime(busGainFor(active, this.volume), ctx.currentTime, 0.02);
  }

  /** 现场合成的兜底音，同时算出它的归一化增益 */
  private synthTone(ctx: AudioContext, midi: number): SynthTone {
    const buffer = renderPianoTone(ctx, midi);
    return { buffer, gain: normalizedGainFor(peakOf([buffer.getChannelData(0)])) };
  }

  /** 启用降级染色：bus → 低通 → 软削波 → destination */
  private enableLegacyTone(ctx: AudioContext): void {
    if (this.toneChain || !this.bus) return;
    const chain = createLegacyToneChain(ctx);
    this.bus.disconnect();
    this.bus.connect(chain.input);
    chain.output.connect(this.limiter ?? ctx.destination);
    this.toneChain = chain;
  }

  private resumeContext(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state === 'running') return;
    void ctx.resume().catch(() => undefined);
  }

  private syncState(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (ctx.state !== 'running') {
      this.patch({ ready: false, message: '音频已暂停：点击页面或按一下琴键' });
      return;
    }
    this.patch({ ready: true, message: this.status.message });
  }

  // ---------------------------------------------------------------- 采样加载

  private autoPianoTasks(): SampleTask[] {
    const tasks: SampleTask[] = [];
    for (const [note, file] of AUTOPIANO_SAMPLES) {
      const midi = nameToMidi(note);
      if (midi === null) continue;
      tasks.push({ midi, url: `${this.sampleDir}/${file}` });
    }
    return tasks;
  }

  private async loadSamples(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;

    const tasks = this.autoPianoTasks();
    this.patch({ total: tasks.length, loaded: 0, message: `正在加载 AutoPiano 采样 0/${tasks.length}` });
    const loaded = await this.loadBatch(ctx, tasks, 'autopiano');

    if (loaded > 0) {
      // 真实采样到位，丢掉之前的合成锚点
      this.bank.dropSource('synth');
      this.patch({
        source: 'autopiano',
        loaded,
        total: tasks.length,
        message: `AutoPiano 钢琴采样（${loaded} 音）`,
      });
      return;
    }

    const fallbackTasks: SampleTask[] = this.fallbackSampleNames
      .map((name) => {
        const midi = nameToMidi(name);
        return midi === null ? null : { midi, url: `${this.fallbackSampleUrl}/${name}.mp3` };
      })
      .filter((task): task is SampleTask => task !== null);

    this.patch({ total: fallbackTasks.length, loaded: 0, message: '本地采样不可用，尝试远程采样…' });
    const fallbackLoaded = await this.loadBatch(ctx, fallbackTasks, 'salamander');

    if (fallbackLoaded > 0) {
      this.bank.dropSource('synth');
      this.enableLegacyTone(ctx);
      this.patch({
        source: 'salamander',
        loaded: fallbackLoaded,
        total: fallbackTasks.length,
        message: `本地采样不可用，降级 Salamander 采样 + 低通染色（${fallbackLoaded} 音）`,
      });
      return;
    }

    this.patch({ source: 'synth', message: '采样不可用，当前使用内置合成音色' });
  }

  private async loadBatch(
    ctx: AudioContext,
    tasks: SampleTask[],
    source: 'autopiano' | 'salamander',
  ): Promise<number> {
    // 先中央音区、再向两侧扩散，让键盘最快变得"像钢琴"
    const ordered = [...tasks].sort(
      (a, b) => Math.abs(a.midi - CENTRE_MIDI) - Math.abs(b.midi - CENTRE_MIDI),
    );
    let loaded = 0;
    let cursor = 0;

    const worker = async (): Promise<void> => {
      while (cursor < ordered.length && !this.disposed) {
        const task = ordered[cursor];
        cursor += 1;
        try {
          const buffer = await this.fetchBuffer(ctx, task.url);
          const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) =>
            buffer.getChannelData(i),
          );
          // 逐音归一化：峰值拉到 -1dBFS，解决不同音高录音电平不一致
          const gain = normalizedGainFor(peakOf(channels));
          this.bank.set({ midi: task.midi, buffer, gain, source });
          loaded += 1;
          this.patch({
            source,
            loaded,
            total: tasks.length,
            message: `${source === 'autopiano' ? 'AutoPiano 采样' : '远程采样'} ${loaded}/${tasks.length}`,
          });
        } catch {
          // 单份失败不阻塞：该音高最终会由最近锚点移调覆盖
        }
      }
    };

    const workers = Array.from({ length: Math.min(LOAD_CONCURRENCY, ordered.length) }, () => worker());
    await Promise.all(workers);
    return loaded;
  }

  private async fetchBuffer(ctx: AudioContext, url: string): Promise<AudioBuffer> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const raw = await response.arrayBuffer();
      return await ctx.decodeAudioData(raw);
    } finally {
      clearTimeout(timer);
    }
  }

  // ------------------------------------------------------------------ 发声

  /**
   * 触发一次发声（按下琴键）。
   * @param pitch MIDI 音高 21–108
   * @param velocity 力度 0–127
   * @param when AudioContext 时间轴上的调度时刻，省略则"立即"
   */
  noteOn(pitch: number, velocity = 100, when?: number): void {
    this.scheduleVoice(pitch, velocity, when);
  }

  /** 松开琴键：进入短释放，而不是硬切 */
  noteOff(pitch: number, when?: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const at = Number.isFinite(when) ? Math.max(when as number, ctx.currentTime) : ctx.currentTime;
    // 不能用 `!voice.released` 过滤：playNote 会把释放提前排到将来并立刻标记 released，
    // 这样过滤会让手动的 noteOff 完全失效。是否真的要释放交给 releaseVoice 按时刻判断。
    for (const voice of this.voices) {
      if (voice.pitch === pitch) this.releaseVoice(voice, at);
    }
  }

  /** 定时长发声，供自动播放 / 练习回放使用 */
  playNote(pitch: number, when?: number, durationSeconds = 1.6, velocity = 100): void {
    this.scheduleVoice(pitch, velocity, when, durationSeconds);
  }

  stopAll(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    // 同 noteOff：已经排了「未来释放」的音（playNote）也要掐掉，判断在 releaseVoice 里做
    for (const voice of this.voices) {
      this.releaseVoice(voice, ctx.currentTime);
    }
  }

  setVolume(value: number): void {
    this.volume = Math.min(1, Math.max(0, value));
    this.applyBusGain();
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.stopAll();
    this.listeners.clear();
    this.gainPool.clear();
    if (this.ctx) {
      await this.ctx.close().catch(() => undefined);
      this.ctx = null;
    }
  }

  private scheduleVoice(
    pitch: number,
    velocity: number,
    when?: number,
    durationSeconds?: number,
  ): void {
    const ctx = this.ctx;
    const bus = this.bus;
    if (!ctx || !bus) return;
    // 任何一次发声都顺手尝试解锁音频上下文（自动播放策略要求用户手势）
    if (ctx.state !== 'running') this.resumeContext();

    let params;
    try {
      params = normalizeNoteParams(pitch, velocity, when ?? Number.NaN, ctx.currentTime);
    } catch (error) {
      console.warn('[PianoEngine] 忽略非法发声请求：', (error as Error).message);
      return;
    }
    if (params.velocity === 0) return;

    const sample = this.bank.resolve(params.pitch, (midi) => this.synthTone(ctx, midi));

    // 复音管理：超限时把最早的发声快速淡出，腾出节点
    if (this.voices.filter((v) => !v.released).length >= this.maxPolyphony) {
      const oldest = this.voices.find((v) => !v.released);
      if (oldest) this.releaseVoice(oldest, params.when, 0.02);
    }

    const source = ctx.createBufferSource();
    source.buffer = sample.buffer;
    source.playbackRate.value = sample.ratio;

    const gain = this.gainPool.acquire();
    gain.gain.cancelScheduledValues(0);

    // 每个音一条独立包络：8ms 线性起音 → 指数衰减（常数随音区变化）
    const peakGain = sample.gain * (params.velocity / 100);
    const attackEnd = params.when + ATTACK_SECONDS;
    gain.gain.setValueAtTime(0, params.when);
    gain.gain.linearRampToValueAtTime(peakGain, attackEnd);
    gain.gain.setTargetAtTime(0, attackEnd, decaySecondsForPitch(params.pitch));

    source.connect(gain);
    gain.connect(bus);
    source.start(params.when);

    const voice: Voice = {
      pitch: params.pitch,
      source,
      gain,
      startedAt: params.when,
      released: false,
      releaseAt: Number.POSITIVE_INFINITY,
    };
    this.voices.push(voice);

    source.onended = () => {
      source.disconnect();
      this.gainPool.release(gain);
      this.voices = this.voices.filter((v) => v !== voice);
      this.applyBusGain();
    };

    this.applyBusGain();

    if (durationSeconds !== undefined && durationSeconds > 0) {
      this.releaseVoice(voice, params.when + durationSeconds);
    }
  }

  /**
   * 释放一颗音。
   *
   * 两个坑都在这里：
   *
   * 1. `playNote()` 会把释放**提前排到** `when + duration`，并且立刻把 `released` 置为 true。
   *    如果这里简单地 `if (voice.released) return`，那么停下来时（`stopAll()` / `noteOff()`）
   *    这颗音就再也掐不掉了 —— 表现为「按了暂停，音却照常响满一整拍」。
   *    所以判定看的是**时刻**：只有「已经按不晚于这一时刻释放过」才跳过。
   *
   * 2. 还没起振的音（前瞻调度里已经排进音频图，`start` 时刻在未来）必须硬杀，不能走释放包络：
   *    `cancelScheduledValues` 会连 `setValueAtTime(0, when)` 一起取消，gain 回落到默认值 1，
   *    于是 `setTargetAtTime(0, at)` 是从 1 开始衰减的 —— 等 source 在未来时刻真的 start 时
   *    仍有残余增益，实测会在那一刻冒一个约 -36dBFS 的「嗒」。
   */
  private releaseVoice(voice: Voice, at: number, timeConstant = 0.05): void {
    const ctx = this.ctx;
    if (!ctx) return;
    // 已经按「不晚于这次」的时刻释放过，不必重复
    if (voice.released && at >= voice.releaseAt - 1e-6) return;

    const gainParam = voice.gain.gain;
    const pending = voice.startedAt > at;
    voice.released = true;
    voice.releaseAt = at;

    if (pending) {
      try {
        gainParam.cancelScheduledValues(0);
        gainParam.setValueAtTime(0, at);
        voice.source.stop(at);
      } catch {
        /* source 状态异常时忽略 */
      }
      return;
    }

    try {
      gainParam.cancelScheduledValues(at);
      gainParam.setTargetAtTime(0, at, timeConstant);
      voice.source.stop(at + timeConstant * 8);
    } catch {
      /* 已经停止的 source 再次 stop 会抛错，忽略即可 */
    }
  }

  private patch(partial: Partial<EngineStatus>): void {
    this.status = { ...this.status, ...partial };
    for (const listener of this.listeners) listener(this.status);
  }
}
