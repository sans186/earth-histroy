<script setup lang="ts">
/**
 * Site-wide search palette.
 *
 * The index is fetched only when the panel first opens, so the initial map
 * paint is untouched. Results are grouped by kind and fully keyboard driven:
 * ↑/↓ move, Enter opens, Esc closes. Opening a result is delegated to App,
 * which reuses the same handlers as the side panel and the map.
 */
import { computed, nextTick, ref, watch } from 'vue';
import { formatYearCompact } from '@/lib/format';
import type { MessageKey } from '@/lib/i18n';
import {
  groupHits,
  searchItems,
  type SearchHit,
  type SearchIndexData,
  type SearchKind,
} from '@/lib/search';
import { loadSearchIndex } from '@/services/search';
import { useUiStore } from '@/stores/ui';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: []; select: [hit: SearchHit] }>();

const ui = useUiStore();

const query = ref('');
const index = ref<SearchIndexData | null>(null);
const hits = ref<SearchHit[]>([]);
const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle');
const active = ref(0);
const input = ref<HTMLInputElement | null>(null);
const panel = ref<HTMLElement | null>(null);

const RESULTS_ID = 'search-results';
const optionId = (index: number) => `search-option-${index}`;

const KIND_KEY: Record<SearchKind, MessageKey> = {
  event: 'search.kind.event',
  person: 'search.kind.person',
  war: 'search.kind.war',
  polity: 'search.kind.polity',
};

/** Groups in display order, each row carrying its flat keyboard index. */
const groups = computed(() => {
  let offset = 0;
  return groupHits(hits.value).map((group) => ({
    kind: group.kind,
    items: group.hits.map((hit) => ({ hit, index: offset++ })),
  }));
});

const flat = computed(() => groups.value.flatMap((group) => group.items.map((entry) => entry.hit)));

const activeDescendant = computed(() =>
  flat.value.length ? optionId(active.value) : undefined,
);

async function ensureIndex() {
  if (index.value || status.value === 'loading') return;
  status.value = 'loading';
  try {
    index.value = await loadSearchIndex();
    status.value = 'ready';
  } catch {
    status.value = 'error';
  }
}

function retry() {
  status.value = 'idle';
  void ensureIndex();
}

function choose(hit: SearchHit | undefined) {
  if (hit) emit('select', hit);
}

function move(delta: number) {
  const count = flat.value.length;
  if (!count) return;
  active.value = (active.value + delta + count) % count;
}

/**
 * Keep Tab inside the modal.
 *
 * Only the edges are intercepted, so the browser's natural order still runs
 * between the query field, the close button and the retry action.
 */
