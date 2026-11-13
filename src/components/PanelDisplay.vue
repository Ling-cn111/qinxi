<script setup lang="ts">
import { watch } from 'vue';
import UiToggle from './UiToggle.vue';

/** 「显示」页：琴键上标注什么。音名与唱名共用键面下方一行，互斥。 */
const hints = defineModel<boolean>('hints', { required: true });
const noteNames = defineModel<boolean>('noteNames', { required: true });
const solfege = defineModel<boolean>('solfege', { required: true });

watch(noteNames, (on) => {
  if (on) solfege.value = false;
});

watch(solfege, (on) => {
  if (on) noteNames.value = false;
});
</script>

<template>
  <section class="panel">
    <h3 class="panel-title"><span class="panel-title__num">1</span>琴键标识</h3>

    <div class="panel-row">
      <UiToggle v-model="hints" label="显示按键提示" />
      <UiToggle v-model="noteNames" label="显示音名" />
      <UiToggle v-model="solfege" label="显示唱名（C 大调）" />
    </div>

    <p class="panel-desc">
      按键提示标在键面上方，音名与唱名共用下方一行，开启其一时会自动关闭另一个。
    </p>
  </section>
</template>
