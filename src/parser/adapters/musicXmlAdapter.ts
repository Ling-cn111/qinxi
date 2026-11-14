import { loadScore } from '@webmusic/score/io';
import type { NoteEvent } from '@/types';
import {
  dropOutOfRangeNotes,
  sortNotes,
  type FormatAdapter,
  type ParseAnyInput,
  type UniversalParseResult,
} from './types';

/**
 * MusicXML / MXL / ABC 适配器 —— 基于 @webmusic/score 的 `loadScore`。
 *
 * @webmusic/score 把三种记谱统一成它的 Score 模型（正好 ABC 也在支持列表里，
 * 所以第三批 ABC 适配器只是同一管道换了个入口）：
 *
 * - `score.parts[].notes[]`：`onset`（480 PPQ 的 tick，1 四分音符 = 480）、
 *   `duration.quarters`（以四分音符为单位的时值，附点/三连音已折算）、
 *   `pitch.midi`、`velocity`（0–127）、`rest`（休止符，直接跳过）；
 * - `score._tempos[0].bpm`：起始速度（谱面没标时模型默认 120）。
 *   Transport 是单一 BPM 时间轴，多段变速按起始速度处理（warnings 注明）。
 */
const TICKS_PER_QUARTER = 480;

async function parseWebmusicScore(
  input: ParseAnyInput,
  format: 'musicxml' | 'mxl' | 'abc',
): Promise<UniversalParseResult> {
  const warnings: string[] = [];
  // 字符串 / 字节都交给 loadScore：它自己嗅探编码（PK 开头是 mxl 压缩包，< 开头是 MusicXML）
  const source: ArrayBuffer | Uint8Array | string =
    input.bytes ?? input.text ?? (() => { throw new TypeError(`${format} 解析需要 text 或 bytes 输入`); })();
  const score = await loadScore(source, { format });

  const tempos = (score as unknown as { _tempos?: Array<{ tick: number; bpm: number }> })._tempos;
  const bpm = tempos?.[0]?.bpm ?? 120;
  if ((tempos?.length ?? 0) > 1) {
    warnings.push(`谱面含 ${tempos!.length} 处速度变化，按起始速度（${Math.round(bpm)} BPM）统一换算拍位`);
  }

  const candidates: Array<Omit<NoteEvent, 'id'>> = [];
  for (const part of score.parts) {
    for (const note of part.notes) {
      if (note.rest) continue;
      const pitch = note.pitch?.midi;
      if (pitch === undefined) continue;
      candidates.push({
        pitch,
        startBeat: note.onset / TICKS_PER_QUARTER,
        // duration.quarters 是 Rational（附点 / 三连音已折算成四分音符数）
        durationBeats: Math.max(note.duration.quarters.toFloat(), 0.01),
        velocity: note.velocity ?? 80,
      });
    }
  }
  const notes = sortNotes(dropOutOfRangeNotes(candidates, warnings, 'w'));
  if (notes.length === 0) {
    throw new Error('谱面里没有可演奏的音符（可能全是休止符或音高超出音域）');
  }
  const title = (score.metadata as { title?: string } | undefined)?.title ?? null;
  return { format, title, bpm, notes, warnings };
}

export const musicXmlAdapter: FormatAdapter = {
  id: 'musicxml',
  extensions: ['.musicxml', '.xml'],
  parse: (input) => parseWebmusicScore(input, 'musicxml'),
};

/** MXL：MusicXML 的 zip 压缩包，同一个解析管道，loadScore 按魔数自动解包 */
export const mxlAdapter: FormatAdapter = {
  id: 'mxl',
  extensions: ['.mxl'],
  parse: (input) => parseWebmusicScore(input, 'mxl'),
};

/** ABC 记谱法（第三批，可选）：@webmusic/score 原生支持，同一管道直通 */
export const abcAdapter: FormatAdapter = {
  id: 'abc',
  extensions: ['.abc'],
  parse: (input) => parseWebmusicScore(input, 'abc'),
};
