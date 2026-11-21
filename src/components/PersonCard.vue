<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { formatYearShort, truncate } from '@/lib/format';
import { APPRAISAL_STANCES, isLivingPerson } from '@/lib/provenance';
import { wikiSearchUrl } from '@/lib/wiki';
import { personImageUrl } from '@/services/people-images';
import { usePeopleStore } from '@/stores/people';
import { useUiStore } from '@/stores/ui';
import type { LocalisedText, PersonPoint, PersonProfile, QuoteSource } from '@/types';

const emit = defineEmits<{
  close: [];
  flyTo: [{ lon: number; lat: number }];
  openTrail: [];
}>();

const ui = useUiStore();
const people = usePeopleStore();

const openStages = ref<Set<number>>(new Set());
const evidenceOpen = ref(false);

const profile = computed(() => people.profile);

/**
 * Portrait, when the image dataset has one.
 *
 * Kept out of the profile JSON: portraits are optional enrichment, and a card
 * must render its text whether or not a photo exists.
 */
const portrait = ref<string | null>(null);
watch(
  () => profile.value?.personId,
  async (id) => {
    portrait.value = null;
    portrait.value = await personImageUrl(id);
  },
  { immediate: true },
);

/**
 * Person profiles carry no Wikipedia article title, so this is a search on the
 * Chinese edition — the Chinese name is what the card already shows and what a
 * reader would otherwise type in themselves.
 */
const wikiUrl = computed(() => (profile.value?.name ? wikiSearchUrl(profile.value.name) : ''));

/** A new person resets the reading state — otherwise open stages look stale. */
watch(
  () => people.selectedId,
  () => {
    openStages.value = new Set();
    evidenceOpen.value = false;
  },
);

function localized(value?: LocalisedText): string {
  if (!value) return '';
  const preferred = ui.locale === 'zh' ? value.zh : value.en;
  return preferred || value.zh || value.en || '';
}

const living = computed(() => isLivingPerson(profile.value));

/**
 * Living people keep only the factual timeline. Everyone else reads one
 * pre-written paragraph: the three stances were merged offline, so there is no
 * stance label left on the card.
 */
const appraisalText = computed(() =>
  living.value ? '' : localized(profile.value?.evaluation?.appraisal),
);

const selfQuote = computed(() => (living.value ? '' : localized(profile.value?.quotes?.self)));

/** A quote either carries a citation or admits that one is still missing. */
const selfSource = computed(() => (living.value ? null : profile.value?.quotes?.sources?.self ?? null));

function sourceLabel(source: QuoteSource): string {
  const key = source.paraphrase ? 'people.quoteParaphrase' : 'people.quoteSource';
  return ui.t(key).replace('{text}', source.text);
}

interface EvidenceRow {
  label: string;
  url?: string;
}

function toEvidenceRow(value: unknown): EvidenceRow | null {
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return null;
    return /^https?:\/\//i.test(text) ? { label: text, url: text } : { label: text };
  }
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const title = typeof record.title === 'string' ? record.title : typeof record.name === 'string' ? record.name : '';
  const url = typeof record.url === 'string' ? record.url.trim() : '';
  if (!title && !url) return null;
  return url ? { label: title || url, url } : { label: title };
}

/**
 * Profile-level sources first, then the per-stance lists the schema already
 * reserves. The shipped profiles carry none, so the panel honestly says so
 * instead of rendering an empty list.
 */
const evidenceRows = computed<EvidenceRow[]>(() => {
  const person = profile.value as (PersonProfile & { sources?: unknown }) | null;
  if (!person) return [];
  const rows: EvidenceRow[] = [];
  const collect = (list: unknown) => {
    if (!Array.isArray(list)) return;
    for (const item of list) {
      const row = toEvidenceRow(item);
      if (row) rows.push(row);
    }
  };
  collect(person.sources);
  const perStance = person.evaluation?.sources;
  if (perStance) {
    for (const stance of APPRAISAL_STANCES) collect(perStance[stance]);
  }
  return rows;
});

