<script setup lang="ts">
/**
 * The full-screen notice shown instead of the atlas on narrow touch screens.
 *
 * App decides when it applies; this component only renders the explanation,
 * because there is no partial interface worth offering to a touch device.
 */
import { useUiStore } from '@/stores/ui';

const ui = useUiStore();
</script>

<template>
  <div class="mobile-notice" role="alert">
    <div class="sheet">
      <h1 class="title">{{ ui.t('mobile.title') }}</h1>
      <p class="body">{{ ui.t('mobile.body') }}</p>
      <p class="threshold mono">{{ ui.t('mobile.threshold') }}</p>
    </div>
  </div>
</template>

<style scoped>
.mobile-notice {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
  padding: var(--sp-5);
  background: var(--paper);
  color: var(--ink);
  overflow: auto;
}
.sheet {
  width: min(420px, 100%);
  padding: var(--sp-6) var(--sp-5);
  border: 1px solid var(--rule-2);
  border-top: 3px solid var(--rust);
  background: var(--card);
  box-shadow: var(--shadow-1);
  text-align: center;
}
.title {
  font-family: var(--font-display);
  font-size: var(--fs-h2);
  font-weight: 600;
  line-height: 1.35;
}
.body {
  margin-top: var(--sp-3);
  font-size: var(--fs-sm);
  line-height: 1.7;
  color: var(--ink-2);
}
.threshold {
  margin-top: var(--sp-5);
  padding-top: var(--sp-3);
  border-top: 1px solid var(--rule);
  font-size: 11.5px;
  color: var(--ink-3);
  word-break: break-word;
}
</style>
