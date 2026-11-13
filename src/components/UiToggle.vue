<script setup lang="ts">
/** 深色面板上的胶囊开关：轨道 34×18，滑块 14 圆点 */
defineProps<{
  label: string;
  disabled?: boolean;
}>();

const model = defineModel<boolean>({ required: true });
</script>

<template>
  <label class="switch" :class="{ 'is-on': model, 'is-disabled': disabled }">
    <input v-model="model" type="checkbox" :disabled="disabled" />
    <span class="switch__track" aria-hidden="true">
      <span class="switch__thumb"></span>
    </span>
    <span class="switch__label">{{ label }}</span>
  </label>
</template>

<style scoped>
.switch {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  font-size: 13px;
  color: rgba(231, 227, 220, 0.72);
  cursor: pointer;
  user-select: none;
}

.switch.is-disabled {
  cursor: not-allowed;
  color: rgba(231, 227, 220, 0.28);
}

.switch input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.switch__track {
  flex: 0 0 auto;
  width: 34px;
  height: 18px;
  padding: 2px;
  border-radius: 9px;
  background: #333;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
  transition: background 140ms ease, box-shadow 140ms ease;
}

.switch__thumb {
  display: block;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #8d8d8d;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  transition: transform 140ms ease, background 140ms ease;
}

.switch.is-on .switch__track {
  background: #b98d55;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.14);
}

.switch.is-on .switch__thumb {
  transform: translateX(16px);
  background: #f7f3ec;
}

.switch input:focus-visible + .switch__track {
  outline: 1px solid rgba(207, 164, 106, 0.75);
  outline-offset: 2px;
}
</style>
