import { MAX_MIDI, MIN_MIDI, midiToName, WHITE_PITCH_CLASSES } from '@/audio/note';
import type { KeyBinding, KeyModifier } from '@/types';

/** 默认布局的起点：C2 */
export const BASE_START_MIDI = 36;

interface LayoutRow {
  /** 段名，用于界面说明 */
  label: string;
  /** [KeyboardEvent.code, 音高]，按从左到右的顺序；未列出的键不绑音 */
  keys: ReadonlyArray<readonly [code: string, pitch: number]>;
}

/**
 * 默认布局：照给定的键位表原样排，只有白键（C 大调），黑键留空。
 *
 * 音域正好覆盖 C2–C7 的 36 个白键，但在键面上是「折行」铺开的：
 * 下排 C2–B2 → 上排 Q–T 是 C3–G3 → 中排接着 A3–B4 → 上排 Y–] 是 C5–B5 →
 * 数字排 5–= 是 C6–C7。所以相邻两排的音高是交错的（按 D 比按 T 高），
 * 这是这套键位表本身的排法，不是 bug。
 *
 * 黑键（C♯ D♯ F♯ G♯ A♯）一个都不绑：`S`、`2`、`3` 原来标着 C♯3 / C♯4 / D♯4，
 * 按需求删掉了，这些键现在是空闲的。
 */
const LAYOUT_ROWS: readonly LayoutRow[] = [
  {
    label: '下排',
    keys: [
      ['KeyZ', 36], // C2
      ['KeyX', 38],
      ['KeyC', 40],
      ['KeyV', 41],
      ['KeyB', 43],
      ['KeyN', 45],
      ['KeyM', 47], // B2
    ],
  },
  {
    label: '中排',
    keys: [
      ['KeyD', 57], // A3
      ['KeyF', 59],
      ['KeyG', 60], // C4
      ['KeyH', 62],
      ['KeyJ', 64],
      ['KeyK', 65],
      ['KeyL', 67],
      ['Semicolon', 69],
      ['Quote', 71], // B4
    ],
  },
  {
    label: '上排',
    keys: [
      ['KeyQ', 48], // C3
      ['KeyW', 50],
      ['KeyE', 52],
      ['KeyR', 53],
      ['KeyT', 55], // G3
      ['KeyY', 72], // C5
      ['KeyU', 74],
      ['KeyI', 76],
      ['KeyO', 77],
      ['KeyP', 79],
      ['BracketLeft', 81],
      ['BracketRight', 83], // B5
    ],
  },
  {
    label: '数字排',
    keys: [
      ['Digit5', 84], // C6
      ['Digit6', 86],
      ['Digit7', 88],
      ['Digit8', 89],
      ['Digit9', 91],
      ['Digit0', 93],
      ['Minus', 95],
      ['Equal', 96], // C7
    ],
  },
  {
    label: '小键盘',
    keys: [],
  },
];

/** 界面上展示的布局摘要：每排的「键 + 音」对照 */
export interface LayoutRowInfo {
  label: string;
  /** 键与音成对，如 `Z C2 · X D2` */
  keys: string;
  /** 这一排的音域跨度，如 `C2–B2`；空排为 `—` */
  range: string;
}

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

/**
 * 一条用户改动：`code` 为字符串时是「绑定」，为 `null` 时是「空置」——
 * 这个音不绑任何键（哪怕默认布局里有）。空置也属于需要持久化的改动，
 * 否则「把这个音留空」一刷新就失效。
 */
export interface CustomBinding {
  code: string | null;
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

/** 界面上展示的布局摘要：每排「键 + 音」逐颗列出 */
export const KEYMAP_ROWS: readonly LayoutRowInfo[] = LAYOUT_ROWS.map((row) => {
  if (row.keys.length === 0) {
    return { label: row.label, keys: '空闲（可自定义）', range: '—' };
  }
  const pitches = row.keys.map(([, pitch]) => pitch);
  return {
    label: row.label,
    keys: row.keys
      .map(([code, pitch]) => `${displayLabel(charForCode(code), 'none', code)} ${midiToName(pitch)}`)
      .join(' · '),
    range: `${midiToName(Math.min(...pitches))}–${midiToName(Math.max(...pitches))}`,
  };
});

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

/** 默认布局：按 LAYOUT_ROWS 逐颗绑定；startMidi 可整体平移八度 */
function buildDefaultBindings(startMidi: number): KeyBinding[] {
  const shift = startMidi - BASE_START_MIDI;
  const bindings: KeyBinding[] = [];
  for (const row of LAYOUT_ROWS) {
    for (const [code, base] of row.keys) {
      const pitch = base + shift;
      if (pitch < MIN_MIDI || pitch > MAX_MIDI) continue;
      bindings.push(binding(code, 'none', pitch));
    }
  }
  return bindings;
}

/**
 * 解析一次按键：先按修饰键精确匹配；
 * 匹配不到时回落到无修饰版本 —— 默认布局里没有 Shift 绑定，
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
  /** 起点，默认 C2（36）；改它等于整体平移八度 */
  startMidi?: number;
  /**
   * 用户改动（绑定 + 空置），叠加在默认布局之上。
   *
   * 音高按**默认布局的坐标**记录（即 C2 起的那一套），渲染时会跟着 `startMidi` 一起平移：
   * 「跟随音区」打开后，自定义的键位和整个布局保持同样的形状。
   */
  custom?: readonly CustomBinding[];
}

