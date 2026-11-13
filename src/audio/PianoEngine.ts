import { normalizeNoteParams, velocityToGain, nameToMidi } from './note';
import { SampleBank } from './sampleBank';
import { renderPianoTone } from './synth';

export type EngineSource = 'none' | 'synth' | 'remote';

export interface EngineStatus {
  /** 当前使用的音源：none 未就绪 / synth 内置合成兜底 / remote 远程钢琴采样 */
  source: EngineSource;
  /** 已加载的远程采样数量 */
  loaded: number;
  /** 计划加载的远程采样总数 */
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
  /** Salamander 采样所在目录 */
  sampleBaseUrl?: string;
  /** 采样文件名（不含扩展名），按加载优先级排列 */
  sampleNames?: string[];
  /** 主音量 0–1 */
  volume?: number;
  /** 同时发声的最大复音数 */
  maxPolyphony?: number;
}

/**
 * 采样名（Salamander Grand Piano 命名：Ds = D#）。
 * 前四个是中央音区，优先加载让键盘“立刻”有真实音色，其余后台补齐。
 */
const DEFAULT_SAMPLE_NAMES = [
  'C4', 'Ds4', 'Fs4', 'A4',
  'C3', 'Ds3', 'Fs3', 'A3',
  'C5', 'Ds5', 'Fs5', 'A5',
  'C2', 'A2', 'C6', 'A6',
  'C7', 'A7', 'C8',
];

const DEFAULT_SAMPLE_BASE_URL = 'https://tonejs.github.io/audio/salamander';
const SAMPLE_TIMEOUT_MS = 12_000;
const DEFAULT_MAX_POLYPHONY = 64;

/**
 * 钢琴音频引擎。
 *
 * 设计要点：
 * 1. 只用原生 Web Audio API，直接 `AudioBufferSourceNode.start(when)` 调度，不引入任何第三方
 *    调度/采样封装，避免额外延迟与不可控的时钟；
 * 2. 合成兜底锚点在 AudioContext 创建后立即渲染，保证断网也能发声；
 * 3. 远程采样在后台逐份加载并替换合成锚点，全程不阻塞弹奏。
 */
export class PianoEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly bank = new SampleBank();
  private voices: Voice[] = [];
  private starting: Promise<void> | null = null;
  private disposed = false;
  private readonly listeners = new Set<(status: EngineStatus) => void>();

  private readonly sampleBaseUrl: string;
  private readonly sampleNames: string[];
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
    this.sampleBaseUrl = options.sampleBaseUrl ?? DEFAULT_SAMPLE_BASE_URL;
    this.sampleNames = options.sampleNames ?? DEFAULT_SAMPLE_NAMES;
    this.desiredVolume = options.volume ?? 0.75;
    this.maxPolyphony = options.maxPolyphony ?? DEFAULT_MAX_POLYPHONY;
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

  private async bootstrap(): Promise<void> {
    if (!this.ctx) {
      const Ctor: typeof AudioContext | undefined =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) {
        this.patch({ message: '当前浏览器不支持 Web Audio API', ready: false, source: 'none' });
        return;
      }
      this.ctx = new Ctor({ latencyHint: 'interactive' });
      this.buildGraph(this.ctx);
      // 预渲染中央音区一个锚点（约 25ms），让第一次按键不会因为现场合成而有延迟
      this.bank.prewarm((midi) => renderPianoTone(this.ctx!, midi), [69]);
      this.ctx.onstatechange = () => this.syncState();
    }

    // 不 await：自动播放策略未放行时 resume() 会一直挂起，等待它会卡住后续状态更新
    this.resumeContext();

    this.patch({
      source: this.bank.remoteCount > 0 ? 'remote' : 'synth',
      ready: this.ctx.state === 'running',
      message:
        this.ctx.state === 'running' ? '内置合成音色（正在加载钢琴采样）' : '音频待启用：点击页面或按一下琴键',
    });

    void this.loadRemoteSamples();
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
    this.patch({
      ready: true,
      message:
        this.bank.remoteCount > 0 ? `钢琴采样已就绪（${this.bank.remoteCount} 份）` : '内置合成音色',
    });
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
  }

  private async loadRemoteSamples(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;
    const total = this.sampleNames.length;
    this.patch({ total, loaded: 0, message: '正在加载钢琴采样…' });

    let loaded = 0;
    const loadOne = async (name: string): Promise<void> => {
      if (this.disposed) return;
      const midi = nameToMidi(name);
      if (midi === null) return;
      try {
        const buffer = await this.fetchSample(ctx, name);
        this.bank.set({ midi, buffer, source: 'remote' });
        loaded += 1;
        this.patch({ source: 'remote', loaded, message: `钢琴采样 ${loaded}/${total}` });
      } catch {
        // 单份采样失败不影响整体，继续下一份（合成锚点仍在兜底）
      }
    };

    // 中央音区优先：先让键盘听起来是钢琴，其余并发补齐
    const queue = [...this.sampleNames];
    const priority = queue.splice(0, 4);
    await Promise.all(priority.map(loadOne));

    await Promise.all(
      Array.from({ length: 4 }, async () => {
        while (queue.length > 0 && !this.disposed) {
          await loadOne(queue.shift() as string);
        }
      }),
    );

    if (loaded === 0) {
      this.patch({ source: 'synth', message: '采样加载失败，当前使用内置合成音色' });
    } else {
      this.patch({ source: 'remote', loaded, message: `钢琴采样已就绪（${loaded} 份）` });
    }
  }

  private async fetchSample(ctx: AudioContext, name: string): Promise<AudioBuffer> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SAMPLE_TIMEOUT_MS);
    try {
      const response = await fetch(`${this.sampleBaseUrl}/${name}.mp3`, {
        signal: controller.signal,
        mode: 'cors',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const raw = await response.arrayBuffer();
      return await ctx.decodeAudioData(raw);
    } finally {
      clearTimeout(timer);
    }
  }

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

    // 复音管理：超限时把最早的发声快速淡出
    if (this.voices.filter((v) => !v.released).length >= this.maxPolyphony) {
      const oldest = this.voices.find((v) => !v.released);
      if (oldest) this.releaseVoice(oldest, params.when, 0.02);
    }

    const source = ctx.createBufferSource();
    source.buffer = sample.buffer;
    source.playbackRate.value = sample.ratio;

    const gain = ctx.createGain();
    const peak = velocityToGain(params.velocity);
    const attackEnd = params.when + 0.004;
    gain.gain.setValueAtTime(0.0001, params.when);
    gain.gain.linearRampToValueAtTime(peak, attackEnd);

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
      gain.disconnect();
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
