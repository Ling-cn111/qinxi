/**
 * 音色目录。
 *
 * 「声音」面板只为多音色预留位置：当前只有 AutoPiano 的高音立式钢琴采样真正接入，
 * 其余条目按 GM（General MIDI）音色表排布，`available: false` 的卡片只做占位，
 * 接入新采样时把对应条目的 `available` 打开即可，不需要改面板结构。
 */
export interface Instrument {
  id: string;
  /** 中文名 */
  name: string;
  /** 英文名（与 AutoPiano / GM 的叫法一致） */
  latin: string;
  /** GM 音色编号（1 起）；AutoPiano 自有采样没有编号 */
  program?: number;
  /** 采样是否已接入 */
  available: boolean;
  /** 卡片右上角的来源角标 */
  badge?: 'MP3' | 'SYNTH';
}

export const INSTRUMENTS: readonly Instrument[] = [
  { id: 'treble-upright', name: '高音立式钢琴', latin: 'treble upright piano', available: true, badge: 'MP3' },
  { id: 'acoustic-piano', name: '原声钢琴', latin: 'acoustic piano', available: false, badge: 'MP3' },
  { id: 'grand-piano', name: '大钢琴', latin: 'acoustic grand piano', program: 1, available: false },
  { id: 'bright-piano', name: '亮音大钢琴', latin: 'bright acoustic piano', program: 2, available: false },
  { id: 'electric-grand', name: '电钢琴', latin: 'electric grand piano', program: 3, available: false },
  { id: 'honky-tonk', name: '酒吧钢琴', latin: 'honky-tonk piano', program: 4, available: false },
  { id: 'epiano-1', name: '电钢琴 1', latin: 'electric piano 1', program: 5, available: false },
  { id: 'epiano-2', name: '电钢琴 2', latin: 'electric piano 2', program: 6, available: false },
  { id: 'celesta', name: '钢片琴', latin: 'celesta', program: 8, available: false },
  { id: 'glockenspiel', name: '钟琴', latin: 'glockenspiel', program: 9, available: false },
  { id: 'music-box', name: '八音盒', latin: 'music box', program: 10, available: false },
  { id: 'vibraphone', name: '颤音琴', latin: 'vibraphone', program: 11, available: false },
  { id: 'xylophone', name: '木琴', latin: 'xylophone', program: 13, available: false },
  { id: 'dulcimer', name: '扬琴', latin: 'dulcimer', program: 15, available: false },
  { id: 'harmonica', name: '口琴', latin: 'harmonica', program: 22, available: false },
  { id: 'guitar-nylon', name: '尼龙弦吉他', latin: 'acoustic guitar (nylon)', program: 24, available: false },
  { id: 'guitar-steel', name: '钢弦吉他', latin: 'acoustic guitar (steel)', program: 25, available: false },
  { id: 'guitar-jazz', name: '爵士乐电吉他', latin: 'electric guitar (jazz)', program: 26, available: false },
  { id: 'guitar-clean', name: '清音电吉他', latin: 'electric guitar (clean)', program: 27, available: false },
  { id: 'acoustic-bass', name: '原声贝斯', latin: 'acoustic bass', program: 32, available: false },
  { id: 'violin', name: '小提琴', latin: 'violin', program: 40, available: false },
  { id: 'harp', name: '竖琴', latin: 'orchestral harp', program: 46, available: false },
  { id: 'soprano-sax', name: '高音萨克斯', latin: 'soprano sax', program: 64, available: false },
  { id: 'piccolo', name: '短笛', latin: 'piccolo', program: 72, available: false },
  { id: 'koto', name: '筝、古筝', latin: 'koto', program: 107, available: false },
  { id: 'shanai', name: '唢呐', latin: 'shanai', program: 111, available: false },
  { id: 'tinkle-bell', name: '铃铛', latin: 'tinkle bell', program: 112, available: false },
  { id: 'synth-drum', name: '合成鼓', latin: 'synth drum', program: 118, available: false },
  { id: 'bird-tweet', name: '鸟鸣声', latin: 'bird tweet', program: 123, available: false },
];

export const DEFAULT_INSTRUMENT_ID = 'treble-upright';

export function findInstrument(id: string): Instrument | undefined {
  return INSTRUMENTS.find((item) => item.id === id);
}
