<script setup lang="ts">
import { computed } from 'vue';
import { accuracyOf, ratingFor } from '@/game/combo';
import type { Grade } from '@/game/judge';

/**
 * 成绩结算面板：跟弹播放结束（播完或手动停止）时弹出。
 *
 * 内容：评级大字母（S/A/B/C/D）+ 准确率、Max Combo、三档计数与占比，
 * 底部「再来一次」（重开当前谱面）与「返回选曲」（收面板回空闲态）。
 * 统计全部由纯函数（src/game/combo.ts）算出，本组件只负责呈现。
 */
const props = defineProps<{
  /** 是否显示 */
  open: boolean;
  /** 谱面总音符数（占比与「共 n 音」用） */
  total: number;
  /** 三档计数 */
  counts: { perfect: number; good: number; miss: number };
  /** 本局最大连击数 */
  maxCombo: number;
}>();

const emit = defineEmits<{ retry: []; close: [] }>();

const accuracy = computed(() => accuracyOf(props.counts));
const rating = computed(() => ratingFor(accuracy.value));
const accuracyPercent = computed(() => (accuracy.value * 100).toFixed(1));

const GRADE_LABEL: Record<Grade, string> = { perfect: 'Perfect', good: 'Good', miss: 'Miss' };
const rows = computed(() =>
  (['perfect', 'good', 'miss'] as const).map((grade) => ({
    grade,
    label: GRADE_LABEL[grade],
    count: props.counts[grade],
    percent: props.total > 0 ? ((props.counts[grade] / props.total) * 100).toFixed(1) : '0.0',
  })),
);
</script>

<template>
  <Transition name="result-fade">
    <div v-if="open" class="result" role="dialog" aria-label="跟弹结算">
      <div class="result__card">
        <p class="result__heading">演奏结算</p>
        <p class="result__rating" :class="`result__rating--${rating.toLowerCase()}`">{{ rating }}</p>
        <p class="result__accuracy">准确率 {{ accuracyPercent }}%</p>

        <dl class="result__stats">
          <div class="result__stat">
            <dt>Max Combo</dt>
            <dd>{{ maxCombo }}</dd>
          </div>
          <div class="result__stat">
            <dt>谱面</dt>
            <dd>{{ total }} 音</dd>
          </div>
        </dl>

        <ul class="result__grades">
          <li v-for="row in rows" :key="row.grade" class="result__grade" :class="`result__grade--${row.grade}`">
            <span class="result__grade-name">{{ row.label }}</span>
            <span class="result__grade-count">{{ row.count }}</span>
            <span class="result__grade-percent">{{ row.percent }}%</span>
          </li>
        </ul>

        <div class="result__actions">
          <button type="button" class="result__btn result__btn--primary" @click="emit('retry')">再来一次</button>
          <button type="button" class="result__btn" @click="emit('close')">返回选曲</button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.result {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(3px);
}

.result__card {
  width: min(360px, calc(100vw - 48px));
  padding: 26px 30px 22px;
  border-radius: 10px;
  background: var(--qin-surface, #201d19);
  border: 1px solid rgba(var(--qin-w-rgb, 255, 255, 255), 0.12);
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.5);
  text-align: center;
  color: rgb(var(--qin-ink-rgb, 231, 227, 220));
}

.result__heading {
  margin: 0;
  font-size: 13px;
  letter-spacing: 0.35em;
  text-indent: 0.35em;
  color: rgba(var(--qin-ink-rgb, 231, 227, 220), 0.6);
}

.result__rating {
  margin: 6px 0 0;
  font-size: 76px;
  line-height: 1.1;
  font-weight: 700;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  text-shadow: 0 0 24px currentColor;
}

.result__rating--s { color: var(--qin-accent-strong, #ffd98a); }
.result__rating--a { color: #7fd8a4; }
.result__rating--b { color: #7fb8d8; }
.result__rating--c { color: #c9a2d8; }
.result__rating--d { color: rgba(var(--qin-danger-rgb, 255, 110, 92), 0.9); }

.result__accuracy {
  margin: 0 0 14px;
  font-size: 13px;
  color: rgba(var(--qin-ink-rgb, 231, 227, 220), 0.75);
}

.result__stats {
  display: flex;
  justify-content: center;
  gap: 26px;
  margin: 0 0 14px;
  padding: 10px 0;
  border-top: 1px solid rgba(var(--qin-w-rgb, 255, 255, 255), 0.08);
  border-bottom: 1px solid rgba(var(--qin-w-rgb, 255, 255, 255), 0.08);
}

.result__stat dt {
  font-size: 11px;
  color: rgba(var(--qin-ink-rgb, 231, 227, 220), 0.55);
}

.result__stat dd {
  margin: 2px 0 0;
  font-size: 19px;
  font-weight: 600;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}

.result__grades {
  list-style: none;
  margin: 0 0 18px;
  padding: 0;
  display: grid;
  gap: 6px;
}

.result__grade {
  display: grid;
  grid-template-columns: 1fr 52px 64px;
  align-items: baseline;
  font-size: 13px;
}

.result__grade-name { text-align: left; }
.result__grade-count {
  text-align: right;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-weight: 600;
}
.result__grade-percent {
  text-align: right;
  font-size: 11.5px;
  color: rgba(var(--qin-ink-rgb, 231, 227, 220), 0.55);
}

.result__grade--perfect .result__grade-name { color: var(--qin-accent-strong, #ffd98a); }
.result__grade--good .result__grade-name { color: rgb(var(--qin-ink-rgb, 231, 227, 220)); }
.result__grade--miss .result__grade-name { color: var(--qin-danger-strong, #ff6e5c); }

.result__actions {
  display: flex;
  gap: 10px;
  justify-content: center;
}

.result__btn {
  flex: 1;
  padding: 9px 0;
  border-radius: 6px;
  border: 1px solid rgba(var(--qin-w-rgb, 255, 255, 255), 0.18);
  background: rgba(var(--qin-w-rgb, 255, 255, 255), 0.06);
  color: inherit;
  font-size: 13.5px;
  cursor: pointer;
  transition: background 120ms linear;
}

.result__btn:hover { background: rgba(var(--qin-w-rgb, 255, 255, 255), 0.12); }

.result__btn--primary {
  background: var(--qin-accent, #cfa46a);
  border-color: transparent;
  color: #17130e;
  font-weight: 600;
}

.result__btn--primary:hover { background: var(--qin-accent-strong, #ffd98a); }

.result-fade-enter-active,
.result-fade-leave-active { transition: opacity 180ms ease; }
.result-fade-enter-active .result__card { transition: transform 180ms cubic-bezier(0.2, 0.9, 0.3, 1.2); }
.result-fade-enter-from,
.result-fade-leave-to { opacity: 0; }
.result-fade-enter-from .result__card { transform: scale(0.92); }
</style>
