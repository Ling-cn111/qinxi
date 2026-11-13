import { hasBlackAbove, hasBlackBelow, MAX_MIDI, MIN_MIDI, midiToName, WHITE_PITCH_CLASSES } from '@/audio/note';
import type { KeyBinding, KeyModifier } from '@/types';

/** 「宽音域」方案的基准起点：C2 */
export const BASE_START_MIDI = 36;

/** 「钢琴式」方案的基准起点：C3 */
export const PIANO_START_MIDI = 48;

/**
 * 四排字母 / 数字键（由低到高），供「宽音域」方案使用。
 * 每项为 [KeyboardEvent.code, 键帽字符]。
 * 用 code 而非 key，避免 Shift 改变字符（'z' → 'Z'）导致匹配失败。
 */
const WHITE_ROWS: ReadonlyArray<ReadonlyArray<readonly [string, string]>> = [
  // 下排 —— 最低
  [
    ['KeyZ', 'z'],
    ['KeyX', 'x'],
    ['KeyC', 'c'],
    ['KeyV', 'v'],
    ['KeyB', 'b'],
    ['KeyN', 'n'],
    ['KeyM', 'm'],
    ['Comma', ','],
    ['Period', '.'],
    ['Slash', '/'],
  ],
  // 中排
  [
    ['KeyA', 'a'],
    ['KeyS', 's'],
    ['KeyD', 'd'],
    ['KeyF', 'f'],
    ['KeyG', 'g'],
    ['KeyH', 'h'],
    ['KeyJ', 'j'],
    ['KeyK', 'k'],
    ['KeyL', 'l'],
    ['Semicolon', ';'],
    ['Quote', "'"],
  ],
  // 上排
  [
    ['KeyQ', 'q'],
    ['KeyW', 'w'],
    ['KeyE', 'e'],
    ['KeyR', 'r'],
    ['KeyT', 't'],
    ['KeyY', 'y'],
    ['KeyU', 'u'],
    ['KeyI', 'i'],
    ['KeyO', 'o'],
    ['KeyP', 'p'],
    ['BracketLeft', '['],
    ['BracketRight', ']'],
  ],
  // 数字排 —— 最高
  [
    ['Digit1', '1'],
    ['Digit2', '2'],
    ['Digit3', '3'],
    ['Digit4', '4'],
    ['Digit5', '5'],
    ['Digit6', '6'],
    ['Digit7', '7'],
    ['Digit8', '8'],
    ['Digit9', '9'],
    ['Digit0', '0'],
  ],
];

/**
 * 「钢琴式」方案：两排键 = 一个八度。
 *
 * 下排字母是白键，上排字母正好落在下排的键缝上方 —— 空间关系和真实钢琴一致
 * （S 在 Z/X 缝隙、D 在 X/C 缝隙……），因此黑键不需要任何修饰键。
 * 每项：[KeyboardEvent.code, 键帽字符, 相对根音的半音偏移]。
 */
interface OctaveKeys {
  base: number;
  whites: ReadonlyArray<readonly [string, string]>;
  blacks: ReadonlyArray<readonly [string, string, number]>;
}

const WHITE_STEPS = [0, 2, 4, 5, 7, 9, 11] as const;

const PIANO_OCTAVES: readonly OctaveKeys[] = [
  {
    base: PIANO_START_MIDI,
    whites: [
      ['KeyZ', 'z'],
      ['KeyX', 'x'],
      ['KeyC', 'c'],
      ['KeyV', 'v'],
      ['KeyB', 'b'],
      ['KeyN', 'n'],
      ['KeyM', 'm'],
    ],
    blacks: [
      ['KeyS', 's', 1],
      ['KeyD', 'd', 3],
      ['KeyG', 'g', 6],
      ['KeyH', 'h', 8],
      ['KeyJ', 'j', 10],
    ],
  },
  {
    base: PIANO_START_MIDI + 12,
    whites: [
      ['KeyQ', 'q'],
      ['KeyW', 'w'],
      ['KeyE', 'e'],
      ['KeyR', 'r'],
      ['KeyT', 't'],
      ['KeyY', 'y'],
      ['KeyU', 'u'],
    ],
    blacks: [
      ['Digit2', '2', 1],
      ['Digit3', '3', 3],
      ['Digit5', '5', 6],
      ['Digit6', '6', 8],
      ['Digit7', '7', 10],
    ],
  },
];

