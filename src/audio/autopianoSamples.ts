/**
 * AutoPiano（Wscats/piano）原版单音采样表。
 *
 * 数据取自其 `src/elements/app-piano/notes.js`：文件名里的数字是原仓库自定编号
 * （A2 → a54.mp3、G#4 → b79.mp3），与音高没有可推导关系，只能原样搬。
 * 覆盖 C2–C7，共 61 个半音。原表漏了 A#2，其 b54.mp3 实际存在于目录中
 * （同组 b49=C#2、b50=D#2、b52=F#2、b53=G#2 → b54=A#2），此处按同组编号规律补回。
 */
export type AutoPianoSample = readonly [note: string, file: string];

/** 采样目录（相对 public/） */
export const AUTOPIANO_SAMPLE_DIR = 'samples/piano';

export const AUTOPIANO_SAMPLES: ReadonlyArray<AutoPianoSample> = [
  ['C2', 'a49.mp3'],
  ['C#2', 'b49.mp3'],
  ['D2', 'a50.mp3'],
  ['D#2', 'b50.mp3'],
  ['E2', 'a51.mp3'],
  ['F2', 'a52.mp3'],
  ['F#2', 'b52.mp3'],
  ['G2', 'a53.mp3'],
  ['G#2', 'b53.mp3'],
  ['A2', 'a54.mp3'],
  // 原表遗漏，按同组编号规律补回（b54 未被 notes.js 引用）
  ['A#2', 'b54.mp3'],
  ['B2', 'a55.mp3'],
  ['C3', 'a56.mp3'],
  ['C#3', 'b56.mp3'],
  ['D3', 'a57.mp3'],
  ['D#3', 'b57.mp3'],
  ['E3', 'a48.mp3'],
  ['F3', 'a81.mp3'],
  ['F#3', 'b81.mp3'],
  ['G3', 'a87.mp3'],
  ['G#3', 'b87.mp3'],
  ['A3', 'a69.mp3'],
  ['A#3', 'b69.mp3'],
  ['B3', 'a82.mp3'],
  ['C4', 'a84.mp3'],
  ['C#4', 'b84.mp3'],
  ['D4', 'a89.mp3'],
  ['D#4', 'b89.mp3'],
  ['E4', 'a85.mp3'],
  ['F4', 'a73.mp3'],
  ['F#4', 'b73.mp3'],
  ['G4', 'a79.mp3'],
  ['G#4', 'b79.mp3'],
  ['A4', 'a80.mp3'],
  ['A#4', 'b80.mp3'],
  ['B4', 'a65.mp3'],
  ['C5', 'a83.mp3'],
  ['C#5', 'b83.mp3'],
  ['D5', 'a68.mp3'],
  ['D#5', 'b68.mp3'],
  ['E5', 'a70.mp3'],
  ['F5', 'a71.mp3'],
  ['F#5', 'b71.mp3'],
  ['G5', 'a72.mp3'],
  ['G#5', 'b72.mp3'],
  ['A5', 'a74.mp3'],
  ['A#5', 'b74.mp3'],
  ['B5', 'a75.mp3'],
  ['C6', 'a76.mp3'],
  ['C#6', 'b76.mp3'],
  ['D6', 'a90.mp3'],
  ['D#6', 'b90.mp3'],
  ['E6', 'a88.mp3'],
  ['F6', 'a67.mp3'],
  ['F#6', 'b67.mp3'],
  ['G6', 'a86.mp3'],
  ['G#6', 'b86.mp3'],
  ['A6', 'a66.mp3'],
  ['A#6', 'b66.mp3'],
  ['B6', 'a78.mp3'],
  ['C7', 'a77.mp3'],
];
