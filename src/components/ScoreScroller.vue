<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { NoteEvent } from '@/types';
import type { Grade } from '@/game/judge';

/**
 * 谱面视图（键帽谱 / 音名谱共用）：把 NoteEvent[] 转成横向滚动的字符序列。
 *
 * - 与下落画布共享同一个 Transport 时钟（getBeat 每帧取拍位），滚动位置由
 *   「下一个未到的音」的下标推出，播放指针始终停在视口约 35% 处；
 * - 跟弹模式下 `judged` 传入判定表：已判字符按档位着色并标注 P / G / M；
 *   自动播放传 null，只有「正在响」的高亮；
 * - 学弹模式传 `learnCursor`（≥ 0）：不走时钟，指针就是「下一个待弹的音」，
 *   当前组（同拍位）整体高亮，组内弹过的按档位着色，组前的全部置灰；
 * - DOM 状态类由 rAF 直接操作（不走 Vue 响应式）：滚动条上每帧只做
 *   O(字符数) 的 classList diff，字符集合本身交给 v-for 渲染。
 */
const props = defineProps<{
  /** 按 startBeat 升序的谱面音符 */
  notes: NoteEvent[];
  /** 与 notes 一一对应的显示字符（键帽字母或音名，反查不到用 '·'） */
  chars: string[];
  /** 判定表（音符下标 → 档位）；自动播放时为 null */
  judged: ReadonlyMap<number, Grade> | null;
  /** 拍位来源（与 Transport / 下落画布同源） */
  getBeat: () => number;
  playing: boolean;
  /** 单个字符格的宽度（px）：键帽 26，音名（C#4 这类三字符）36 */
  cellWidth?: number;
  /** 学弹模式指针（下一个待弹音的下标）；-1 / 省略 = 非学弹，按时钟走 */
  learnCursor?: number;
}>();

/** 播放指针在视口中的位置比例 */
const LEAD_RATIO = 0.35;

/** 字符格宽度：组件 prop 带默认值，paint / 模板统一从这里取 */
const cell = computed(() => props.cellWidth ?? 26);

const viewport = ref<HTMLElement | null>(null);
const strip = ref<HTMLElement | null>(null);
const cells = ref<HTMLElement[]>([]);
let rafId = 0;
let lastOffset = -1;
let lastStamp = '';

