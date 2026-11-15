<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { CATEGORIES } from '@/config';
import { edgeLinksOf, parseEventRef, type EventEdgeLink, type EventRef } from '@/lib/eventLinks';
import { certaintyInfo, relationLabel, sourceTypeLabel, truncate } from '@/lib/format';
import { wikiSearchUrl } from '@/lib/wiki';
import { findEventById } from '@/services/data';
import { usePeopleStore } from '@/stores/people';
import { useUiStore } from '@/stores/ui';
import type { TimelineEvent } from '@/types';

const props = defineProps<{
  event: TimelineEvent;
  order: number;
  total: number;
}>();

const emit = defineEmits<{
  close: [];
  flyTo: [TimelineEvent];
  jumpToYear: [number];
  openRef: [EventRef];
}>();

const ui = useUiStore();
const people = usePeopleStore();
const expanded = ref(false);

const certain = computed(() => certaintyInfo(props.event.certainty, ui.locale));

/*
 * The year-level appraisal (documentation level, era context, historiographic
 * note, disconfirming evidence, coverage gaps) is deliberately NOT shown here.
 * It belongs to the year, not to the entry, and repeating it on every card made
 * an event look like it claimed the whole year's caveats. It now lives in the
 * year overview — see YearCard.vue.
 */

/**
 * Key figures are written as "name（role）"; only those with a shipped profile
 * become buttons. The index is ~100 KB and cached, so it is fetched once, and
 * only when the event actually names someone.
 */
const figureLinks = computed(() =>
  props.event.figures.slice(0, 8).map((raw) => ({
    raw,
    personId: people.indexLoaded ? (people.findByName(raw)?.personId ?? null) : null,
  })),
);

async function openFigure(raw: string) {
  await people.openByName(raw);
}

onMounted(() => {
  if (props.event.figures.length) void people.ensureIndex();
});

const category = computed(() => {
  const meta = CATEGORIES[props.event.category];
  return ui.locale === 'zh' ? meta.zh : meta.en;
});

const hasCoords = computed(() => props.event.lon !== null && props.event.lat !== null);

/**
 * Event profiles carry sources but no Wikipedia article title, so this is a
 * search rather than a citation — the UI says so.
 */
const wikiUrl = computed(() => (props.event.title ? wikiSearchUrl(props.event.title) : ''));

const coordText = computed(() => {
  if (!hasCoords.value) return ui.t('card.noCoord');
  const { lat, lon } = props.event;
  const ns = (lat as number) >= 0 ? 'N' : 'S';
  const ew = (lon as number) >= 0 ? 'E' : 'W';
  return `${Math.abs(lat as number).toFixed(2)}°${ns}  ${Math.abs(lon as number).toFixed(2)}°${ew}`;
});

const longText = computed(() => props.event.description.length > 190);
const shownText = computed(() =>
  expanded.value || !longText.value
    ? props.event.description
    : truncate(props.event.description, 190),
);

/** Cross references look like "1912-001（中华民国宣告成立）". */
const crossRefs = computed(() => props.event.crossReferences.map(parseEventRef));

const refsOpen = ref(false);
const refsShown = computed(() =>
  refsOpen.value ? crossRefs.value : crossRefs.value.slice(0, 6),
);

/**
 * Relation edges that touch this event, with the other end resolved to a title.
 *
 * A year file records edges in both directions and the other end may sit in a
 * different year, so each edge needs one lookup — cheap, because the window
 * around the open year is normally already in the event cache.
 */
const edges = ref<(EventEdgeLink & { title: string })[]>([]);

async function loadEdges() {
  const links = edgeLinksOf(props.event);
  if (!links.length) {
    edges.value = [];
    return;
  }
  const titled = await Promise.all(
    links.map(async (link) => {
      const doc = await findEventById(link.id, ui.locale);
      return { ...link, title: doc?.title ?? '' };
    }),
  );
  edges.value = titled.filter((link) => link.title);
}

watch(
  () => [props.event.key, ui.locale] as const,
  () => {
    void loadEdges();
  },
  { immediate: true },
);

function openRef(ref: EventRef) {
  emit('openRef', ref);
}
</script>

