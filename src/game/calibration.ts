/**
 * 输入延迟校准（Offset Calibration）—— 纯计算与存取，不碰 AudioContext / DOM。
 *
 * ## 原理
 *
 * 校准模式按稳定节拍（如 120 BPM）落长条、发节拍音。玩家听到 / 看到「嗒」的瞬间按键，
 * 每次按键记一条偏差：
 *
 * ```
 * delta(ms) = 按键的 AudioContext.currentTime − 该拍的标准时刻
 * ```
 *
 * 设备链路（键盘 → 浏览器 → 音频输出）有固定延迟的玩家会**稳定地按晚**，
 * delta 分布在某个正值附近。把这些 delta 去掉一个最大、一个最小后取平均，
 * 就是 `inputOffset`。之后判定按下式修正：
 *
 * ```
 * 判定用时刻 = AudioContext.currentTime − inputOffset
 * ```
 *
 * 玩家习惯性按晚 120ms → offset = +120ms → 修正后按键时刻被拉回标准点。
 *
 * ## 稳定性
 *
 * delta 的标准差过大说明玩家没跟上节拍（乱按 / 分神），此时平均值没有意义，
 * `stable = false`，界面提示重试、**不落盘**。
 */

/** localStorage 键 */
export const CALIBRATION_STORAGE_KEY = 'qinxi:calibration:v1';
/** 需要的有效按键次数（8–10 次取 8：满 8 次即结算，多按不收） */
export const CALIBRATION_TAPS_REQUIRED = 8;
/** 一次校准最多收录的偏差样本（防呆：超过也算结算） */
export const CALIBRATION_TAPS_MAX = 12;
/** 标准差超过该值视为「没跟上节拍」，校准失败（ms） */
export const CALIBRATION_UNSTABLE_STDDEV_MS = 55;
/** 持久化时 offset 的绝对值上限（ms），防手滑存进离谱值 */
export const CALIBRATION_OFFSET_LIMIT_MS = 500;

export interface CalibrationResult {
  /** 修正值（ms，带符号）：判定时刻 = AudioContext.currentTime − offsetMs */
  offsetMs: number;
  /** 剔除极值后样本的标准差（ms） */
  stddevMs: number;
  /** 收到的原始样本数 */
  sampleCount: number;
  /** 标准差在容忍范围内，结果可用 */
  stable: boolean;
}

/**
 * 由一串偏差样本算出修正值。
 *
 * - 样本 ≥ 3：去掉一个最大、一个最小再取平均（抗单次手抖）；
 * - 样本 < 3：不剔除，全量平均；
 * - 标准差按**剔除后**的样本算——极值本来就不代表稳定度。
 */
export function computeOffset(deltasMs: readonly number[]): CalibrationResult {
  if (deltasMs.length === 0) {
    return { offsetMs: 0, stddevMs: 0, sampleCount: 0, stable: false };
  }
  const sorted = [...deltasMs].sort((a, b) => a - b);
  const trimmed = sorted.length >= 3 ? sorted.slice(1, -1) : sorted;
  const mean = trimmed.reduce((sum, value) => sum + value, 0) / trimmed.length;
  const variance =
    trimmed.reduce((sum, value) => sum + (value - mean) ** 2, 0) / trimmed.length;
  const stddevMs = Math.sqrt(variance);
  return {
    offsetMs: mean,
    stddevMs,
    sampleCount: deltasMs.length,
    stable: stddevMs <= CALIBRATION_UNSTABLE_STDDEV_MS,
  };
}

/** 读取持久化的修正值；缺省 / 坏数据 / 超限一律回落 0 */
export function loadInputOffsetMs(storage: { getItem(key: string): string | null }): number {
  const raw = storage.getItem(CALIBRATION_STORAGE_KEY);
  if (raw === null) return 0;
  const value = Number(raw);
  if (!Number.isFinite(value)) return 0;
  return Math.max(-CALIBRATION_OFFSET_LIMIT_MS, Math.min(CALIBRATION_OFFSET_LIMIT_MS, value));
}

/** 持久化修正值（先钳到 ±上限） */
export function saveInputOffsetMs(
  storage: { setItem(key: string, value: string): void },
  offsetMs: number,
): void {
  const clamped = Math.max(-CALIBRATION_OFFSET_LIMIT_MS, Math.min(CALIBRATION_OFFSET_LIMIT_MS, offsetMs));
  storage.setItem(CALIBRATION_STORAGE_KEY, String(clamped));
}
