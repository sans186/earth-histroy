<script setup lang="ts">
defineProps<{
  label: string;
  modelValue: boolean;
  disabled?: boolean;
  hint?: string;
}>();

const emit = defineEmits<{ 'update:modelValue': [boolean] }>();
</script>

<template>
  <label class="row" :class="{ off: disabled }">
    <input
      type="checkbox"
      :checked="modelValue"
      :disabled="disabled"
      @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
    />
    <span class="box" aria-hidden="true" />
    <span class="txt">{{ label }}</span>
    <span v-if="hint" class="hint">{{ hint }}</span>
  </label>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
  cursor: pointer;
}
.row.off {
  cursor: not-allowed;
  opacity: 0.45;
}
input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}
.box {
  width: 13px;
  height: 13px;
  flex: none;
  border: 1px solid var(--rule-3);
  background: var(--paper);
  position: relative;
  transition: background var(--dur) var(--ease), border-color var(--dur) var(--ease);
}
.row:hover .box {
  border-color: var(--ink-3);
}
input:checked + .box {
  background: var(--indigo);
  border-color: var(--indigo);
}
input:checked + .box::after {
  content: '';
  position: absolute;
  left: 3.5px;
  top: 0.5px;
  width: 4px;
  height: 8px;
  border: solid var(--card);
  border-width: 0 1.5px 1.5px 0;
  transform: rotate(42deg);
}
input:focus-visible + .box {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.txt {
  font-size: var(--fs-sm);
  color: var(--ink-2);
}
.hint {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.1em;
  color: var(--ink-4);
  text-transform: uppercase;
}
</style>
