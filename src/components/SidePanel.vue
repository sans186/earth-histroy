<script setup lang="ts">
import { ref } from 'vue';
import { usePeopleStore } from '@/stores/people';
import { useUiStore } from '@/stores/ui';
import { useWarsStore } from '@/stores/wars';
import type { TimelineEvent } from '@/types';
import EventIndex from './EventIndex.vue';
import LayerPanel from './LayerPanel.vue';
import PeoplePanel from './PeoplePanel.vue';
import WarPanel from './WarPanel.vue';

const props = defineProps<{
  events: TimelineEvent[];
  totalBeforeFilter: number;
}>();

const emit = defineEmits<{
  select: [TimelineEvent];
  openYear: [];
  collapse: [];
}>();

const ui = useUiStore();
const wars = useWarsStore();
const people = usePeopleStore();

type Tab = 'index' | 'wars' | 'people' | 'layers';
const tab = ref<Tab>('index');

/** Both indexes are small; fetch each once, on first use of its tab. */
function openTab(next: Tab) {
  tab.value = next;
  if (next === 'wars') void wars.ensureIndex();
  if (next === 'people') void people.ensureIndex();
}
</script>

<template>
  <aside class="panel">
    <div class="tabs">
      <button :class="{ on: tab === 'index' }" @click="openTab('index')">
        {{ ui.t('panel.index') }}
      </button>
      <button :class="{ on: tab === 'wars' }" @click="openTab('wars')">
        {{ ui.t('war.title') }}
      </button>
      <button :class="{ on: tab === 'people' }" @click="openTab('people')">
        {{ ui.t('panel.people') }}
      </button>
      <button :class="{ on: tab === 'layers' }" @click="openTab('layers')">
        {{ ui.t('panel.layers') }}
      </button>
      <button
        class="collapse"
        :title="ui.t('panel.collapse')"
        :aria-label="ui.t('panel.collapse')"
        @click="emit('collapse')"
      >
        ›
      </button>
    </div>
    <div class="body">
      <EventIndex
        v-show="tab === 'index'"
        :events="props.events"
        :total-before-filter="props.totalBeforeFilter"
        @select="emit('select', $event)"
        @open-year="emit('openYear')"
      />
      <WarPanel v-show="tab === 'wars'" />
      <PeoplePanel v-show="tab === 'people'" />
      <LayerPanel v-show="tab === 'layers'" />
    </div>
  </aside>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-left: 1px solid var(--rule-2);
  background: var(--paper-2);
}
.tabs {
  display: flex;
  border-bottom: 1px solid var(--rule-2);
  background: var(--paper);
  flex: none;
}
.tabs button {
  flex: 1;
  padding: 9px 0;
  font-size: 12.5px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ink-3);
  border-bottom: 2px solid transparent;
}
.tabs button:hover {
  color: var(--ink-2);
}
.tabs button.on {
  color: var(--ink);
  border-bottom-color: var(--rust);
  background: var(--paper-2);
}
/* Kept out of the equal-width row: it is an affordance, not a tab. */
.tabs .collapse {
  flex: none;
  width: 24px;
  font-size: 14.5px;
  letter-spacing: 0;
  color: var(--ink-3);
  border-left: 1px solid var(--rule-2);
}
.tabs .collapse:hover {
  color: var(--ink);
  background: var(--paper-2);
}
.body {
  flex: 1;
  min-height: 0;
  display: flex;
}
.body > * {
  flex: 1;
  min-width: 0;
}
</style>
