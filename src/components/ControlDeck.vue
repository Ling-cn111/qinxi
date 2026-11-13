<script setup lang="ts">
import PanelDisplay from './PanelDisplay.vue';
import PanelKeymap from './PanelKeymap.vue';
import PanelSound from './PanelSound.vue';
import { computed } from 'vue';
import type { PianoKeyMap } from '@/keyboard/keyMap';
import type { KeymapScheme } from '@/keyboard/keymapSchemes';
import { findInstrument } from '@/data/instruments';
import type { DeckTab } from '@/types';

/**
 * 钢琴下方的控制台：三页签 + 面板内容。
 * 页签只切换面板，不做页面跳转；所有状态都通过 v-model 交给 App 持有。
 */
const props = defineProps<{
  keyMap: PianoKeyMap;
  pressed: ReadonlySet<number>;
  editPitch: number | null;
  customCount: number;
  lastAction: string;
  schemes: ReadonlyArray<KeymapScheme>;
  activeSchemeId: string | null;
}>();

const emit = defineEmits<{
  toggleEdit: [];
  restore: [];
  clear: [];
  reset: [];
  applyScheme: [id: string];
  saveScheme: [name: string];
  deleteScheme: [id: string];
}>();

const tab = defineModel<DeckTab>('tab', { required: true });
const showHints = defineModel<boolean>('showHints', { required: true });
const noteNames = defineModel<boolean>('noteNames', { required: true });
const solfege = defineModel<boolean>('solfege', { required: true });
const instrument = defineModel<string>('instrument', { required: true });
const volume = defineModel<number>('volume', { required: true });
const diagramMode = defineModel<'char' | 'note'>('diagramMode', { required: true });
const editMode = defineModel<boolean>('editMode', { required: true });

const activeInstrument = computed(
  () => findInstrument(instrument.value)?.name ?? '未选择',
);

const TABS = [
  { id: 'display', label: '显示' },
  { id: 'sound', label: '声音' },
  { id: 'keymap', label: '键位' },
] as const satisfies ReadonlyArray<{ id: DeckTab; label: string }>;
</script>

<template>
  <section class="deck">
    <div class="deck__tabs" role="tablist" aria-label="控制面板">
      <button
        v-for="item in TABS"
        :key="item.id"
        type="button"
        role="tab"
        class="deck__tab"
        :class="{ 'is-active': tab === item.id }"
        :aria-selected="tab === item.id"
        @click="tab = item.id"
      >
        <svg class="deck__icon" viewBox="0 0 16 16" aria-hidden="true">
          <template v-if="item.id === 'display'">
            <rect x="2" y="2" width="5" height="5" rx="0.6" fill="none" stroke="currentColor" />
            <rect x="9" y="2" width="5" height="5" rx="0.6" fill="none" stroke="currentColor" />
            <rect x="2" y="9" width="5" height="5" rx="0.6" fill="none" stroke="currentColor" />
            <rect x="9" y="9" width="5" height="5" rx="0.6" fill="none" stroke="currentColor" />
          </template>
          <template v-else-if="item.id === 'sound'">
            <path
              d="M1.6 8h1.2l1.4-3.6 1.8 7.2 1.7-5.4 1.3 2.4h1.4M12.2 5.4l1.8 2.6-1.8 2.6"
              fill="none"
              stroke="currentColor"
              stroke-width="1.1"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </template>
          <template v-else>
            <rect x="1.4" y="4.2" width="13.2" height="7.6" rx="0.8" fill="none" stroke="currentColor" />
            <path
              d="M3.4 6.4h.01M5.6 6.4h.01M7.8 6.4h.01M10 6.4h.01M12.2 6.4h.01M5 9.6h6"
              fill="none"
              stroke="currentColor"
              stroke-width="1.1"
              stroke-linecap="round"
            />
          </template>
        </svg>
        <span class="deck__label">{{ item.label }}</span>
      </button>

      <span class="deck__now">音色 · {{ activeInstrument }}</span>
    </div>

    <div class="deck__body">
      <PanelDisplay
        v-if="tab === 'display'"
        v-model:hints="showHints"
        v-model:note-names="noteNames"
        v-model:solfege="solfege"
      />
      <PanelSound
        v-else-if="tab === 'sound'"
        v-model:instrument="instrument"
        v-model:volume="volume"
      />
      <PanelKeymap
        v-else
        v-model:mode="diagramMode"
        v-model:edit-mode="editMode"
        :key-map="props.keyMap"
        :pressed="props.pressed"
        :edit-pitch="props.editPitch"
        :custom-count="props.customCount"
        :last-action="props.lastAction"
        :schemes="props.schemes"
        :active-scheme-id="props.activeSchemeId"
        @toggle-edit="emit('toggleEdit')"
        @restore="emit('restore')"
        @clear="emit('clear')"
        @reset="emit('reset')"
        @apply-scheme="(id) => emit('applyScheme', id)"
        @save-scheme="(name) => emit('saveScheme', name)"
        @delete-scheme="(id) => emit('deleteScheme', id)"
      />
    </div>
  </section>
</template>

<style scoped>
.deck {
  width: 90%;
  margin: 0 auto;
  background: #171717;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-top: 0;
}

.deck__tabs {
  display: flex;
  align-items: stretch;
  gap: 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  overflow-x: auto;
  scrollbar-width: none;
}

.deck__tabs::-webkit-scrollbar {
  height: 0;
}

.deck__tab {
  flex: 0 0 auto;
  min-width: 96px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 10px 18px 9px;
  border: 0;
  border-top: 2px solid transparent;
  background: transparent;
  color: rgba(231, 227, 220, 0.38);
  font-family: inherit;
  cursor: pointer;
  transition:
    color 120ms ease,
    background 120ms ease,
    border-color 120ms ease;
}

.deck__tab:hover {
  color: rgba(231, 227, 220, 0.72);
  background: rgba(255, 255, 255, 0.02);
}

.deck__tab.is-active {
  color: #e5c79a;
  background: #221a12;
  border-top-color: #cfa46a;
}

.deck__icon {
  width: 16px;
  height: 16px;
  display: block;
}

.deck__label {
  font-size: 11.5px;
  letter-spacing: 0.08em;
  line-height: 1;
}

.deck__now {
  margin-left: auto;
  align-self: center;
  padding: 0 20px;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11px;
  letter-spacing: 0.06em;
  color: rgba(231, 227, 220, 0.3);
  white-space: nowrap;
}

.deck__body {
  padding: 22px 24px 26px;
}

@media (max-width: 820px) {
  .deck {
    width: 92%;
  }

  .deck__tab {
    min-width: 78px;
    padding: 9px 12px 8px;
  }

  .deck__now {
    display: none;
  }

  .deck__body {
    padding: 18px 14px 20px;
  }
}
</style>