export type KeymapPresetId = 'piano' | 'wide';

export interface KeymapPreset {
  id: KeymapPresetId;
  /** 全名，用在方案说明里 */
  name: string;
  /** 页签按钮上的短名 */
  short: string;
  /** 音域文案 */
  range: string;
  /** 一句话说明 */
  desc: string;
}

export const KEYMAP_PRESETS: readonly KeymapPreset[] = [
  {
    id: 'piano',
    name: '钢琴式：两排键一个八度',
    short: '钢琴式',
    range: 'C3–B4',
    desc: '白键排在字母排、黑键落在上一排的键缝里，位置关系和琴键一致；不用修饰键，白键黑键能同时按。',
  },
  {
    id: 'wide',
    name: '宽音域：四排铺满 + Shift 黑键',
    short: '宽音域',
    range: 'C2–C8',
    desc: '四排字母与数字键从低到高铺满 C2–C8；Shift 取左侧黑键、Alt 取右侧黑键。音域最大，但黑键要按住修饰键。',
  },
];

export const DEFAULT_KEYMAP_PRESET: KeymapPresetId = 'piano';

export function isKeymapPresetId(value: unknown): value is KeymapPresetId {
  return value === 'piano' || value === 'wide';
}

/** 物理键 → 键帽字符。自定义绑定后，键帽上仍要显示这颗物理键的名字 */
const CHAR_BY_CODE = new Map<string, string>(
  WHITE_ROWS.flatMap((row) => row.map(([code, char]) => [code, char] as const)),
);

/** 小键盘：字符 + 是否需要在标签上区分出「这是小键盘」 */
const NUMPAD_CHARS: Record<string, string> = {
  Numpad0: '0',
  Numpad1: '1',
  Numpad2: '2',
  Numpad3: '3',
  Numpad4: '4',
  Numpad5: '5',
  Numpad6: '6',
  Numpad7: '7',
  Numpad8: '8',
  Numpad9: '9',
  NumpadDecimal: '.',
  NumpadAdd: '+',
  NumpadSubtract: '−',
  NumpadMultiply: '×',
  NumpadDivide: '÷',
  NumpadEnter: '⏎',
};

const PUNCT_CHARS: Record<string, string> = {
  Minus: '-',
  Equal: '=',
  Backquote: '`',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Space: 'space',
  Enter: 'enter',
};

/** 修饰键与系统键不参与演奏，也不能被绑定 */
const RESERVED_CODES = new Set([
  'ShiftLeft',
  'ShiftRight',
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'MetaLeft',
  'MetaRight',
  'CapsLock',
  'NumLock',
  'Escape',
  'Tab',
  'ContextMenu',
]);

/** 一条用户自定义绑定：物理键（含修饰键）→ 音高 */
export interface CustomBinding {
  code: string;
  modifier: KeyModifier;
  pitch: number;
}

export function isBindableCode(code: string): boolean {
  return !RESERVED_CODES.has(code);
}

export function isNumpadCode(code: string): boolean {
  return code in NUMPAD_CHARS;
}

/** 物理键的键帽字符；未知键回落到 code 本身的小写形式 */
export function charForCode(code: string): string {
  const numpad = NUMPAD_CHARS[code];
  if (numpad) return numpad;
  const known = CHAR_BY_CODE.get(code);
  if (known) return known;
  if (code.startsWith('Key')) return code.slice(3).toLowerCase();
  if (code.startsWith('Digit')) return code.slice(5);
  return PUNCT_CHARS[code] ?? code.toLowerCase();
}

/** 从 startMidi（必须落在白键上）起，取 count 个连续白键的音高 */
export function whitePitchSequence(startMidi: number, count: number): number[] {
  const whites: number[] = [];
  let pitch = startMidi;
  while (whites.length < count && pitch <= MAX_MIDI) {
    if ((WHITE_PITCH_CLASSES as readonly number[]).includes(pitch % 12)) whites.push(pitch);
    pitch += 1;
  }
  return whites;
}

/** 键帽上的展示标签：小键盘加 `N` 前缀，免得和主键区的数字混淆 */
function displayLabel(char: string, modifier: KeyModifier, code: string): string {
  const base = isNumpadCode(code)
    ? `N${char}`
    : code === 'Space'
      ? '␣'
      : char.length === 1 && /[a-z]/.test(char)
        ? char.toUpperCase()
        : char;
  if (modifier === 'shift') return `⇧${base}`;
  if (modifier === 'alt') return `⌥${base}`;
  return base;
}