const basisLabel = computed(() => {
  const count = evidenceRows.value.length;
  return count
    ? ui.t('people.basisSources').replace('{n}', String(count))
    : ui.t('people.basisModel');
});

/** Bare dates only — the row supplies the "lifespan" label. */
const lifespan = computed(() => {
  const p = profile.value;
  if (!p) return '';
  const born = p.birth === null ? ui.t('people.unknown') : formatYearShort(p.birth);
  if (p.death === null) {
    return living.value ? `${born} · ${ui.t('people.alive')}` : `${born} ·`;
  }
  return `${born} · ${formatYearShort(p.death)}`;
});

function pointTitle(point: PersonPoint): string {
  return ui.locale === 'zh' ? point.title : point.titleEn || point.title;
}

function pointPlace(point: PersonPoint): string {
  return ui.locale === 'zh' ? point.place : point.placeEn || point.place;
}

function pointText(point: PersonPoint): string {
  return ui.locale === 'zh' ? point.description : point.descriptionEn || point.description;
}

function pointYears(point: PersonPoint): string {
  if (point.yearEnd === null || point.yearEnd === point.year) return formatYearShort(point.year);
  return `${formatYearShort(point.year)}–${formatYearShort(point.yearEnd)}`;
}

function toggleStage(index: number) {
  const next = new Set(openStages.value);
  if (next.has(index)) next.delete(index);
  else next.add(index);
  openStages.value = next;
}

function isLong(text: string): boolean {
  return text.length > 150;
}

function flyToPoint(point: PersonPoint) {
  if (!point.coords) return;
  emit('flyTo', { lon: point.coords[0], lat: point.coords[1] });
}
</script>

