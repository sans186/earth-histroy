<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { formatYearShort, truncate } from '@/lib/format';
import { wikiSearchUrl } from '@/lib/wiki';
import { personImageUrl } from '@/services/people-images';
import { usePeopleStore } from '@/stores/people';
import { useUiStore } from '@/stores/ui';
import type { LocalisedText, PersonPoint } from '@/types';

const emit = defineEmits<{
  close: [];
  flyTo: [{ lon: number; lat: number }];
}>();

const ui = useUiStore();
const people = usePeopleStore();

type EvalKey = 'objective' | 'supporter' | 'critic';
const evalTab = ref<EvalKey>('objective');
const openStages = ref<Set<number>>(new Set());

const evalTabs: { id: EvalKey; key: 'people.objective' | 'people.supporter' | 'people.critic' }[] = [
  { id: 'objective', key: 'people.objective' },
  { id: 'supporter', key: 'people.supporter' },
  { id: 'critic', key: 'people.critic' },
];

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

/** A new person resets the reading state — otherwise the tabs look stale. */
watch(
  () => people.selectedId,
  () => {
    evalTab.value = 'objective';
    openStages.value = new Set();
  },
);

function localized(value?: LocalisedText): string {
  if (!value) return '';
  const preferred = ui.locale === 'zh' ? value.zh : value.en;
  return preferred || value.zh || value.en || '';
}

const evaluationText = computed(() => {
  const ev = profile.value?.evaluation;
  if (!ev) return '';
  return localized(ev[evalTab.value]);
});

const evalAvailable = computed(() => {
  const ev = profile.value?.evaluation;
  if (!ev) return [];
  return evalTabs.filter((tab) => Boolean(localized(ev[tab.id])));
});

/** Bare dates only — the row supplies the "lifespan" label. */
const lifespan = computed(() => {
  const p = profile.value;
  if (!p) return '';
  const born = p.birth === null ? ui.t('people.unknown') : formatYearShort(p.birth);
  if (p.death === null) return `${born} ·`;
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

      <section v-if="evalAvailable.length" class="eval">
        <h5 class="cap">{{ ui.t('people.evaluation') }}</h5>
        <div class="tabs">
          <button
            v-for="tab in evalAvailable"
            :key="tab.id"
            :class="{ on: evalTab === tab.id }"
            @click="evalTab = tab.id"
          >
            {{ ui.t(tab.key) }}
          </button>
        </div>
        <p>{{ evaluationText }}</p>
      </section>

      <section v-if="profile.quotes" class="quotes">
        <h5 class="cap">{{ ui.t('people.quotes') }}</h5>
        <blockquote v-if="localized(profile.quotes.self)">
          <p>{{ localized(profile.quotes.self) }}</p>
          <cite>{{ ui.t('people.self') }}</cite>
        </blockquote>
        <blockquote v-if="localized(profile.quotes.others)">
          <p>{{ localized(profile.quotes.others) }}</p>
          <cite>
            {{ ui.t('people.others') }}
            <template v-if="profile.othersBy">
              · {{ ui.t('people.by') }}
              {{ ui.locale === 'zh' ? profile.othersBy : profile.othersByEn || profile.othersBy }}
            </template>
          </cite>
        </blockquote>
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

.tabs {
  display: flex;
  border: 1px solid var(--rule);
  margin-bottom: 9px;
}
.tabs button {
  flex: 1;
  padding: 4px 0;
  font-size: 12px;
  color: var(--ink-3);
  border-right: 1px solid var(--rule);
}
.tabs button:last-child {
  border-right: 0;
}
.tabs button.on {
  background: var(--ink-3);
  color: var(--card);
}

.quotes blockquote {
  margin: 0;
  padding-left: 10px;
  border-left: 2px solid var(--rule-3);
}
.quotes blockquote + blockquote {
  margin-top: 11px;
}
.quotes cite {
  display: block;
  margin-top: 5px;
  font-style: normal;
  font-size: 12px;
  letter-spacing: 0.08em;
  color: var(--ink-4);
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
