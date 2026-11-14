import { Midi } from '@tonejs/midi';
import type { NoteEvent } from '@/types';
import {
  dropOutOfRangeNotes,
  sortNotes,
  type FormatAdapter,
  type ParseAnyInput,
  type UniversalParseResult,
} from './types';

/**
 * MIDI 适配器（.mid / .midi）—— 基于 @tonejs/midi。
 *
 * @tonejs/midi 把文件解成「秒」时间轴：`note.time` / `note.duration`（秒）、
 * `note.midi`（音高）、`note.velocity`（0–1 归一化）。我们用文件里**首个速度**
 * 把秒换算回拍位（beat = 秒 ÷ 每拍秒数），落进与字符谱同一套四分音符坐标系。
 *
 * 刻意不做的事：
 * - **多段变速不展开**：Transport 是单一 BPM 的时间轴，含渐慢/渐快的 MIDI
 *   按首个速度等比换算（有拍点漂移，warnings 里注明）；
 * - **打击乐通道（channel 10）整轨丢弃**：鼓没有音高意义；
 * - 超出 88 键（A0–C8）的音丢弃并计数 —— 引擎的采样只覆盖这 88 个键。
 */
async function parseMidi(input: ParseAnyInput): Promise<UniversalParseResult> {
  const warnings: string[] = [];
  const source = input.bytes;
  if (!source) {
    throw new TypeError('MIDI 解析需要二进制输入（bytes）');
  }
  const midi = new Midi(source);

  const bpm = midi.header.tempos[0]?.bpm ?? 120;
  if (midi.header.tempos.length > 1) {
    warnings.push(
      `MIDI 含 ${midi.header.tempos.length} 处速度变化，按首个速度（${Math.round(bpm)} BPM）统一换算拍位`,
    );
  }
  const secondsPerBeat = 60 / bpm;

  const candidates: Array<Omit<NoteEvent, 'id'>> = [];
  for (const track of midi.tracks) {
    if (track.instrument.percussion) continue;
    for (const note of track.notes) {
      candidates.push({
        pitch: note.midi,
        startBeat: note.time / secondsPerBeat,
        durationBeats: Math.max(note.duration, 0.01) / secondsPerBeat,
        velocity: Math.min(127, Math.max(1, Math.round(note.velocity * 127))),
      });
    }
  }
  const notes = sortNotes(dropOutOfRangeNotes(candidates, warnings, 'm'));
  if (notes.length === 0) {
    throw new Error('MIDI 里没有可演奏的音符（可能只有打击乐轨或全部音超出音域）');
  }
  return Promise.resolve({
    format: 'midi',
    title: midi.name || null,
    bpm,
    notes,
    warnings,
  });
}

export const midiAdapter: FormatAdapter = {
  id: 'midi',
  extensions: ['.mid', '.midi'],
  parse: parseMidi,
};