<template>
  <article class="card">
    <header>
      <img
        v-if="portrait"
        class="portrait"
        :src="portrait"
        :alt="profile?.name ?? ''"
        referrerpolicy="no-referrer"
        @error="portrait = null"
      />
      <div class="left">
        <span class="cap">{{ ui.t('panel.people') }}</span>
        <h3 class="serif">{{ profile?.name ?? '—' }}</h3>
        <span v-if="profile?.nameEn" class="en">{{ profile.nameEn }}</span>
      </div>
      <button class="close" :aria-label="ui.t('card.close')" @click="emit('close')">✕</button>
    </header>

    <div v-if="profile" class="meta">
      <span class="kv">
        <em>{{ ui.t('card.region') }}</em>
        {{ ui.locale === 'zh' ? profile.nationality : profile.nationalityEn || profile.nationality || '—' }}
      </span>
      <span class="kv">
        <em>{{ ui.t('people.lifespan') }}</em>
        <span class="mono">{{ lifespan }}</span>
      </span>
      <span class="meta-end">
        <span v-if="living" class="living-hint">{{ ui.t('people.livingHint') }}</span>
        <button
          type="button"
          class="basis"
          :class="{ 'basis-none': !evidenceRows.length }"
          :aria-expanded="evidenceOpen"
          @click="evidenceOpen = !evidenceOpen"
        >
          {{ basisLabel }}<span class="chev" aria-hidden="true">›</span>
        </button>
      </span>
    </div>

    <button v-if="profile" type="button" class="trail" @click="emit('openTrail')">
      <span class="trail-mark" aria-hidden="true">◎</span>
      <span class="trail-label">{{ ui.t('trail.open') }}</span>
      <span class="trail-hint">{{ ui.t('trail.openHint') }}</span>
      <span class="trail-chev" aria-hidden="true">›</span>
    </button>

    <div v-if="profile && evidenceOpen" class="evidence">
      <p class="ev-head">{{ ui.t('people.evidence') }}</p>
      <ul v-if="evidenceRows.length" class="ev-list">
        <li v-for="(row, i) in evidenceRows" :key="i">
          <a v-if="row.url" :href="row.url" target="_blank" rel="noopener noreferrer">
            {{ row.label }} ↗
          </a>
          <span v-else>{{ row.label }}</span>
        </li>
      </ul>
      <p v-else class="ev-none">{{ ui.t('people.evidenceEmpty') }}</p>
      <p class="ev-foot">{{ ui.t('people.evidenceHint') }}</p>
    </div>

    <div v-if="people.loadingProfile" class="state">{{ ui.t('people.loading') }}</div>

    <template v-else-if="profile">
      <section class="stages">
        <h5 class="cap">{{ ui.t('people.life') }}</h5>
        <p v-if="!profile.points.length" class="none">{{ ui.t('people.noStages') }}</p>
        <ol v-else>
          <li v-for="(point, i) in profile.points" :key="i">
            <div class="stage-head">
              <span class="n mono">{{ String(i + 1).padStart(2, '0') }}</span>
              <span class="stage-body">
                <span class="stage-title">{{ pointTitle(point) }}</span>
                <span class="stage-meta">
                  <span class="yrs mono">{{ pointYears(point) }}</span>
                  <span v-if="pointPlace(point)" class="place">{{ pointPlace(point) }}</span>
                </span>
              </span>
              <button
                v-if="point.coords"
                class="fly"
                :title="ui.t('people.flyTo')"
                @click="flyToPoint(point)"
              >
                ◎
              </button>
            </div>
            <p class="stage-text">
              {{
                openStages.has(i) || !isLong(pointText(point))
                  ? pointText(point)
                  : truncate(pointText(point), 150)
              }}
              <button v-if="isLong(pointText(point))" class="more" @click="toggleStage(i)">
                {{ openStages.has(i) ? ui.t('card.less') : ui.t('card.more') }}
              </button>
            </p>
          </li>
        </ol>
      </section>

      <section v-if="appraisalText" class="eval">
        <h5 class="cap">{{ ui.t('people.appraisal') }}</h5>
        <p class="appraisal-body">{{ appraisalText }}</p>
      </section>

      <section v-if="selfQuote" class="quotes-block">
        <h5 class="cap">{{ ui.t('people.self') }}</h5>
        <blockquote>
          <p>{{ selfQuote }}</p>
        </blockquote>
        <p v-if="selfSource" class="quote-src">
          <a v-if="selfSource.url" :href="selfSource.url" target="_blank" rel="noopener noreferrer">
            {{ sourceLabel(selfSource) }} ↗
          </a>
          <template v-else>{{ sourceLabel(selfSource) }}</template>
        </p>
        <p v-else class="source-gap">{{ ui.t('people.quoteGap') }}</p>
      </section>

      <footer>
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
    </template>

    <div v-else class="state">{{ ui.t('people.noProfile') }}</div>
  </article>
</template>

