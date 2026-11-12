import { hasBlackAbove, hasBlackBelow, MAX_MIDI, midiToName, WHITE_PITCH_CLASSES } from '@/audio/note';
import type { KeyBinding, KeyModifier } from '@/types';

/** 基准起点：C2。四排白键连续排布，覆盖 C2–C8（85 个音） */
export const BASE_START_MIDI = 36;

/**
 * 四排白键（由低到高）。
 * 每项为 [KeyboardEvent.code, 谱面字符]。
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

function displayLabel(char: string, modifier: KeyModifier): string {
  const base = char.length === 1 && /[a-z]/.test(char) ? char.toUpperCase() : char;
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

/**
 * 键盘映射表。
 *
 * 规则（与 AutoPiano 社区键盘谱约定一致）：
 * - 白键：字母 / 数字 / 标点，四排由低到高连续排列；
 * - 黑键：Shift + 左侧白键（如 ⇧Z = C#2），同时接受 Alt + 右侧白键作为同义写法；
 * - 谱面字符大小写不敏感，`Shift+q` 与 `Q` 等价（大写字母即 Shift 组合）。
 */
export class PianoKeyMap {
  readonly bindings: KeyBinding[] = [];

  private readonly byCode = new Map<string, KeyBinding>();
  private readonly byPitch = new Map<number, KeyBinding[]>();
  private readonly byChar = new Map<string, KeyBinding>();
  private readonly startMidi: number;

  constructor(startMidi: number = BASE_START_MIDI) {
    this.startMidi = startMidi;
    const totalKeys = WHITE_ROWS.reduce((sum, row) => sum + row.length, 0);
    const pitches = whitePitchSequence(startMidi, totalKeys);

    let index = 0;
    for (const row of WHITE_ROWS) {
      for (const [code, char] of row) {
        const pitch = pitches[index];
        index += 1;
        if (pitch === undefined || pitch > MAX_MIDI) continue;

        this.register({ code, modifier: 'none', pitch, char, label: displayLabel(char, 'none') });

        if (hasBlackAbove(pitch) && pitch + 1 <= MAX_MIDI) {
          this.register({
            code,
            modifier: 'shift',
            pitch: pitch + 1,
            char,
            label: displayLabel(char, 'shift'),
          });
        }
        if (hasBlackBelow(pitch) && pitch - 1 >= 21) {
          this.register({
            code,
            modifier: 'alt',
            pitch: pitch - 1,
            char,
            label: displayLabel(char, 'alt'),
          });
        }
      }
    }
  }

  get baseStartMidi(): number {
    return this.startMidi;
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

  /** 琴键字符（大写），黑键用于分行展示 */
  charFor(pitch: number): string | undefined {
    const binding = this.preferredBinding(pitch);
    if (!binding) return undefined;
    return binding.char.length === 1 ? binding.char.toUpperCase() : binding.char;
  }

  /** 该音高对应绑定使用的修饰键 */
  modifierFor(pitch: number): KeyModifier | undefined {
    return this.preferredBinding(pitch)?.modifier;
  }

  private preferredBinding(pitch: number): KeyBinding | undefined {
    const list = this.byPitch.get(pitch);
    if (!list || list.length === 0) return undefined;
    return (
      list.find((b) => b.modifier === 'none') ??
      list.find((b) => b.modifier === 'shift') ??
      list[0]
    );
  }

  /** 谱面字符 → 绑定，供后续键盘谱解析使用 */
  findByChar(char: string, modifier: KeyModifier = 'none'): KeyBinding | undefined {
    return this.byChar.get(`${modifier}:${char.toLowerCase()}`);
  }

  noteNameFor(pitch: number): string {
    return midiToName(pitch);
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

let sharedKeyMap: PianoKeyMap | null = null;

/** 全局共享的单例映射表（构建成本很低，但仍避免重复创建） */
export function getKeyMap(): PianoKeyMap {
  sharedKeyMap ??= new PianoKeyMap();
  return sharedKeyMap;
}
