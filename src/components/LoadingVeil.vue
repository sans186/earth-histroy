<script setup lang="ts">
import { useUiStore } from '@/stores/ui';

const ui = useUiStore();
</script>

<template>
  <Transition name="veil">
    <div v-if="ui.loading" class="veil">
      <div class="inner">
        <span class="spinner" aria-hidden="true" />
        <div class="txt">
          <span class="label">{{ ui.t(ui.loadingLabel) }}</span>
          <span class="hint">{{ ui.t('loading.hint') }}</span>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.veil {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  background: var(--veil);
  backdrop-filter: blur(1.5px);
}
.inner {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 20px;
  border: 1px solid var(--rule-2);
  background: var(--card);
  box-shadow: var(--shadow-1);
}
.spinner {
  width: 14px;
  height: 14px;
  border: 1.5px solid var(--rule-2);
  border-top-color: var(--rust);
  border-radius: 50%;
  animation: spin 0.75s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.txt {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.label {
  font-size: var(--fs-sm);
  color: var(--ink);
}
.hint {
  font-size: 12.5px;
  color: var(--ink-3);
}
.veil-enter-active,
.veil-leave-active {
  transition: opacity 160ms var(--ease);
}
.veil-enter-from,
.veil-leave-to {
  opacity: 0;
}
</style>
