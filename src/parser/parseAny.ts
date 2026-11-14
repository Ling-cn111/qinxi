import { textAdapter } from './adapters/textAdapter';
import { midiAdapter } from './adapters/midiAdapter';
import { abcAdapter, mxlAdapter, musicXmlAdapter } from './adapters/musicXmlAdapter';
import type {
  FormatAdapter,
  ParseAnyInput,
  SourceFormat,
  UniversalParseResult,
} from './adapters/types';

export type { ParseAnyInput, SourceFormat, UniversalParseResult } from './adapters/types';

/**
 * 多格式谱面解析的统一入口（P5）。
 *
 * 字符谱、MIDI、MusicXML（含压缩包 MXL）、ABC 全部从这里进，产出同一套
 * `UniversalParseResult`（四分音符拍位 + MIDI 音高）—— 上层的 Transport、
 * 判定引擎、下落画布、谱面视图不需要知道谱面从哪来。
 *
 * ## 格式路由
 *
 * - `format` 显式指定 → 直达对应适配器；
 * - `format` 省略（auto）→ 先看 `fileName` 的扩展名，没有文件名就嗅探内容：
 *   二进制 `MThd` 魔数 = MIDI、`PK` = MXL 压缩包；文本 `<` 开头 = MusicXML，
 *   否则按本应用原生的字符谱解析（ABC 需要显式指定或用 .abc 扩展名 ——
 *   简写字符谱和 ABC 都是纯文本，无法可靠区分）。
 */
const ADAPTERS: readonly FormatAdapter[] = [
  midiAdapter,
  musicXmlAdapter,
  mxlAdapter,
  abcAdapter,
  textAdapter,
];

function extensionOf(fileName: string | undefined): string | undefined {
  if (!fileName) return undefined;
  const dot = fileName.lastIndexOf('.');
  return dot < 0 ? undefined : fileName.slice(dot).toLowerCase();
}

function sniffFormat(input: ParseAnyInput): SourceFormat {
  const bytes = input.bytes;
  if (bytes instanceof ArrayBuffer || bytes instanceof Uint8Array) {
    const head = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (head.length >= 4 && head[0] === 0x4d && head[1] === 0x54 && head[2] === 0x68 && head[3] === 0x64) {
      return 'midi'; // "MThd"
    }
    if (head.length >= 2 && head[0] === 0x50 && head[1] === 0x4b) return 'mxl'; // "PK"
  }
  if (input.text !== undefined && input.text.trimStart().startsWith('<')) return 'musicxml';
  return 'text';
}

function adapterFor(format: SourceFormat): FormatAdapter {
  const adapter = ADAPTERS.find((item) => item.id === format);
  if (!adapter) throw new Error(`不支持的谱面格式：${format}`);
  return adapter;
}

export async function parseAny(
  input: ParseAnyInput,
  format: SourceFormat | 'auto' = 'auto',
): Promise<UniversalParseResult> {
  let resolved: SourceFormat;
  if (format !== 'auto') {
    resolved = format;
  } else {
    const ext = extensionOf(input.fileName);
    if (ext) {
      // 有扩展名却不是任何适配器认识的：明确报错，不静默猜格式
      // （用户拿 .pdf / .png 来导入应该被告知不支持，而不是被喂一串乱码音符）
      const byExt = ADAPTERS.find((adapter) => adapter.extensions.includes(ext));
      if (!byExt) throw new Error(`不支持的谱面格式：${ext}（支持 .mid / .musicxml / .xml / .mxl / .abc / .txt）`);
      resolved = byExt.id;
    } else {
      resolved = sniffFormat(input);
    }
  }
  return adapterFor(resolved).parse(input);
}