/** 从键盘事件推导修饰键状态（Ctrl / Meta 组合不参与演奏） */
export function modifierFromEvent(event: {
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}): KeyModifier | null {
  if (event.ctrlKey || event.metaKey) return null;
  if (event.shiftKey) return 'shift';
  if (event.altKey) return 'alt';
  return 'none';
}

function binding(code: string, modifier: KeyModifier, pitch: number): KeyBinding {
  const char = charForCode(code);
  return { code, modifier, pitch, char, label: displayLabel(char, modifier, code) };
}

/** 宽音域：四排白键由低到高铺开，Shift 取左侧黑键、Alt 取右侧黑键 */
function buildWideBindings(startMidi: number): KeyBinding[] {
  const totalKeys = WHITE_ROWS.reduce((sum, row) => sum + row.length, 0);
  const pitches = whitePitchSequence(startMidi, totalKeys);
  const bindings: KeyBinding[] = [];

  let index = 0;
  for (const row of WHITE_ROWS) {
    for (const [code, char] of row) {
      const pitch = pitches[index];
      index += 1;
      if (pitch === undefined || pitch > MAX_MIDI) continue;

      bindings.push({ code, modifier: 'none', pitch, char, label: displayLabel(char, 'none', code) });

      if (hasBlackAbove(pitch) && pitch + 1 <= MAX_MIDI) {
        bindings.push({
          code,
          modifier: 'shift',
          pitch: pitch + 1,
          char,
          label: displayLabel(char, 'shift', code),
        });
      }
      if (hasBlackBelow(pitch) && pitch - 1 >= MIN_MIDI) {
        bindings.push({
          code,
          modifier: 'alt',
          pitch: pitch - 1,
          char,
          label: displayLabel(char, 'alt', code),
        });
      }
    }
  }
  return bindings;
}

/** 钢琴式：两排一组，白键在下排、黑键在上排键缝，全部无修饰键 */
function buildPianoBindings(): KeyBinding[] {
  const bindings: KeyBinding[] = [];
  for (const octave of PIANO_OCTAVES) {
    octave.whites.forEach(([code, char], index) => {
      const pitch = octave.base + WHITE_STEPS[index];
      bindings.push({ code, modifier: 'none', pitch, char, label: displayLabel(char, 'none', code) });
    });
    for (const [code, char, step] of octave.blacks) {
      const pitch = octave.base + step;
      bindings.push({ code, modifier: 'none', pitch, char, label: displayLabel(char, 'none', code) });
    }
  }
  return bindings;
}

/**
 * 解析一次按键：先按修饰键精确匹配；
 * 匹配不到时回落到无修饰版本 —— 钢琴式方案里根本没有 Shift 绑定，
 * 用户误按着 Shift 时不该直接没声音。
 */
export function resolveBinding(
  map: PianoKeyMap,
  code: string,
  modifier: KeyModifier,
): KeyBinding | undefined {
  const exact = map.lookup(code, modifier);
  if (exact) return exact;
  return modifier === 'none' ? undefined : map.lookup(code, 'none');
}

export interface KeyMapOptions {
  preset?: KeymapPresetId;
  /** 仅「宽音域」方案使用，默认 C2 */
  startMidi?: number;
  custom?: readonly CustomBinding[];
}

/**
 * 键盘映射表。
 *
 * 两套预设 + 用户自定义：
 * - `piano`：两排一个八度，白键在下排、黑键在上排键缝（默认，没有修饰键）；
 * - `wide`：四排铺满 C2–C8，Shift / Alt 取黑键（音域最大）。
 *
 * 自定义绑定叠加在预设之上 —— 同一个物理键（含修饰键）只保留一条，
 * 同一个音高也只保留一条，避免「按一个键出两个音」的歧义。
 */
export class PianoKeyMap {
  readonly bindings: KeyBinding[] = [];

  private readonly byCode = new Map<string, KeyBinding>();
  private readonly byPitch = new Map<number, KeyBinding[]>();
  private readonly byChar = new Map<string, KeyBinding>();
  private readonly preset: KeymapPresetId;
  private readonly startMidi: number;
  private readonly custom = new Map<string, number>();

