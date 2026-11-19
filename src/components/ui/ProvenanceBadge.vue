<script setup lang="ts">
import type { DisputeLevel, EvidenceLevel } from '@/lib/provenance';
import { useUiStore } from '@/stores/ui';

defineProps<{
  evidence: EvidenceLevel;
  dispute: DisputeLevel;
}>();

const ui = useUiStore();
</script>

<template>
  <div class="prov">
    <span class="tag">{{ ui.t('prov.ai') }}</span>
    <span class="tag unv">{{ ui.t('prov.unverified') }}</span>
    <span class="level mono">
      {{ ui.t('prov.evidence') }} {{ evidence }} · {{ ui.t('prov.dispute') }} {{ dispute }}
    </span>
    <details>
      <summary>{{ ui.t('prov.levels') }}</summary>
      <ul>
        <li>{{ ui.t('prov.r0') }}</li>
        <li>{{ ui.t('prov.r1') }}</li>
        <li>{{ ui.t('prov.r2') }}</li>
        <li>{{ ui.t('prov.r3') }}</li>
        <li>{{ ui.t('prov.c0') }}</li>
        <li>{{ ui.t('prov.c1') }}</li>
        <li>{{ ui.t('prov.c2') }}</li>
        <li>{{ ui.t('prov.c3') }}</li>
      </ul>
    </details>
  </div>
</template>

<style scoped>
.prov {
  flex: 1 0 100%;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.tag {
  padding: 1px 5px;
  font-family: var(--font-mono);
  font-size: 10.5px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-3);
  border: 1px solid var(--rule-3);
}
.tag.unv {
  color: var(--rust);
  border-color: currentColor;
}
.level {
  font-size: 11.5px;
  letter-spacing: 0.08em;
  color: var(--ink-4);
}
details {
  flex: 1 0 100%;
}
summary {
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--ink-4);
}
summary:hover {
  color: var(--ink-2);
}
ul {
  list-style: none;
  margin: 6px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--ink-3);
}
</style>
