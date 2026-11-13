<script setup lang="ts">
import type { CalibrationResult } from '@/game/calibration';

/**
 * 延迟校准面板：叠在下落画布上方的居中卡片。
 *
 * 三块内容：
 * 1. 测试引导（长条落到判定线时按空格，已收 x/8）与实时偏差；
 * 2. 结算（成功显示修正值并已应用；失败提示重试，不落盘）；
 * 3. 手动微调：当前修正值 + ±5ms / 恢复默认——不跑测试也能直接调。
 *
 * 状态由 App 管理（含校准 Transport 与节拍音），这里只展示与发事件。
 */
const props = defineProps<{
  /** idle = 还没开始；running = 收集中；settled = 出了结果 */
  phase: 'idle' | 'running' | 'settled';
  /** 已收录的每次偏差（ms，带符号） */
  taps: readonly number[];
  /** 需要的次数 */
  required: number;
  /** 结算结果（失败时 stable=false） */
  result: CalibrationResult | null;
  /** 当前生效的修正值（ms） */
  offsetMs: number;
}>();

const emit = defineEmits<{
  start: [];
  close: [];
  /** 手动微调：+5 / -5 */
  adjust: [deltaMs: number];
  /** 恢复默认（0） */
  reset: [];
  /** 触屏 / 鼠标玩家的按键替代：点击=按一次 */
  tap: [];
}>();

const lastTap = () => props.taps.at(-1);
const fmtDelta = (value: number) => {
  const rounded = Math.round(value);
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
};
</script>

<template>
  <div class="calib" role="dialog" aria-label="延迟校准">
    <div class="calib__head">
      <span class="calib__title">延迟校准</span>
      <button type="button" class="calib__close" aria-label="关闭校准" @click="emit('close')">✕</button>
    </div>

    <!-- 测试中 / 未开始：引导 -->
    <template v-if="phase !== 'settled'">
      <p class="calib__hint">
        {{ phase === 'running'
          ? '长条落到判定线时按【空格】（或点下面按钮），听「嗒」声也对得上'
          : '按开始后，长条会随 120 BPM 节拍落向判定线并发出节拍音' }}
      </p>
      <div v-if="phase === 'running'" class="calib__progress">
        <span class="calib__count">已按 {{ taps.length }} / {{ required }}</span>
        <span v-if="lastTap() !== undefined" class="calib__last">上次偏差 {{ fmtDelta(lastTap()!) }}ms</span>
      </div>
      <button
        v-if="phase === 'running'"
        type="button"
        class="calib__tap"
        @pointerdown.prevent="emit('tap')"
      >点这里 = 按空格</button>
      <button v-else type="button" class="calib__start" @click="emit('start')">开始校准</button>
    </template>

    <!-- 结算 -->
    <template v-else-if="result">
      <p v-if="result.stable" class="calib__result calib__result--ok" role="status">
        校准完成：输入延迟 {{ fmtDelta(result.offsetMs) }}ms（抖动 ±{{ Math.round(result.stddevMs) }}ms），已应用并保存
      </p>
      <p v-else class="calib__result calib__result--bad" role="alert">
        校准失败，请集中注意力重试（抖动 ±{{ Math.round(result.stddevMs) }}ms 太大）
      </p>
      <button type="button" class="calib__start" @click="emit('start')">再测一次</button>
    </template>

    <!-- 手动微调：始终可用 -->
    <div class="calib__manual">
      <span class="calib__manual-label">当前修正</span>
      <b class="calib__value">{{ fmtDelta(offsetMs) }}ms</b>
      <button type="button" class="calib__mini" aria-label="减少 5ms" @click="emit('adjust', -5)">−5</button>
      <button type="button" class="calib__mini" aria-label="增加 5ms" @click="emit('adjust', 5)">+5</button>
      <button type="button" class="calib__mini calib__mini--wide" @click="emit('reset')">恢复默认</button>
    </div>
  </div>
</template>

<style scoped>
.calib {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: min(560px, 92%);
  padding: 14px 18px 12px;
  box-sizing: border-box;
  background: linear-gradient(180deg, rgba(10, 10, 10, 0.94), rgba(16, 14, 12, 0.92));
  border: 1px solid rgba(var(--qin-w-rgb), 0.16);
  border-radius: 4px;
  box-shadow: 0 10px 34px rgba(0, 0, 0, 0.6);
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.calib__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.calib__title {
  font-size: 13px;
  letter-spacing: 0.14em;
  color: var(--qin-accent-strong);
}

.calib__close {
  appearance: none;
  border: 0;
  background: transparent;
  color: rgba(var(--qin-w-rgb), 0.45);
  font-size: 13px;
  cursor: pointer;
  padding: 0 2px;
}

.calib__close:hover { color: rgb(var(--qin-ink-rgb)); }

.calib__hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: rgba(var(--qin-ink-rgb), 0.72);
}

.calib__progress {
  display: flex;
  align-items: baseline;
  gap: 16px;
  font-size: 12px;
}

.calib__count {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 15px;
  color: var(--qin-accent-strong);
}

.calib__last {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  color: rgba(var(--qin-w-rgb), 0.5);
}

.calib__start,
.calib__tap {
  appearance: none;
  align-self: center;
  padding: 6px 26px;
  border: 1px solid rgba(var(--qin-accent-rgb), 0.55);
  border-radius: 2px;
  background: var(--qin-surface-active);
  color: var(--qin-accent-strong);
  font-family: inherit;
  font-size: 12.5px;
  letter-spacing: 0.1em;
  cursor: pointer;
  transition: filter 120ms ease;
}

.calib__tap {
  align-self: stretch;
  padding: 12px 26px;
  font-size: 13px;
}

.calib__start:hover,
.calib__tap:hover { filter: brightness(1.25); }

.calib__result {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
}

.calib__result--ok { color: var(--qin-accent-strong); }
.calib__result--bad { color: var(--qin-danger-strong); }

.calib__manual {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-top: 9px;
  border-top: 1px solid rgba(var(--qin-w-rgb), 0.1);
}

.calib__manual-label {
  font-size: 11.5px;
  letter-spacing: 0.08em;
  color: rgba(var(--qin-w-rgb), 0.45);
}

.calib__value {
  min-width: 62px;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 13.5px;
  color: rgb(var(--qin-ink-rgb));
}

.calib__mini {
  appearance: none;
  padding: 3px 10px;
  border: 1px solid rgba(var(--qin-w-rgb), 0.18);
  border-radius: 2px;
  background: transparent;
  color: rgba(var(--qin-ink-rgb), 0.8);
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11.5px;
  cursor: pointer;
  transition: border-color 120ms ease, color 120ms ease;
}

.calib__mini:hover {
  border-color: rgba(var(--qin-accent-rgb), 0.55);
  color: var(--qin-accent-strong);
}

.calib__mini--wide { font-family: inherit; }
</style>
