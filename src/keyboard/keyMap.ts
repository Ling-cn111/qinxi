import { hasBlackAbove, hasBlackBelow, MAX_MIDI, MIN_MIDI, midiToName, WHITE_PITCH_CLASSES } from '@/audio/note';
import type { KeyBinding, KeyModifier } from '@/types';

/** 基准起点：C2。四排白键连续排布，覆盖 C2–C8（85 个音） */
export const BASE_START_MIDI = 36;

/**
 * 四排白键（由低到高）。
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

/** 物理键 → 键帽字符。自定义绑定后，键帽上仍要显示这颗物理键的名字 */
const CHAR_BY_CODE = new Map<string, string>(
  WHITE_ROWS.flatMap((row) => row.map(([code, char]) => [code, char] as const)),
);

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

/** 物理键的键帽字符；未知键回落到 code 本身的小写形式 */
export function charForCode(code: string): string {
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

function displayLabel(char: string, modifier: KeyModifier, code: string): string {
  const base =
    code === 'Space' ? '␣' : char.length === 1 && /[a-z]/.test(char) ? char.toUpperCase() : char;
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

/** 默认键位：四排白键由低到高铺开，Shift 取左侧黑键、Alt 取右侧黑键 */
function buildDefaultBindings(startMidi: number): KeyBinding[] {
  const totalKeys = WHITE_ROWS.reduce((sum, row) => sum + row.length, 0);
  const pitches = whitePitchSequence(startMidi, totalKeys);
  const bindings: KeyBinding[] = [];

  let index = 0;
  for (const row of WHITE_ROWS) {
    for (const [code, char] of row) {
      const pitch = pitches[index];
      index += 1;
      if (pitch === undefined || pitch > MAX_MIDI) continue;

      bindings.push({
        code,
        modifier: 'none',
        pitch,
        char,
        label: displayLabel(char, 'none', code),
      });

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

/**
 * 键盘映射表。
 *
 * 默认规则：白键四排由低到高连续排列、Shift 取左侧黑键、Alt 取右侧黑键；
 * 用户自定义的绑定叠加在默认之上 —— 同一个物理键（含修饰键）只保留一条，
 * 同一个音高也只保留一条，避免「按一个键出两个音」的歧义。
 */
export class PianoKeyMap {
  readonly bindings: KeyBinding[] = [];

  private readonly byCode = new Map<string, KeyBinding>();
  private readonly byPitch = new Map<number, KeyBinding[]>();
  private readonly byChar = new Map<string, KeyBinding>();
  private readonly startMidi: number;
  private readonly custom = new Map<string, number>();

  constructor(startMidi: number = BASE_START_MIDI, custom: readonly CustomBinding[] = []) {
    this.startMidi = startMidi;
    for (const item of custom) {
      if (!isBindableCode(item.code)) continue;
      if (!Number.isInteger(item.pitch) || item.pitch < MIN_MIDI || item.pitch > MAX_MIDI) continue;
      this.custom.set(`${item.modifier}:${item.code}`, item.pitch);
    }
    this.rebuild();
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

    for (const binding of buildDefaultBindings(this.startMidi)) {
      // 该物理键已被自定义占用，或该音高已被自定义绑定 → 默认绑定让位
      if (blockedKeys.has(`${binding.modifier}:${binding.code}`)) continue;
      if (blockedCodes.has(binding.code)) continue;
      if (takenPitches.has(binding.pitch)) continue;
      this.register(binding);
    }

    for (const [key, pitch] of this.custom) {
      const separator = key.indexOf(':');
      const modifier = key.slice(0, separator) as KeyModifier;
      const code = key.slice(separator + 1);
      const char = charForCode(code);
      this.register({ code, modifier, pitch, char, label: displayLabel(char, modifier, code) });
    }
  }

  private register(binding: KeyBinding): void {
    const codeKey = `${binding.modifier}:${binding.code}`;
    if (this.byCode.has(codeKey)) return;
    this.byCode.set(codeKey, binding);

    const charKey = `${binding.modifier}:${binding.char}`;
    if (!this.byChar.has(charKey)) this.byChar.set(charKey, binding);

    const list = this.byPitch.get(binding.pitch);
    if (list) list.push(binding);
    else this.byPitch.set(binding.pitch, [binding]);

    this.bindings.push(binding);
  }
}