<style scoped>
.card {
  position: absolute;
  left: 22px;
  bottom: 22px;
  /* Widened from 396px, and one scroll region for the whole card instead of
   * one per section — see EventCard for the same treatment. */
  width: 520px;
  max-height: calc(100% - 44px);
  overflow-y: auto;
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
  background: var(--card);
  border: 1px solid var(--rule-2);
  box-shadow: var(--shadow-2);
  z-index: 16;
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
/* Optional: a card without a portrait must look deliberate, not broken. */
.portrait {
  width: 54px;
  height: 68px;
  object-fit: cover;
  flex: none;
  border: 1px solid var(--rule-2);
  background: var(--paper-2);
}
header .left {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
header h3 {
  font-size: 20.5px;
  line-height: 1.3;
}
header .en {
  font-size: 13px;
  color: var(--ink-3);
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
  align-items: center;
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
/* The only provenance mark left on the card: one neutral line, no badge. */
.meta-end {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: auto;
}
/* The trail is the card's one entry into the full-screen overlay. */
.trail {
  display: flex;
  align-items: baseline;
  gap: 8px;
  width: calc(100% - 32px);
  margin: 10px 16px 2px;
  padding: 9px 11px;
  text-align: left;
  background: color-mix(in srgb, var(--rust) 6%, var(--card));
  border: 1px solid var(--rule-2);
  border-left: 3px solid var(--rust);
  cursor: pointer;
  transition: background 160ms var(--ease), border-color 160ms var(--ease);
}
.trail:hover {
  background: color-mix(in srgb, var(--rust) 12%, var(--card));
  border-color: var(--rust);
}
.trail-mark {
  font-size: 13px;
  color: var(--rust);
}
.trail-label {
  font-family: var(--font-display);
  font-size: 14px;
  color: var(--ink);
}
.trail-hint {
  font-size: 11px;
  color: var(--ink-3);
}
.trail-chev {
  margin-left: auto;
  color: var(--rust);
}

.living-hint {
  font-size: 12px;
  color: var(--ink-3);
}
.basis {
  padding: 0 0 1px;
  font-size: 12px;
  color: var(--ink-3);
  border-bottom: 1px dotted var(--rule-3);
}
.basis:hover {
  color: var(--ink-2);
}
/* No sources: keep it quieter than the rest of the meta row. */
.basis-none {
  font-size: 10px;
  color: var(--ink-4);
  border-bottom-color: var(--rule-2);
}
.basis .chev {
  margin-left: 3px;
  color: var(--ink-4);
}

.evidence {
  padding: 10px 16px 12px;
  border-bottom: 1px solid var(--rule);
  background: var(--paper);
}
.ev-head {
  margin-bottom: 6px;
  font-size: 11.5px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--ink-4);
}
.ev-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.ev-list li {
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--ink-2);
}
.ev-list a {
  color: var(--indigo);
  text-decoration: none;
  border-bottom: 1px solid var(--indigo-soft);
}
.ev-none,
.ev-foot {
  font-size: 12px;
  line-height: 1.7;
  color: var(--ink-4);
}
.ev-foot {
  margin-top: 6px;
}

/* No `overflow` here on purpose: the card is the one scroll region. */
section {
  padding: 12px 16px;
  border-bottom: 1px solid var(--rule);
}
footer {
  padding: 11px 16px;
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
section h5 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 9px;
}
section p {
  font-size: var(--fs-sm);
  line-height: 1.85;
  color: var(--ink-2);
  text-align: justify;
}

ol {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
ol li {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.stage-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.n {
  flex: none;
  font-size: 11.5px;
  color: var(--rust);
}
.stage-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.stage-title {
  font-family: var(--font-display);
  font-size: 13.5px;
  color: var(--ink);
}
.stage-meta {
  display: flex;
  gap: 8px;
  font-size: 12px;
  color: var(--ink-4);
}
.fly {
  margin-left: auto;
  flex: none;
  font-size: 13px;
  color: var(--ink-4);
  padding: 0 2px;
}
.fly:hover {
  color: var(--rust);
}
.stage-text {
  font-size: 13.5px;
  line-height: 1.8;
  color: var(--ink-2);
  text-align: justify;
  padding-left: 20px;
}
.more {
  margin-left: 4px;
  font-size: 12.5px;
  color: var(--rust);
}

/* One continuous appraisal; disagreement is carried by the prose itself. */
.appraisal-body {
  font-size: var(--fs-sm);
  line-height: 1.85;
  color: var(--ink-2);
  text-align: justify;
}

/* Quotes read inline: hiding them behind a click made readers miss them. */
.quotes-block blockquote {
  margin: 0;
  padding-left: 10px;
  border-left: 2px solid var(--rule-3);
}
.source-gap {
  margin-top: 8px;
  font-size: 11.5px;
  color: var(--ink-4);
}
.quote-src {
  margin-top: 8px;
  font-size: 11.5px;
  color: var(--ink-3);
}
.quote-src a {
  border-bottom: 1px solid var(--rule-2);
}

.none {
  font-size: 13px;
  color: var(--ink-4);
}
.state {
  padding: 30px 20px;
  text-align: center;
  font-size: var(--fs-sm);
  color: var(--ink-4);
}
</style>
