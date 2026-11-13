import { MAX_MIDI, MIN_MIDI, midiToName, WHITE_PITCH_CLASSES } from '@/audio/note';
import type { KeyBinding, KeyModifier } from '@/types';

/** 默认布局的起点：C2。每往上一排升一个八度。 */
export const BASE_START_MIDI = 36;

/** 白键相对根音的半音数：C D E F G A B */
const WHITE_STEPS = [0, 2, 4, 5, 7, 9, 11] as const;

interface LayoutRow {
  /** 段名，用于界面说明 */
  label: string;
  /** 相对起点升几个八度 */
  octave: number;
  /** 正好 7 个键，依次对应 C D E F G A B；用 code 而非 key，避免 Shift 改字符后匹配失败 */
  keys: ReadonlyArray<readonly [code: string, char: string]>;
}

/**
 * 默认布局：一排键 = 一个八度，只有白键（C 大调）。
 *
 * 左手下排、右手中排/上排，四排主键区加一排小键盘，正好覆盖 C2–B6 共五个八度。
 * 每排从最左边那颗键起是 C，向右依次 D E F G A B —— 同一组白键在同一行相邻位置，
 * 音阶走向与视线移动方向一致，不需要记「哪颗键对应哪个音」。
 *
 * 黑键（C♯ D♯ F♯ G♯ A♯）默认不绑：键盘上没有多余的位置，
 * 硬塞进来只能靠 Shift 或占用别的行，反而破坏上面的空间关系。
 * 需要时可在「键位」页自定义，或者用鼠标点琴键。
 */
const LAYOUT_ROWS: readonly LayoutRow[] = [
  {
    label: '下排',
    octave: 0,
    keys: [
      ['KeyZ', 'z'],
      ['KeyX', 'x'],
      ['KeyC', 'c'],
      ['KeyV', 'v'],
      ['KeyB', 'b'],
      ['KeyN', 'n'],
      ['KeyM', 'm'],
    ],
  },
  {
    label: '中排',
    octave: 1,
    keys: [
      ['KeyA', 'a'],
      ['KeyS', 's'],
      ['KeyD', 'd'],
      ['KeyF', 'f'],
      ['KeyG', 'g'],
      ['KeyH', 'h'],
      ['KeyJ', 'j'],
    ],
  },
  {
    label: '上排',
    octave: 2,
    keys: [
      ['KeyQ', 'q'],
      ['KeyW', 'w'],
      ['KeyE', 'e'],
      ['KeyR', 'r'],
      ['KeyT', 't'],
      ['KeyY', 'y'],
      ['KeyU', 'u'],
    ],
  },
  {
    label: '数字排',
    octave: 3,
    keys: [
      ['Digit1', '1'],
      ['Digit2', '2'],
      ['Digit3', '3'],
      ['Digit4', '4'],
      ['Digit5', '5'],
      ['Digit6', '6'],
      ['Digit7', '7'],
    ],
  },
  {
    label: '小键盘',
    octave: 4,
    keys: [
      ['Numpad7', '7'],
      ['Numpad8', '8'],
      ['Numpad9', '9'],
      ['Numpad4', '4'],
      ['Numpad5', '5'],
      ['Numpad6', '6'],
      ['Numpad1', '1'],
    ],
  },
];

/** 界面上展示的布局摘要：一排一个八度（在文件末尾构造，依赖键帽字符工具） */
export interface LayoutRowInfo {
  label: string;
  /** 键位串，如 `Z X C V B N M` */
  keys: string;
  /** 音域，如 `C2–B2` */
  range: string;
}

/** 物理键 → 键帽字符。自定义绑定后，键帽上仍要显示这颗物理键的名字 */
const CHAR_BY_CODE = new Map<string, string>(
  LAYOUT_ROWS.flatMap((row) => row.keys.map(([code, char]) => [code, char] as const)),
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

/** 界面上展示的布局摘要：一排一个八度 */
export const KEYMAP_ROWS: readonly LayoutRowInfo[] = LAYOUT_ROWS.map((row) => {
  const base = BASE_START_MIDI + row.octave * 12;
  return {
    label: row.label,
    keys: row.keys.map(([code, char]) => displayLabel(char, 'none', code)).join(' '),
    range: `${midiToName(base)}–${midiToName(base + 11)}`,
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

/** 默认布局：每排一个八度的白键 */
function buildDefaultBindings(startMidi: number): KeyBinding[] {
  const bindings: KeyBinding[] = [];
  for (const row of LAYOUT_ROWS) {
    const base = startMidi + row.octave * 12;
    row.keys.forEach(([code, char], index) => {
      const pitch = base + WHITE_STEPS[index];
      if (pitch > MAX_MIDI) return;
      bindings.push({ code, modifier: 'none', pitch, char, label: displayLabel(char, 'none', code) });
    });
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
  /** 用户改动（绑定 + 空置），叠加在默认布局之上 */
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

    for (const item of options.custom ?? []) {
      if (!Number.isInteger(item.pitch) || item.pitch < MIN_MIDI || item.pitch > MAX_MIDI) continue;
      if (item.code === null) {
        this.cleared.add(item.pitch);
        continue;
      }
      if (!isBindableCode(item.code)) continue;
      this.customBinds.set(`${item.modifier}:${item.code}`, item.pitch);
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