function trapTab(event: KeyboardEvent) {
  const root = panel.value;
  if (!root) return;
  const items = Array.from(
    root.querySelectorAll<HTMLElement>(
      'button:not([disabled]):not([tabindex="-1"]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => el.offsetParent !== null);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  const current = document.activeElement as HTMLElement | null;
  if (!event.shiftKey && (current === last || !root.contains(current))) {
    event.preventDefault();
    first.focus();
  } else if (event.shiftKey && (current === first || !root.contains(current))) {
    event.preventDefault();
    last.focus();
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault();
    emit('close');
  } else if (event.key === 'Tab') {
    trapTab(event);
  } else if (event.key === 'ArrowDown') {
    event.preventDefault();
    move(1);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    move(-1);
  } else if (event.key === 'Enter') {
    event.preventDefault();
    choose(flat.value[active.value]);
  }
}

watch(
  () => props.open,
  async (open) => {
    if (!open) {
      await nextTick();
      document.querySelector<HTMLElement>('[data-search-trigger]')?.focus();
      return;
    }
    query.value = '';
    hits.value = [];
    active.value = 0;
    void ensureIndex();
    await nextTick();
    input.value?.focus();
  },
);

watch([query, index], () => {
  hits.value = index.value ? searchItems(index.value, query.value, 60) : [];
  active.value = 0;
});

function primaryName(hit: SearchHit): string {
  const { zh, en } = hit.item;
  return ui.locale === 'zh' ? zh || en : en || zh;
}

function secondaryName(hit: SearchHit): string {
  const { zh, en } = hit.item;
  return ui.locale === 'zh' ? en : zh;
}

function yearText(hit: SearchHit): string {
  return hit.item.year === null ? '' : formatYearCompact(hit.item.year, ui.locale);
}
</script>

<template>
  <Transition name="search">
    <div v-if="open" class="veil" @pointerdown.self="emit('close')">
      <section
        ref="panel"
        class="panel"
        role="dialog"
        aria-modal="true"
        :aria-label="ui.t('search.title')"
        @keydown="onKeydown"
      >
        <header class="head">
          <h2>{{ ui.t('search.title') }}</h2>
          <button
            class="x"
            :title="ui.t('search.close')"
            :aria-label="ui.t('search.close')"
            @click="emit('close')"
          >
            ×
          </button>
        </header>

        <input
          ref="input"
          v-model="query"
          class="input"
          type="search"
          autocomplete="off"
          spellcheck="false"
          :placeholder="ui.t('search.placeholder')"
          :aria-label="ui.t('search.placeholder')"
          :aria-controls="RESULTS_ID"
          :aria-activedescendant="activeDescendant"
        />

        <p v-if="status === 'loading'" class="state">{{ ui.t('search.loading') }}</p>
        <div v-else-if="status === 'error'" class="state">
          <span>{{ ui.t('search.error') }}</span>
          <button class="retry" @click="retry">{{ ui.t('search.retry') }}</button>
        </div>
        <p v-else-if="!query.trim()" class="state">{{ ui.t('search.empty') }}</p>
        <p v-else-if="!flat.length" class="state">{{ ui.t('search.none') }}</p>

        <div v-else :id="RESULTS_ID" class="results" role="listbox" :aria-label="ui.t('search.title')">
          <section
            v-for="group in groups"
            :key="group.kind"
            class="group"
            role="group"
            :aria-labelledby="`search-group-${group.kind}`"
          >
            <h3 :id="`search-group-${group.kind}`" class="cap">{{ ui.t(KIND_KEY[group.kind]) }}</h3>
            <button
              v-for="entry in group.items"
              :id="optionId(entry.index)"
              :key="entry.hit.item.id"
              class="row"
              role="option"
              tabindex="-1"
              :aria-selected="entry.index === active"
              :class="{ on: entry.index === active }"
              @pointermove="active = entry.index"
              @click="choose(entry.hit)"
            >
              <span class="name">{{ primaryName(entry.hit) }}</span>
              <span class="meta">
                <span v-if="secondaryName(entry.hit)" class="alt">
                  {{ secondaryName(entry.hit) }}
                </span>
                <span v-if="yearText(entry.hit)" class="mono">{{ yearText(entry.hit) }}</span>
              </span>
            </button>
          </section>
        </div>

        <footer class="hint cap">{{ ui.t('search.hint') }}</footer>
      </section>
    </div>
  </Transition>
</template>

<style scoped>
.veil {
  position: fixed;
  inset: var(--head-h) 0 0 0;
  z-index: 45;
  background: rgba(26, 28, 32, 0.18);
}

.panel {
  position: absolute;
  top: 12px;
  right: 22px;
  width: 540px;
  max-width: calc(100% - 44px);
  max-height: min(72vh, 640px);
  display: flex;
  flex-direction: column;
  background: var(--card);
  border: 1px solid var(--rule-2);
  box-shadow: var(--shadow-2);
}

.head {
  display: flex;
  align-items: baseline;
  gap: 9px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--rule-2);
  background: var(--paper);
  flex: none;
}
.head h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.06em;
}
.x {
  margin-left: auto;
  font-size: 18px;
  line-height: 1;
  color: var(--ink-3);
  padding: 2px 4px;
}
.x:hover {
  color: var(--ink);
}

.input {
  flex: none;
  margin: 12px 16px 8px;
  padding: 7px 10px;
  font-size: var(--fs-sm);
  color: var(--ink);
  background: var(--paper);
  border: 1px solid var(--rule-2);
}
.input:focus {
  outline: none;
  border-color: var(--rust);
}
.input::-webkit-search-cancel-button {
  cursor: pointer;
}

.state {
  margin: 8px 16px 16px;
  color: var(--ink-3);
  font-size: var(--fs-sm);
  display: flex;
  align-items: center;
  gap: 10px;
}
.retry {
  font-size: var(--fs-sm);
  color: var(--rust);
  border-bottom: 1px solid currentColor;
}

.results {
  overflow-y: auto;
  padding: 0 8px 8px;
}
.group {
  padding-top: 6px;
}
.group h3 {
  margin: 4px 8px 2px;
}
.row {
  width: 100%;
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 5px 8px;
  text-align: left;
  border-left: 2px solid transparent;
  transition: background var(--dur) var(--ease), border-color var(--dur) var(--ease);
}
.row:hover,
.row.on {
  background: var(--paper);
  border-left-color: var(--rust);
}
.name {
  font-size: var(--fs-sm);
  color: var(--ink);
  flex: none;
  max-width: 60%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.meta {
  margin-left: auto;
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}
.alt {
  color: var(--ink-3);
  font-size: 11.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mono {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--ink-4);
  flex: none;
}

.hint {
  flex: none;
  padding: 7px 16px;
  border-top: 1px solid var(--rule-2);
  background: var(--paper);
  color: var(--ink-4);
  text-align: right;
}

.search-enter-active,
.search-leave-active {
  transition: opacity var(--dur) var(--ease);
}
.search-enter-from,
.search-leave-to {
  opacity: 0;
}
</style>