<template>
  <article class="card">
    <header>
      <div class="left">
        <span class="cap">
          {{ ui.t('card.plate') }} {{ String(props.order).padStart(2, '0') }} / {{ props.total }}
        </span>
        <h3 class="serif">{{ props.event.title }}</h3>
      </div>
      <button class="close" :aria-label="ui.t('card.close')" @click="emit('close')">✕</button>
    </header>

    <div class="meta">
      <span class="kv">
        <em>{{ ui.t('card.region') }}</em>{{ props.event.region || '—' }}
      </span>
      <span class="kv">
        <em>{{ ui.t('card.category') }}</em>
        <i class="dot" :style="{ background: `var(${CATEGORIES[props.event.category].cssVar})` }" />
        {{ category }}
      </span>
      <span class="kv">
        <em>{{ ui.t('card.coords') }}</em>
        <span class="mono">{{ coordText }}</span>
      </span>
    </div>

    <div class="cert" :class="certain.level">
      <span class="mark mono">{{ certain.mark }}</span>
      <span class="txt">
        <b>{{ certain.label }}</b>
        <template v-if="props.event.certaintyNote"> · {{ props.event.certaintyNote }}</template>
      </span>
    </div>

    <section v-if="props.event.description" class="desc">
      <h5 class="cap">{{ ui.t('card.desc') }}</h5>
      <p>{{ shownText }}</p>
      <button v-if="longText" class="more" @click="expanded = !expanded">
        {{ expanded ? ui.t('card.less') : ui.t('card.more') }}
      </button>
    </section>

    <section v-if="props.event.figures.length" class="figures">
      <h5 class="cap">
        {{ ui.t('card.figures') }}
        <em v-if="people.indexLoaded" class="hint">{{ ui.t('people.hint') }}</em>
      </h5>
      <div class="tags">
        <button
          v-for="f in figureLinks"
          :key="f.raw"
          class="tag"
          :class="{ linked: !!f.personId }"
          :disabled="!f.personId"
          :title="f.personId ? ui.t('people.hint') : ui.t('people.notFound')"
          @click="openFigure(f.raw)"
        >
          {{ f.raw }}
        </button>
      </div>
    </section>

    <section class="sources">
      <h5 class="cap">{{ ui.t('card.sources') }}</h5>
      <p class="lin-hint">{{ ui.t('card.sources.hint') }}</p>
      <ol v-if="props.event.sources.length">
        <li v-for="(s, i) in props.event.sources" :key="i">
          <span class="n mono">{{ i + 1 }}</span>
          <span class="s-body">
            <span class="nm">{{ s.name || '—' }}</span>
            <span class="ty">
              <b :class="sourceTypeLabel(s.type, ui.locale).tier">
                {{ sourceTypeLabel(s.type, ui.locale).label }}
              </b>
              <b v-if="s.contemporary" class="primary">{{ ui.t('card.contemporary') }}</b>
            </span>
          </span>
        </li>
      </ol>
      <p v-else class="none">{{ ui.t('card.noSources') }}</p>
    </section>

    <section v-if="crossRefs.length" class="xref">
      <h5 class="cap">
        {{ ui.t('card.crossRef') }}
        <em class="hint">{{ ui.t('card.crossRefHint') }}</em>
      </h5>
      <div class="links">
        <button
          v-for="ref in refsShown"
          :key="ref.raw"
          :disabled="!ref.id && ref.year === null"
          @click="openRef(ref)"
        >
          <span class="mono" v-if="ref.year !== null">{{ ref.year }}</span>
          {{ truncate(ref.title, 26) }}
        </button>
      </div>
      <button v-if="crossRefs.length > 6" class="more" @click="refsOpen = !refsOpen">
        {{ refsOpen ? ui.t('card.less') : ui.t('card.more') }}
      </button>
    </section>

    <section v-if="edges.length" class="xref relations">
      <h5 class="cap">{{ ui.t('card.relations') }}</h5>
      <ul>
        <li v-for="edge in edges" :key="`${edge.id}:${edge.relation}`">
          <span class="rel">{{ relationLabel(edge.relation, ui.locale) }}</span>
          <button
            class="to"
            @click="openRef({ raw: edge.id, id: edge.id, year: edge.year, title: edge.title })"
          >
            {{ edge.title }}
          </button>
          <span v-if="edge.note" class="note">{{ truncate(edge.note, 46) }}</span>
        </li>
      </ul>
    </section>

    <p class="disclaimer">{{ ui.t('card.aiNotice') }}</p>

    <footer>
      <button class="primary" :disabled="!hasCoords" @click="emit('flyTo', props.event)">
        {{ ui.t('card.flyTo') }}
      </button>
      <a
        v-if="wikiUrl"
        class="ghost"
        :href="wikiUrl"
        target="_blank"
        rel="noopener noreferrer"
      >
        {{ ui.t('card.wikiSearch') }} ↗
      </a>
    </footer>
  </article>
</template>

<style scoped>
.card {
  position: absolute;
  left: 22px;
  bottom: 22px;
  /*
   * Wider than the old 396px, because the card no longer gives each block its
   * own scrollbar — long text now reads down one column instead of three
   * cramped ones.
   *
   * One scroll region, on the card itself, with a sticky header and footer.
   * The previous layout put `overflow: auto` on every section, which capped
   * each block at a few visible lines and left the reader scrolling four
   * nested panes to read one entry.
   */
  width: 520px;
  max-height: calc(100% - 44px);
  overflow-y: auto;
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
  background: var(--card);
  border: 1px solid var(--rule-2);
  box-shadow: var(--shadow-2);
  z-index: 14;
  animation: rise 200ms var(--ease);
}
@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}

header {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px 11px;
  border-bottom: 1px solid var(--rule);
  background: var(--card);
}
header .left {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}
header h3 {
  font-size: 19.5px;
  line-height: 1.32;
}
.close {
  margin-left: auto;
  color: var(--ink-3);
  font-size: 14.5px;
  line-height: 1;
  padding: 3px;
}
.close:hover {
  color: var(--rust);
}

