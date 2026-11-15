<script setup lang="ts">
import { computed } from 'vue';
import { getEra } from '@/config';
import { useUiStore } from '@/stores/ui';
import { useWarsStore, type WarSort } from '@/stores/wars';
import type { WarIndexItem } from '@/types';

const ui = useUiStore();
const wars = useWarsStore();

const sorts: { id: WarSort; key: 'war.sort.start' | 'war.sort.battles' | 'war.sort.name' }[] = [
  { id: 'start', key: 'war.sort.start' },
  { id: 'battles', key: 'war.sort.battles' },
  { id: 'name', key: 'war.sort.name' },
];

const total = computed(() => wars.index.length);

function eraColor(war: WarIndexItem) {
  return getEra(war.startYear ?? 0).color;
}

function span(war: WarIndexItem) {
  const from = war.startYear;
  const to = war.endYear;
  const fmt = (v?: number) => (v === undefined || v === null ? '?' : v < 0 ? `${-v}BC` : `${v}`);
  if (from === undefined || from === null) return '—';
  if (from === to) return fmt(from);
  return `${fmt(from)}–${fmt(to)}`;
}

defineExpose({ select: (id: string) => wars.select(id) });
</script>

<template>
  <div class="wrap">
    <div class="head">
      <input
        v-model="wars.query"
        class="search"
        type="search"
        :placeholder="ui.t('war.search')"
        :aria-label="ui.t('war.search')"
      />
      <div class="controls">
        <div class="sorts">
          <button
            v-for="s in sorts"
            :key="s.id"
            :class="{ on: wars.sort === s.id }"
            @click="wars.sort = s.id"
          >
            {{ ui.t(s.key) }}
          </button>
        </div>
        <label class="near">
          <input v-model="wars.onlyNearYear" type="checkbox" />
          <span>{{ ui.t('war.near') }}</span>
        </label>
      </div>
      <button
        v-if="ui.polityScope"
        class="scope-chip"
        :class="{ on: ui.scopeToPolity }"
        :title="ui.t('filter.polityHint')"
        @click="ui.toggleScopeToPolity()"
      >
        <i v-if="ui.scopeToPolity">✓</i>
        <span>{{ ui.t('filter.polity') }} · {{ ui.polityScope.label }}</span>
      </button>
    </div>

    <div v-if="wars.loadingIndex" class="state">{{ ui.t('loading.wars') }}</div>

    <ol v-else-if="wars.filtered.length" class="list">
      <li
        v-for="war in wars.filtered"
        :key="war.warId"
        :class="{ on: war.warId === wars.selectedId }"
        @click="wars.select(war.warId)"
      >
        <span class="spine" :style="{ background: eraColor(war) }" />
        <span class="body">
          <span class="name">{{ war.name }}</span>
          <span class="meta">
            <span class="span mono">{{ span(war) }}</span>
            <span v-if="war.category" class="cat">{{ war.category }}</span>
            <span v-if="war.totalBattles" class="bat mono">
              {{ war.totalBattles }} {{ ui.t('war.battleUnit') }}
            </span>
          </span>
        </span>
      </li>
    </ol>

    <div v-else class="state">{{ ui.t('war.none') }}</div>

    <div class="foot">
      <span>{{ ui.t('war.title') }}</span>
      <span class="mono">{{ wars.filtered.length }} / {{ total }}</span>
    </div>
  </div>
</template>

<style scoped>
.wrap {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}

.head {
  padding: 12px 14px 10px;
  border-bottom: 1px solid var(--rule-2);
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.search {
  width: 100%;
  border: 1px solid var(--rule-2);
  background: var(--card);
  padding: 6px 9px;
  font-size: var(--fs-sm);
}
.search::placeholder {
  color: var(--ink-4);
}
.controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.sorts {
  display: flex;
  border: 1px solid var(--rule);
}
.sorts button {
  padding: 3px 8px;
  font-size: 12px;
  color: var(--ink-3);
  border-right: 1px solid var(--rule);
}
.sorts button:last-child {
  border-right: 0;
}
.sorts button.on {
  background: var(--indigo);
  color: var(--card);
}
.near {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--ink-3);
  cursor: pointer;
}
.near input {
  accent-color: var(--indigo);
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow: auto;
  flex: 1;
}
.list li {
  display: grid;
  grid-template-columns: 3px 1fr;
  gap: 10px;
  padding: 9px 14px 9px 0;
  border-bottom: 1px solid var(--rule);
  cursor: pointer;
}
.list li:hover {
  background: var(--paper-2);
}
.list li.on {
  background: var(--card);
}
.spine {
  width: 3px;
  display: block;
}
.body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.name {
  font-family: var(--font-display);
  font-size: 13.5px;
  line-height: 1.4;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.meta {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 12px;
  color: var(--ink-3);
}
.span {
  color: var(--ink-4);
}
.cat {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bat {
  margin-left: auto;
  color: var(--ink-4);
}

.state {
  flex: 1;
  display: grid;
  place-items: center;
  padding: 30px 20px;
  font-size: var(--fs-sm);
  color: var(--ink-4);
  text-align: center;
}

.foot {
  display: flex;
  justify-content: space-between;
  padding: 8px 18px;
  border-top: 1px solid var(--rule-2);
  font-size: 11.5px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ink-4);
}
</style>