function activeIndexAt(beat: number): number {
  const { notes } = props;
  let lo = 0;
  let hi = notes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (notes[mid].startBeat <= beat) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function isNowPlaying(note: NoteEvent, beat: number): boolean {
  return beat >= note.startBeat && beat < note.startBeat + Math.max(note.durationBeats, 0.05);
}

function paint(): void {
  const vp = viewport.value;
  const st = strip.value;
  if (!vp || !st) return;

  const learn = props.learnCursor ?? -1;
  const beat = props.getBeat();
  // 学弹：指针就是 learnCursor；普通播放 / 自动：按时钟推出
  const active = learn >= 0 ? learn : activeIndexAt(beat);
  const offset = Math.max(0, active * cell.value - vp.clientWidth * LEAD_RATIO);
  if (Math.abs(offset - lastOffset) > 0.5) {
    st.style.transform = `translateX(${-offset}px)`;
    lastOffset = offset;
  }

  // 状态戳：指针没动、判定也没变时就整帧跳过
  const stamp = `${learn}|${active}|${props.judged ? props.judged.size : -1}`;
  if (stamp === lastStamp) return;
  lastStamp = stamp;

  const learnBeat = learn >= 0 ? (props.notes[learn]?.startBeat ?? Number.NaN) : Number.NaN;
  for (let index = 0; index < cells.value.length; index += 1) {
    const cellEl = cells.value[index];
    const note = props.notes[index];
    if (!cellEl || !note) continue;
    const grade = props.judged?.get(index);
    if (learn >= 0) {
      // 学弹：当前组（同拍位）整体亮着 —— 弹过的按档位着色，没弹的等手；
      // 组之前的全部置灰，组之后保持未到状态
      const inGroup = note.startBeat === learnBeat;
      cellEl.classList.toggle('is-active', inGroup);
      cellEl.classList.toggle('is-past', index < learn);
    } else {
      // 已判定的按档位着色；只有「还没判、此刻正在响」的音才做高亮
      cellEl.classList.toggle('is-active', !grade && isNowPlaying(note, beat));
      cellEl.classList.toggle('is-past', note.startBeat + Math.max(note.durationBeats, 0.05) <= beat);
    }
    cellEl.dataset.grade = grade ?? '';
  }
}

function frame(): void {
  paint();
  if (props.playing) rafId = requestAnimationFrame(frame);
  else rafId = 0;
}

function startLoop(): void {
  if (rafId) return;
  rafId = requestAnimationFrame(frame);
}

function stopLoop(): void {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
  paint(); // 补一帧：暂停 / 停止后停在当前位置
}

watch(
  () => [props.playing, props.notes, props.learnCursor, props.cellWidth],
  () => {
    lastStamp = '';
    lastOffset = -1;
    if (props.playing) startLoop();
    else stopLoop();
  },
  { immediate: false },
);

// 判定表换实例（循环跳回清空 / 换曲）时强制重画一次
watch(
  () => props.judged,
  () => {
    lastStamp = '';
    if (!props.playing) paint();
  },
);

onMounted(() => {
  if (props.playing) startLoop();
  else paint();
});

onBeforeUnmount(() => {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
});
</script>

<template>
  <div
    ref="viewport"
    class="score-scroller"
    role="log"
    aria-label="谱面"
    :style="{ '--cell-w': `${cell}px` }"
  >
    <div ref="strip" class="score-scroller__strip" :style="{ width: `${notes.length * cell + 80}px` }">
      <span
        v-for="(note, index) in notes"
        :key="note.id"
        :ref="(el) => { if (el) cells[index] = el as HTMLElement; }"
        class="score-scroller__cell"
        :class="{ 'is-chord-gap': index > 0 && notes[index - 1].startBeat === note.startBeat }"
      >
        {{ chars[index] ?? '·' }}
      </span>
    </div>
    <!-- 播放指针 -->
    <div class="score-scroller__caret" aria-hidden="true" />
  </div>
</template>

<style scoped>
.score-scroller {
  position: relative;
  overflow: hidden;
  height: 44px;
  border-top: 1px solid rgba(var(--qin-w-rgb), 0.06);
  background: rgba(0, 0, 0, 0.18);
}

.score-scroller__strip {
  display: flex;
  align-items: center;
  height: 100%;
  will-change: transform;
}

.score-scroller__cell {
  position: relative;
  flex: 0 0 var(--cell-w, 26px);
  width: var(--cell-w, 26px);
  display: flex;
  align-items: center;
  justify-content: center;
  height: 30px;
  margin: 0 1px;
  border-radius: 3px;
  background: rgba(var(--qin-w-rgb), 0.06);
  border: 1px solid rgba(var(--qin-w-rgb), 0.1);
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
  color: rgba(var(--qin-ink-rgb), 0.82);
  transition: background 90ms linear, color 90ms linear;
}

/* 和弦的后续成员不重复画左边框，视觉上贴成一组 */
.score-scroller__cell.is-chord-gap {
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
  margin-left: 0;
}

.score-scroller__cell.is-active {
  background: rgba(var(--qin-accent-rgb), 0.85);
  border-color: transparent;
  color: #fff;
}

.score-scroller__cell.is-past {
  opacity: 0.55;
}

/* 判定结果：字符右上角标 P / G / M，字符按档位着色 */
.score-scroller__cell[data-grade='perfect'] {
  color: var(--qin-accent-strong);
  border-color: rgba(var(--qin-accent-rgb), 0.55);
}

.score-scroller__cell[data-grade='good'] {
  color: rgb(var(--qin-ink-rgb));
  border-color: rgba(var(--qin-w-rgb), 0.3);
}

.score-scroller__cell[data-grade='miss'] {
  color: rgb(var(--qin-danger-rgb));
  border-color: rgba(var(--qin-danger-rgb), 0.45);
}

.score-scroller__cell[data-grade]:not([data-grade=''])::after {
  content: attr(data-grade);
  position: absolute;
  top: -1px;
  right: 1px;
  font-size: 7px;
  letter-spacing: 0;
  opacity: 0.85;
  transform: scale(0.9);
}

/* 播放指针：视口 35% 处的竖线，字符滚到这里就是「该弹了」 */
.score-scroller__caret {
  position: absolute;
  left: 35%;
  top: 0;
  bottom: 0;
  width: 1px;
  background: rgba(var(--qin-accent-rgb), 0.5);
  pointer-events: none;
}
</style>
