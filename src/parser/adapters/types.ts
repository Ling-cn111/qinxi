import type { NoteEvent } from '@/types';

/**
 * 多格式谱面解析的统一接口（P5）。
 *
 * 所有适配器最终都产出同一个 `UniversalParseResult`：拍位以四分音符为 1 拍、
 * 音高为 MIDI 编号 —— 与字符谱解析器完全一致，这样 Transport / 判定引擎 /
 * 下落画布 / 谱面视图对「谱面从哪来」一无所知。
 */

/** 解析器支持的源格式（mxl 是 musicxml 的压缩包，单独列出便于按扩展名路由） */
export type SourceFormat = 'text' | 'midi' | 'musicxml' | 'mxl' | 'abc';

/** parseAny 的输入：二进制（MIDI / MXL）或文本（字符谱 / MusicXML / ABC） */
export interface ParseAnyInput {
  /** 文本内容：字符谱 / MusicXML / ABC */
  text?: string;
  /** 二进制内容：MIDI / MXL（MusicXML 也可以传字节，按 UTF-8 解码） */
  bytes?: ArrayBuffer | Uint8Array;
  /** 原始文件名：auto 模式下按扩展名路由 */
  fileName?: string;
  /** 字符谱专用：字符 → 音高映射表（应传默认布局的表） */
  keyMap?: import('@/keyboard/keyMap').PianoKeyMap;
}

/** 统一解析结果 */
export interface UniversalParseResult {
  /** 实际使用的格式 */
  format: SourceFormat;
  /** 曲名（MIDI 取轨道名 / MusicXML 取 work-title，拿不到为 null） */
  title: string | null;
  /** 演奏速度（BPM，四分音符）。Transport 装谱用 */
  bpm: number;
  /** 按 startBeat 升序的音符事件 */
  notes: NoteEvent[];
  /** 非致命提示（丢弃的音、速度变化被忽略等） */
  warnings: string[];
}

/** 单个格式适配器：把一种源格式变成 UniversalParseResult */
export interface FormatAdapter {
  id: SourceFormat;
  /** parseAny 的 auto 路由用：该格式认识的扩展名（小写、含点） */
  extensions: readonly string[];
  parse(input: ParseAnyInput): Promise<UniversalParseResult>;
}

/** 把超出版面音域的音符过滤掉并记一条警告（引擎只认 21–108） */
export function dropOutOfRangeNotes(
  candidates: Array<Omit<NoteEvent, 'id'>>,
  warnings: string[],
  label: string,
): NoteEvent[] {
  const notes: NoteEvent[] = [];
  let dropped = 0;
  for (const candidate of candidates) {
    if (candidate.pitch < 21 || candidate.pitch > 108) {
      dropped += 1;
      continue;
    }
    notes.push({ ...candidate, id: `${label}${notes.length + 1}` });
  }
  if (dropped > 0) {
    warnings.push(`${dropped} 个音超出钢琴音域（A0–C8），已丢弃`);
  }
  return notes;
}

/** 按 startBeat 稳定排序（同拍按音高，和 Transport.load 的约定一致） */
export function sortNotes(notes: NoteEvent[]): NoteEvent[] {
  return notes.sort((a, b) => a.startBeat - b.startBeat || a.pitch - b.pitch);
}
