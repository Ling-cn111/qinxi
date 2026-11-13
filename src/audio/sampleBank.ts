import { synthAnchorFor, SYNTH_ANCHOR_STEP } from './synth';

export type AnchorSource = 'synth' | 'remote';

export interface SampleAnchor {
  midi: number;
  buffer: AudioBuffer;
  source: AnchorSource;
}

export interface ResolvedSample {
  buffer: AudioBuffer;
  /** 播放速率 = 2^((目标音高 - 锚点音高)/12) */
  ratio: number;
  anchorMidi: number;
  source: AnchorSource;
}

/**
 * 采样库：按音高选择最近的采样锚点，用 playbackRate 做音高换算。
 * 远程采样与合成锚点共用一张表——远程采样到达后就替换同音高的合成锚点。
 */
export class SampleBank {
  private anchors: SampleAnchor[] = [];

  get size(): number {
    return this.anchors.length;
  }

  get remoteCount(): number {
    return this.anchors.filter((a) => a.source === 'remote').length;
  }

  list(): readonly SampleAnchor[] {
    return this.anchors;
  }

  set(anchor: SampleAnchor): void {
    // 远程采样优先：不允许合成锚点覆盖已加载的远程采样
    const existing = this.anchors.find((a) => a.midi === anchor.midi);
    if (existing && existing.source === 'remote' && anchor.source === 'synth') return;
    this.anchors = this.anchors.filter((a) => a.midi !== anchor.midi);
    this.anchors.push(anchor);
    this.anchors.sort((a, b) => a.midi - b.midi);
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
      if (distance < bestDistance) {
        best = anchor;
        bestDistance = distance;
      }
    }
    return {
      buffer: best.buffer,
      ratio: Math.pow(2, (pitch - best.midi) / 12),
      anchorMidi: best.midi,
      source: best.source,
    };
  }

  /** 取最近锚点；库里还没有可用锚点时用 factory 现场合成一份 */
  resolve(pitch: number, factory: (midi: number) => AudioBuffer): ResolvedSample {
    const found = this.find(pitch);
    if (found) return found;
    const midi = synthAnchorFor(pitch);
    this.set({ midi, buffer: factory(midi), source: 'synth' });
    const created = this.find(pitch);
    if (!created) throw new Error('采样库初始化失败');
    return created;
  }

  /** 预渲染中央音区，保证第一次按键不会因为现场合成而有延迟 */
  prewarm(factory: (midi: number) => AudioBuffer, pitches: number[] = [57, 69, 81]): void {
    for (const pitch of pitches) {
      const midi = synthAnchorFor(pitch);
      if (this.anchors.some((a) => a.midi === midi)) continue;
      this.set({ midi, buffer: factory(midi), source: 'synth' });
    }
  }
}

export { SYNTH_ANCHOR_STEP };
