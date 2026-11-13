import { synthAnchorFor, SYNTH_ANCHOR_STEP } from './synth';

/** 采样来源，优先级 autopiano > salamander > synth */
export type AnchorSource = 'autopiano' | 'salamander' | 'synth';

const SOURCE_RANK: Record<AnchorSource, number> = {
  autopiano: 3,
  salamander: 2,
  synth: 1,
};

export interface SampleAnchor {
  midi: number;
  buffer: AudioBuffer;
  /** 峰值归一化后的增益乘数（0.89 / peak），未归一化时视为 1 */
  gain?: number;
  source: AnchorSource;
}

/** 现场合成出来的兜底音，带自己的归一化增益 */
export interface SynthTone {
  buffer: AudioBuffer;
  gain: number;
}

export interface ResolvedSample {
  buffer: AudioBuffer;
  /** 该音的归一化增益 */
  gain: number;
  /** 播放速率 = 2^((目标音高 - 锚点音高)/12)，用于移调覆盖没有采样的音高 */
  ratio: number;
  anchorMidi: number;
  source: AnchorSource;
}

/**
 * 采样库：按音高选择最近的采样锚点，用 playbackRate 做音高换算。
 *
 * 88 键中超出采样范围的音（AutoPiano 只录到 C2–C7）就靠这套机制移调兜底，
 * 因此键盘不会出现哑键。不同来源的锚点共用一张表，高优先级来源会挤掉低优先级的同音锚点。
 */
export class SampleBank {
  private anchors: SampleAnchor[] = [];

  get size(): number {
    return this.anchors.length;
  }

  list(): readonly SampleAnchor[] {
    return this.anchors;
  }

  countOf(source: AnchorSource): number {
    return this.anchors.filter((a) => a.source === source).length;
  }

  set(anchor: SampleAnchor): void {
    const existing = this.anchors.find((a) => a.midi === anchor.midi);
    // 低优先级来源不允许覆盖高优先级来源（例如合成锚点不能顶掉真实采样）
    if (existing && SOURCE_RANK[existing.source] > SOURCE_RANK[anchor.source]) return;
    this.anchors = this.anchors.filter((a) => a.midi !== anchor.midi);
    this.anchors.push(anchor);
    this.anchors.sort((a, b) => a.midi - b.midi);
  }

  dropSource(source: AnchorSource): void {
    this.anchors = this.anchors.filter((a) => a.source !== source);
  }

  clear(): void {
    this.anchors = [];
  }

  find(pitch: number): ResolvedSample | null {
    if (this.anchors.length === 0) return null;
    let best = this.anchors[0];
    let bestDistance = Math.abs(best.midi - pitch);
    for (const anchor of this.anchors) {
      const distance = Math.abs(anchor.midi - pitch);
      // 同距离时优先高优先级来源
      if (
        distance < bestDistance ||
        (distance === bestDistance && SOURCE_RANK[anchor.source] > SOURCE_RANK[best.source])
      ) {
        best = anchor;
        bestDistance = distance;
      }
    }
    return {
      buffer: best.buffer,
      gain: best.gain ?? 1,
      ratio: Math.pow(2, (pitch - best.midi) / 12),
      anchorMidi: best.midi,
      source: best.source,
    };
  }

  /** 取最近锚点；库里还没有可用锚点时用 factory 现场合成一份 */
  resolve(pitch: number, factory: (midi: number) => SynthTone): ResolvedSample {
    const found = this.find(pitch);
    if (found) return found;
    const midi = synthAnchorFor(pitch);
    const tone = factory(midi);
    this.set({ midi, buffer: tone.buffer, gain: tone.gain, source: 'synth' });
    const created = this.find(pitch);
    if (!created) throw new Error('采样库初始化失败');
    return created;
  }

  /** 预渲染指定音区，保证第一次按键不会因为现场合成而有延迟 */
  prewarm(factory: (midi: number) => SynthTone, pitches: number[] = [57, 69, 81]): void {
    for (const pitch of pitches) {
      const midi = synthAnchorFor(pitch);
      if (this.anchors.some((a) => a.midi === midi)) continue;
      const tone = factory(midi);
      this.set({ midi, buffer: tone.buffer, gain: tone.gain, source: 'synth' });
    }
  }
}

export { SYNTH_ANCHOR_STEP };