/**
 * 键盘映射表。
 *
 * 默认布局是「一排一个八度、只有白键」，布局细节见 `LAYOUT_ROWS`。
 * 用户改动叠加其上：同一个物理键（含修饰键）只保留一条，同一个音高也只保留一条，
 * 被「空置」的音高即使默认布局里有键位也会被移除 —— 避免出现「按一个键出两个音」或
 * 「明明留空了却还能弹」的歧义。
 */
export class PianoKeyMap {
  readonly bindings: KeyBinding[] = [];

  private readonly byCode = new Map<string, KeyBinding>();
  private readonly byPitch = new Map<number, KeyBinding[]>();
  private readonly byChar = new Map<string, KeyBinding>();
  private readonly startMidi: number;
  private readonly customBinds = new Map<string, number>();
  private readonly cleared = new Set<number>();

  constructor(options: KeyMapOptions = {}) {
    this.startMidi = options.startMidi ?? BASE_START_MIDI;

    // 自定义音高按默认布局的坐标存，这里统一平移到当前起点：
    // 琴键上看到的音高、`clearedPitches` / `customPitches` 都是平移后的绝对值，
    // 而 localStorage 与方案里仍是 C2 坐标，换音区不会改写用户数据。
    const shift = this.startMidi - BASE_START_MIDI;

    for (const item of options.custom ?? []) {
      if (!Number.isInteger(item.pitch)) continue;
      const pitch = item.pitch + shift;
      if (pitch < MIN_MIDI || pitch > MAX_MIDI) continue;
      if (item.code === null) {
        this.cleared.add(pitch);
        continue;
      }
      if (!isBindableCode(item.code)) continue;
      this.customBinds.set(`${item.modifier}:${item.code}`, pitch);
    }
    // 同一个音既「空置」又「绑定」时以绑定为准（用户最后一步是绑定）
    for (const pitch of this.customBinds.values()) this.cleared.delete(pitch);

    this.rebuild();
  }

  get baseStartMidi(): number {
    return this.startMidi;
  }

  /** 改动条目数（绑定 + 空置） */
  get customCount(): number {
    return this.customBinds.size + this.cleared.size;
  }

  /** 被用户绑定过的音高，用于界面上做标记 */
  get customPitches(): ReadonlySet<number> {
    return new Set(this.customBinds.values());
  }

  /** 被空置的音高（不绑任何键） */
  get clearedPitches(): ReadonlySet<number> {
    return new Set(this.cleared);
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

  /** 琴键上展示的按键标签；空置的音返回 undefined */
  labelFor(pitch: number): string | undefined {
    return this.preferredBinding(pitch)?.label;
  }

  /** 琴键字符，用于分行展示 */
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

    const blockedKeys = new Set(this.customBinds.keys());
    // 白键被改到别的音上时，这颗键原来的 Shift / Alt 变体也一并作废，
    // 否则「Q 变成 C4，但 ⇧Q 还留在 C♯5」会让人莫名其妙
    const blockedCodes = new Set(
      [...this.customBinds.keys()]
        .filter((key) => key.startsWith('none:'))
        .map((key) => key.slice('none:'.length)),
    );
    // 被绑定或被空置的音高，默认绑定都要让位
    const takenPitches = new Set<number>([...this.customBinds.values(), ...this.cleared]);

    for (const item of buildDefaultBindings(this.startMidi)) {
      if (blockedKeys.has(`${item.modifier}:${item.code}`)) continue;
      if (blockedCodes.has(item.code)) continue;
      if (takenPitches.has(item.pitch)) continue;
      this.register(item);
    }

    for (const [key, pitch] of this.customBinds) {
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
