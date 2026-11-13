/**
 * 共享类型定义。
 * NoteEvent 是解析器 / 自动播放 / 跟弹判定之间唯一的数据契约。
 */

/** 统一音符事件模型（MIDI 音高 + 拍位） */
export interface NoteEvent {
  /** 事件唯一 id（解析器生成，形如 `n12`） */
  id: string;
  /** MIDI note number，21（A0）–108（C8） */
  pitch: number;
  /** 起始拍位，以四分音符为 1 拍 */
  startBeat: number;
  /** 持续拍数，> 0 */
  durationBeats: number;
  hand?: 'left' | 'right';
  /** 力度 0–127 */
  velocity?: number;
  /** 谱面里的原始键盘字符（用于键盘谱高亮） */
  keyboardKey?: string;
}

/** 键盘修饰键。AutoPiano 社区谱用 Shift 组合表示黑键。 */
export type KeyModifier = 'none' | 'shift' | 'alt';

/** 钢琴下方控制台的三个页签 */
export type DeckTab = 'display' | 'sound' | 'keymap';

/** 一条「物理按键 → 音高」的绑定 */
export interface KeyBinding {
  /** KeyboardEvent.code，例如 KeyZ / Digit1 / Semicolon */
  code: string;
  modifier: KeyModifier;
  /** MIDI 音高 */
  pitch: number;
  /** 谱面里书写该键的字符，例如 'z' */
  char: string;
  /** 界面展示用标签，例如 'Z' 或 '⇧Z' */
  label: string;
}
