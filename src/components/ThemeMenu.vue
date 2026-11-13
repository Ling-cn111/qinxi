<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { THEMES, type Theme } from '@/theme/themes';
import { setTheme, themeId } from '@/theme/useTheme';

/**
 * 顶栏最右侧的外观主题菜单。
 * 只换背景与外壳配色（见 `src/theme/themes.ts`），琴体不受影响。
 */
const open = ref(false);
const root = ref<HTMLElement | null>(null);

const active = computed<Theme>(() => THEMES.find((item) => item.id === themeId.value) ?? THEMES[0]);

const swatchStyle = (theme: Theme) => ({
  background: `linear-gradient(135deg, ${theme.swatch[0]} 0 46%, ${theme.swatch[1]} 54% 100%)`,
});

function choose(id: string): void {
  setTheme(id);
  open.value = false;
}

function onPointerDown(event: PointerEvent): void {
  if (!open.value) return;
  const target = event.target as Node | null;
  if (target && root.value?.contains(target)) return;
  open.value = false;
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && open.value) open.value = false;
}

onMounted(() => {
  document.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('keydown', onKeyDown);
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onPointerDown);
  document.removeEventListener('keydown', onKeyDown);
});
</script>

<template>
  <div ref="root" class="theme" :class="{ 'is-open': open }">
    <button
      type="button"
      class="theme__btn"
      aria-haspopup="menu"
      :aria-expanded="open"
      aria-label="外观主题"
      @click="open = !open"
    >
      <span class="theme__swatch" :style="swatchStyle(active)" aria-hidden="true"></span>
      <span class="theme__name">{{ active.name }}</span>
      <svg class="theme__chev" viewBox="0 0 8 8" aria-hidden="true">
        <path d="M1.2 2.9 4 5.7l2.8-2.8" fill="none" stroke="currentColor" stroke-width="1.1" />
      </svg>
    </button>

    <div v-if="open" class="theme__menu" role="menu" aria-label="选择外观主题">
      <button
        v-for="item in THEMES"
        :key="item.id"
        type="button"
        role="menuitemradio"
        class="theme__item"
        :class="{ 'is-active': item.id === themeId }"
        :aria-checked="item.id === themeId"
        @click="choose(item.id)"
      >
        <span class="theme__item-swatch" :style="swatchStyle(item)" aria-hidden="true"></span>
        <span class="theme__item-text">
          <span class="theme__item-name">
            {{ item.name }}<span class="theme__item-latin">{{ item.latin }}</span>
          </span>
          <span class="theme__item-hint">{{ item.hint }}</span>
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.theme {
  position: relative;
  display: flex;
}

.theme__btn {
  display: flex;
  align-items: center;
  gap: 7px;
  height: 26px;
  padding: 0 9px;
  border: 1px solid rgba(var(--qin-w-rgb), 0.1);
  border-radius: 2px;
  background: transparent;
  color: rgba(var(--qin-ink-rgb), 0.56);
  font-family: inherit;
  font-size: 12px;
  letter-spacing: 0.06em;
  cursor: pointer;
  transition:
    color 120ms ease,
    border-color 120ms ease,
    box-shadow 160ms ease;
}

.theme__btn:hover {
  color: rgba(var(--qin-ink-rgb), 0.88);
  border-color: rgba(var(--qin-accent-rgb), 0.42);
}

.theme.is-open .theme__btn {
  color: var(--qin-accent-strong);
  border-color: rgba(var(--qin-accent-rgb), 0.55);
  box-shadow: var(--qin-glow);
}

.theme__swatch {
  width: 10px;
  height: 10px;
  border-radius: 1px;
  box-shadow: inset 0 0 0 1px rgba(var(--qin-w-rgb), 0.22);
}

.theme__name {
  line-height: 1;
}

.theme__chev {
  width: 8px;
  height: 8px;
  display: block;
  opacity: 0.7;
  transition: transform 140ms ease;
}

.theme.is-open .theme__chev {
  transform: rotate(180deg);
}

/* ------------------------------------------------------------------ 菜单 */
.theme__menu {
  position: absolute;
  right: 0;
  top: calc(100% + 9px);
  z-index: 40;
  min-width: 240px;
  padding: 4px;
  border: 1px solid rgba(var(--qin-w-rgb), 0.1);
  background: var(--qin-surface-2);
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.55);
}

.theme__menu::before {
  /* 顶栏与菜单之间的一根细线，避免菜单像浮在空中 */
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: -1px;
  height: 1px;
  background: linear-gradient(
    to right,
    rgba(var(--qin-accent-rgb), 0) 0,
    rgba(var(--qin-accent-rgb), 0.35) 50%,
    rgba(var(--qin-accent-rgb), 0) 100%
  );
}

.theme__item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  padding: 9px 10px 10px;
  border: 0;
  border-left: 2px solid transparent;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    background 120ms ease,
    border-color 120ms ease;
}

.theme__item:hover {
  background: var(--qin-surface-hover);
}

.theme__item.is-active {
  border-left-color: var(--qin-accent);
  background: var(--qin-surface-active);
}

.theme__item-swatch {
  flex: 0 0 auto;
  width: 16px;
  height: 16px;
  margin-top: 1px;
  border-radius: 1px;
  box-shadow: inset 0 0 0 1px rgba(var(--qin-w-rgb), 0.2);
}

.theme__item-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.theme__item-name {
  display: flex;
  align-items: baseline;
  gap: 7px;
  font-size: 12.5px;
  line-height: 1.1;
  letter-spacing: 0.05em;
  color: rgba(var(--qin-ink-rgb), 0.9);
}

.theme__item-latin {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 9px;
  letter-spacing: 0.14em;
  color: rgba(var(--qin-ink-rgb), 0.28);
}

.theme__item-hint {
  font-size: 11px;
  line-height: 1.45;
  color: rgba(var(--qin-ink-rgb), 0.4);
}

.theme__item.is-active .theme__item-name {
  color: var(--qin-accent-strong);
}

@media (max-width: 820px) {
  .theme__name {
    display: none;
  }

  .theme__btn {
    padding: 0 7px;
  }
}
</style>