.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--rule);
}
.kv {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13.5px;
  color: var(--ink-2);
}
.kv em {
  font-style: normal;
  font-size: 11.5px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--ink-4);
}
.dot {
  width: 7px;
  height: 7px;
  display: block;
}

.cert {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 9px 16px;
  border-bottom: 1px solid var(--rule);
  background: var(--paper-2);
}
.cert .mark {
  flex: none;
  width: 17px;
  height: 17px;
  display: grid;
  place-items: center;
  font-size: 11.5px;
  border: 1px solid var(--rule-3);
  color: var(--ink-2);
}
.cert.high .mark {
  border-color: var(--indigo);
  color: var(--indigo);
  background: var(--indigo-soft);
}
.cert.mid .mark {
  border-color: var(--ochre);
  color: var(--ochre);
}
.cert.low .mark {
  border-color: var(--rust);
  color: var(--rust);
  background: var(--rust-soft);
}
.cert .txt {
  font-size: 13px;
  line-height: 1.6;
  color: var(--ink-2);
}
.cert .txt b {
  font-weight: 500;
  color: var(--ink);
}

/* No `overflow` here on purpose: the card is the one scroll region. */
section {
  padding: 11px 16px;
  border-bottom: 1px solid var(--rule);
}
section h5 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 7px;
}
section p {
  font-size: var(--fs-sm);
  line-height: 1.85;
  color: var(--ink-2);
  text-align: justify;
}
.more {
  margin-top: 6px;
  font-size: 12.5px;
  color: var(--rust);
  letter-spacing: 0.08em;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.tags .tag {
  font-size: 12.5px;
  color: var(--ink-2);
  border: 1px solid var(--rule-2);
  padding: 2px 7px;
  background: transparent;
  text-align: left;
}
.tags .tag.linked {
  color: var(--indigo);
  border-color: var(--indigo);
  border-style: dotted;
}
.tags .tag.linked:hover {
  background: var(--indigo-soft);
}
.tags .tag:disabled {
  cursor: default;
}
.hint {
  font-style: normal;
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: none;
  color: var(--ink-4);
  margin-left: auto;
}

ol {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
ol li {
  display: grid;
  grid-template-columns: 16px 1fr;
  gap: 8px;
}
ol .n {
  font-size: 11.5px;
  color: var(--rust);
  padding-top: 2px;
}
.s-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.nm {
  font-size: 13.5px;
  line-height: 1.5;
  color: var(--ink-2);
}
.ty {
  display: flex;
  gap: 8px;
  font-size: 11.5px;
  letter-spacing: 0.08em;
  color: var(--ink-4);
}
.ty b {
  font-weight: 500;
}
.ty b.primary {
  color: var(--rust);
}
.ty b.secondary {
  color: var(--indigo);
}
.ty b.later {
  color: var(--ink-4);
}
.none {
  font-size: 13px;
  color: var(--ink-4);
}

.links {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;
}
.links button {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--indigo);
  border-bottom: 1px dotted var(--rule-2);
  padding-bottom: 1px;
  text-align: left;
}
.links button:disabled {
  color: var(--ink-4);
  border-bottom-color: var(--rule);
  cursor: default;
}
.links button .mono {
  font-size: 11.5px;
  color: var(--ink-4);
}

/* Relation edges recorded for the year, filtered down to the open event. */
.relations ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.relations li {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 8px;
  padding-left: 9px;
  border-left: 2px solid var(--rule-2);
}
.relations .rel {
  font-size: 11px;
  letter-spacing: 0.1em;
  color: var(--rust);
}
.relations .to {
  font-size: 13px;
  color: var(--indigo);
  border-bottom: 1px dotted var(--rule-2);
  padding-bottom: 1px;
  text-align: left;
}
.relations .note {
  flex: 1 0 100%;
  font-size: 12px;
  line-height: 1.6;
  color: var(--ink-3);
}

.lin-hint {
  font-size: 12px;
  line-height: 1.65;
  color: var(--ink-4);
  margin-bottom: 8px;
}

.disclaimer {
  padding: 9px 16px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--ink-4);
  border-bottom: 1px solid var(--rule);
  background: var(--paper);
}

footer {
  position: sticky;
  bottom: 0;
  z-index: 2;
  padding: 11px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: var(--card);
  border-top: 1px solid var(--rule);
}
footer .ghost {
  display: block;
  width: 100%;
  padding: 6px 10px;
  text-align: center;
  text-decoration: none;
  border: 1px solid var(--rule-2);
  font-size: 13px;
  color: var(--ink-2);
}
footer .ghost:hover {
  border-color: var(--rule-3);
  color: var(--ink);
}
.primary {
  border: 1px solid var(--ink);
  background: var(--ink);
  color: var(--card);
  padding: 6px 15px;
  font-size: var(--fs-sm);
  letter-spacing: 0.06em;
}
.primary:disabled {
  background: transparent;
  color: var(--ink-4);
  border-color: var(--rule-2);
  cursor: not-allowed;
}
</style>