  constructor(options: KeyMapOptions = {}) {
    this.preset = options.preset ?? DEFAULT_KEYMAP_PRESET;
    this.startMidi = options.startMidi ?? (this.preset === 'wide' ? BASE_START_MIDI : PIANO_START_MIDI);

    for (const item of options.custom ?? []) {
      if (!isBindableCode(item.code)) continue;
      if (!Number.isInteger(item.pitch) || item.pitch < MIN_MIDI || item.pitch > MAX_MIDI) continue;
      this.custom.set(`${item.modifier}:${item.code}`, item.pitch);
    }
    this.rebuild();
  }

  get presetId(): KeymapPresetId {
    return this.preset;
  }

  get baseStartMidi(): number {
    return this.startMidi;
  }

  /** 已自定义的条目数 */
  get customCount(): number {
    return this.custom.size;
  }

  /** 被自定义覆盖的音高，用于界面上做标记 */
  get customPitches(): ReadonlySet<number> {
    return new Set(this.custom.values());
  }

  /** 所有可演奏音高 */
  get pitches(): number[] {
    return [...this.byPitch.keys()].sort((a, b) => a - b);
  }

  lookup(code: string, modifier: KeyModifier): KeyBinding | undefined {
    return this.byCode.get(`${modifier}:${code}`);
  }

  bindingsForPitch(pitch: number): readonly KeyBinding[] {
    return this.byPitch.get(pitch) ?? [];
  }

  /** 琴键上展示的按键标签（优先白键，其次 Shift 组合） */
  labelFor(pitch: number): string | undefined {
    return this.preferredBinding(pitch)?.label;
  }

  /** 琴键字符，黑键用于分行展示 */
  charFor(pitch: number): string | undefined {
    const binding = this.preferredBinding(pitch);
    if (!binding) return undefined;
    return binding.char.length === 1 ? binding.char.toUpperCase() : binding.char;
  }

  /** 该音高对应绑定使用的修饰键 */
  modifierFor(pitch: number): KeyModifier | undefined {
    return this.preferredBinding(pitch)?.modifier;
  }

  /** 谱面字符 → 绑定，供后续键盘谱解析使用 */
  findByChar(char: string, modifier: KeyModifier = 'none'): KeyBinding | undefined {
    return this.byChar.get(`${modifier}:${char.toLowerCase()}`);
  }

  noteNameFor(pitch: number): string {
    return midiToName(pitch);
  }

  private preferredBinding(pitch: number): KeyBinding | undefined {
    const list = this.byPitch.get(pitch);
    if (!list || list.length === 0) return undefined;
    return (
      list.find((b) => b.modifier === 'none') ?? list.find((b) => b.modifier === 'shift') ?? list[0]
    );
  }

  private rebuild(): void {
    this.bindings.length = 0;
    this.byCode.clear();
    this.byPitch.clear();
    this.byChar.clear();

    const blockedKeys = new Set(this.custom.keys());
    // 白键被改到别的音上时，这颗键原来的 Shift / Alt 变体也一并作废，
    // 否则「Q 变成 C4，但 ⇧Q 还留在 C#5」会让人莫名其妙
    const blockedCodes = new Set(
      [...this.custom.keys()]
        .filter((key) => key.startsWith('none:'))
        .map((key) => key.slice('none:'.length)),
    );
    const takenPitches = new Set(this.custom.values());

    const base =
      this.preset === 'wide' ? buildWideBindings(this.startMidi) : buildPianoBindings();

    for (const item of base) {
      // 该物理键已被自定义占用，或该音高已被自定义绑定 → 预设绑定让位
      if (blockedKeys.has(`${item.modifier}:${item.code}`)) continue;
      if (blockedCodes.has(item.code)) continue;
      if (takenPitches.has(item.pitch)) continue;
      this.register(item);
    }

    for (const [key, pitch] of this.custom) {
      const separator = key.indexOf(':');
      const modifier = key.slice(0, separator) as KeyModifier;
      const code = key.slice(separator + 1);
      this.register(binding(code, modifier, pitch));
    }
  }

  private register(item: KeyBinding): void {
    const codeKey = `${item.modifier}:${item.code}`;
    if (this.byCode.has(codeKey)) return;
    this.byCode.set(codeKey, item);

    const charKey = `${item.modifier}:${item.char}`;
    if (!this.byChar.has(charKey)) this.byChar.set(charKey, item);

    const list = this.byPitch.get(item.pitch);
    if (list) list.push(item);
    else this.byPitch.set(item.pitch, [item]);

    this.bindings.push(item);
  }
}
