<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { getEra } from '@/config';
import { formatYearShort } from '@/lib/format';
import { usePeopleStore, type PeopleSort } from '@/stores/people';
import { useTimelineStore } from '@/stores/timeline';
import { useUiStore } from '@/stores/ui';
import type { PersonIndexItem } from '@/types';

const ui = useUiStore();
const people = usePeopleStore();
const timeline = useTimelineStore();

const sorts: {
  id: PeopleSort;
  key: 'people.sort.birth' | 'people.sort.stages' | 'people.sort.name';
}[] = [
  { id: 'birth', key: 'people.sort.birth' },
  { id: 'stages', key: 'people.sort.stages' },
  { id: 'name', key: 'people.sort.name' },
];

const total = computed(() => people.index.length);

/** The "alive in this year" filter tracks the timeline, not a private field. */
watch(
  () => timeline.year,
  (year) => people.setAliveYear(year),
  { immediate: true },
);

onMounted(() => void people.ensureIndex());

function lifespan(person: PersonIndexItem): string {
  const born = person.birth === null ? '?' : formatYearShort(person.birth);
  if (person.death === null) return `${born}–`;
  return `${born}–${formatYearShort(person.death)}`;
}

function eraColor(person: PersonIndexItem): string {
  return getEra(person.birth ?? 0).color;
}
</script>

<template>
  <div class="wrap">
    <div class="head">
      <input
        v-model="people.query"
        class="search"
        type="search"
        :placeholder="ui.t('people.search')"
        :aria-label="ui.t('people.search')"
      />
      <div class="controls">
        <div class="sorts">
          <button
            v-for="s in sorts"
            :key="s.id"
            :class="{ on: people.sort === s.id }"
            @click="people.sort = s.id"
          >
            {{ ui.t(s.key) }}
          </button>
        </div>
        <label class="alive">
          <input v-model="people.aliveOnly" type="checkbox" />
          <span>{{ ui.t('people.aliveOnly') }}</span>
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
      <div v-if="people.eras.length" class="eras">
        <button :class="{ on: people.era === 'all' }" @click="people.era = 'all'">
          {{ ui.t('people.all') }}
        </button>
        <button
          v-for="e in people.eras"
          :key="e"
          :class="{ on: people.era === e }"
          @click="people.era = e"
        >
          {{ e }}
        </button>
      </div>
    </div>

    <div v-if="people.indexing" class="state">{{ ui.t('people.loading') }}</div>

    <ol v-else-if="people.filtered.length" class="list">
      <li
        v-for="person in people.filtered"
        :key="person.personId"
        :class="{ on: person.personId === people.selectedId }"
        @click="people.openPerson(person.personId)"
      >
        <span class="spine" :style="{ background: eraColor(person) }" />
        <span class="body">
          <span class="row">
            <span class="name">{{ person.name }}</span>
            <span class="span mono">{{ lifespan(person) }}</span>
          </span>
          <span class="meta">
            <span class="nat">{{ person.nationality || person.nationalityEn }}</span>
            <span class="stages mono">
              {{ person.totalPoints }} {{ ui.t('people.stages') }}
            </span>
          </span>
        </span>
      </li>
    </ol>

    <div v-else class="state">{{ ui.t('people.none') }}</div>

    <div class="foot">
      <span>{{ ui.t('panel.people') }}</span>
      <span class="mono">
        {{ people.filtered.length }} / {{ total }}
      </span>
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
.alive {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--ink-3);
  cursor: pointer;
}
.alive input {
  accent-color: var(--indigo);
}

.eras {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.eras button {
  font-size: 12px;
  padding: 2px 7px;
  color: var(--ink-3);
  border: 1px solid var(--rule);
}
.eras button.on {
  color: var(--card);
  background: var(--ink-3);
  border-color: var(--ink-3);
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
.row {
  display: flex;
  align-items: baseline;
  gap: 8px;
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
.span {
  margin-left: auto;
  flex: none;
  font-size: 11.5px;
  color: var(--ink-4);
}
.meta {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 12px;
  color: var(--ink-3);
}
.nat {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.stages {
  margin-left: auto;
  flex: none;
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
