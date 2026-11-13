import { nameToMidi, normalizeNoteParams, velocityToGain } from './note';
import { SampleBank } from './sampleBank';
import { renderPianoTone } from './synth';
import { AUTOPIANO_SAMPLE_DIR, AUTOPIANO_SAMPLES } from './autopianoSamples';
import { NodePool } from './nodePool';
import { createLegacyToneChain, type ToneChain } from './legacyTone';

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
  private master: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private toneChain: ToneChain | null = null;
  private readonly bank = new SampleBank();
  private readonly gainPool: NodePool<GainNode>;

  private voices: Voice[] = [];
  private starting: Promise<void> | null = null;
  private disposed = false;
  private readonly listeners = new Set<(status: EngineStatus) => void>();

  private readonly sampleDir: string;
  private readonly fallbackSampleUrl: string;
  private readonly fallbackSampleNames: string[];
  private readonly desiredVolume: number;
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
    this.desiredVolume = options.volume ?? 0.75;
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
      this.bank.prewarm((midi) => renderPianoTone(ctx, midi), [69]);
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
    const master = ctx.createGain();
    master.gain.value = this.desiredVolume;

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 6;
    limiter.ratio.value = 6;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;

    master.connect(limiter);
    limiter.connect(ctx.destination);
    this.master = master;
    this.limiter = limiter;
  }

  /** 启用降级染色：master → 低通 → 软削波 → limiter */
  private enableLegacyTone(ctx: AudioContext): void {
    if (this.toneChain || !this.master || !this.limiter) return;
    const chain = createLegacyToneChain(ctx);
    this.master.disconnect();
    this.master.connect(chain.input);
    chain.output.connect(this.limiter);
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
          this.bank.set({ midi: task.midi, buffer, source });
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
    for (const voice of this.voices) {
      if (voice.pitch === pitch && !voice.released) this.releaseVoice(voice, at);
    }
  }

  /** 定时长发声，供自动播放 / 练习回放使用 */
  playNote(pitch: number, when?: number, durationSeconds = 1.6, velocity = 100): void {
    this.scheduleVoice(pitch, velocity, when, durationSeconds);
  }

  stopAll(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    for (const voice of this.voices) {
      if (!voice.released) this.releaseVoice(voice, ctx.currentTime);
    }
  }

  setVolume(value: number): void {
    const clamped = Math.min(1, Math.max(0, value));
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(clamped, this.ctx.currentTime, 0.01);
    }
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
    const master = this.master;
    if (!ctx || !master) return;
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

    const sample = this.bank.resolve(params.pitch, (midi) => renderPianoTone(ctx, midi));

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
    gain.gain.setValueAtTime(0.0001, params.when);
    gain.gain.linearRampToValueAtTime(velocityToGain(params.velocity), params.when + 0.004);

    source.connect(gain);
    gain.connect(master);
    source.start(params.when);

    const voice: Voice = {
      pitch: params.pitch,
      source,
      gain,
      startedAt: params.when,
      released: false,
    };
    this.voices.push(voice);

    source.onended = () => {
      source.disconnect();
      this.gainPool.release(gain);
      this.voices = this.voices.filter((v) => v !== voice);
    };

    if (durationSeconds !== undefined && durationSeconds > 0) {
      this.releaseVoice(voice, params.when + durationSeconds);
    }
  }

  private releaseVoice(voice: Voice, at: number, timeConstant = 0.05): void {
    if (voice.released) return;
    voice.released = true;
    const ctx = this.ctx;
    if (!ctx) return;
    const gainParam = voice.gain.gain;
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
