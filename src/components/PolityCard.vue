<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { YEAR_MAX } from '@/config';
import { formatArea, formatYearRange } from '@/lib/format';
import { zhPolityName } from '@/lib/names';
import { wikiArticleUrl } from '@/lib/wiki';
import { makePolityScope, withRecordedSpan } from '@/lib/polityScope';
import {
  findPolityAsset,
  findPolityCapitals,
  findPolityDescription,
  findPolityFacts,
  findPolityLifecycle,
  loadPolityAreaOverrides,
  loadPolityAssets,
  loadPolityCapitals,
  loadPolityDescriptions,
  loadPolityFacts,
  loadPolityFlags,
  loadPolityLifecycles,
  type CapitalInfo,
  type PolityAreaOverride,
  type PolityAsset,
  type PolityCapitalEntry,
  type PolityDescription,
  type PolityFacts,
  type PolityLifecycle,
} from '@/services/data';
import { usePeopleStore } from '@/stores/people';
import { useUiStore } from '@/stores/ui';
import { useWarsStore } from '@/stores/wars';
import type { PolityFeature } from '@/types';

const props = defineProps<{
  feature: PolityFeature;
  /** English → Chinese name map; Cliopatria ships English names only. */
  names?: Record<string, string>;
}>();
const emit = defineEmits<{
  close: [];
  scope: [];
  locate: [at: { lon: number; lat: number }];
}>();

const ui = useUiStore();

const rawName = computed(() => props.feature.properties?.Name ?? '—');

/**
 * Cliopatria names every polity in English ("Song dynasty"), and the card used
 * to print that field straight through — so Chinese readers saw "Song dynasty"
 * under a Chinese interface. The translation map is applied here instead.
 */
const name = computed(() => {
  const raw = rawName.value;
  return ui.locale === 'zh' ? (zhPolityName(raw, props.names) ?? raw) : raw;
});

/** The original English, shown only when it differs from the displayed name. */
const altName = computed(() => {
  const raw = rawName.value;
  return name.value !== raw ? raw : '';
});

/**
 * The tiles are point-in-time snapshots — the Qing feature under 1911 carries
 * FromYear = ToYear = 1911 — so the card read "存续 1911" for a 266-year dynasty.
 * `polity_lifecycles.json` aggregates every slice the polity appears in, and its
 * first/last years are what the card shows. They are the recorded span, not the
 * historical founding and fall, which is why the label says "收录".
 */
const lifecycle = ref<PolityLifecycle | null>(null);

const years = computed(() => {
  const last = lifecycle.value?.lastYear ?? props.feature.properties?.ToYear;
  return formatYearRange(
    lifecycle.value?.firstYear ?? props.feature.properties?.FromYear,
    last,
    ui.locale,
    // The last snapshot is carried forward to the timeline's present, so a
    // span that reaches `YEAR_MAX` has no recorded end — do not print it.
    { openEnd: typeof last === 'number' && last >= YEAR_MAX },
  );
});

/**
 * Area comes from three places, in this order.
 *
 * 1. `polity_area_overrides.json` — the published national figure, with a source.
 * 2. `polity_assets.json` — the modern state's CIA/mledoze figure.
 * 3. The tile's `Area` — the area of the boundary polygon Cliopatria shipped.
 *
 * The third is a geometry measurement, not a national statistic: for China it
 * reads 939.98 万 km² where the official figure is 959.7 万, because the polygon
 * follows a disputed-boundary compromise and is generalised. Showing it without
 * saying so is what made the card look simply wrong.
 */
const area = computed(() => {
  const override = areaOverride.value;
  if (override) return formatArea(override.area, ui.locale);
  if (modern.value && asset.value?.area) return formatArea(asset.value.area, ui.locale);
  return formatArea(props.feature.properties?.Area, ui.locale);
});

/** True when the number shown is a polygon measurement rather than a statistic. */
const areaIsGeometry = computed(
  () => !areaOverride.value && !(modern.value && asset.value?.area),
);

const areaTitle = computed(() => {
  if (areaOverride.value) return areaOverride.value.note ?? areaOverride.value.source;
  if (areaIsGeometry.value) return ui.t('polity.areaGeometry');
  return '';
});

const type = computed(() => props.feature.properties?.Type ?? '');

/**
 * Flag, capital and population come from `polity_assets.json`, which only
 * covers modern countries. Every field therefore stays optional and the row is
 * simply absent for a historical polity.
 */
const asset = ref<PolityAsset | null>(null);
const areaOverride = ref<PolityAreaOverride | null>(null);
/** Documented flag of a historical polity; empty when none exists. */
const historicalFlag = ref('');
/** A flag URL that fails to load leaves the header alone instead of showing a broken icon. */
const flagBroken = ref(false);
/** Chinese Wikipedia extract; the file carries no other language. */
const extract = ref('');
const aboutOpen = ref(false);

/*
 * Generated social profile: form of government, languages, ethnic groups,
 * religion, script, currency, population estimate, predecessors and successors.
 * The card marks it as generated, because none of it comes from the tiles.
 */
const facts = ref<PolityFacts | null>(null);

const people = usePeopleStore();
const wars = useWarsStore();
/** Entries in the two lists that fall inside this polity; null while counting. */
const relatedWars = ref<number | null>(null);
const relatedPeople = ref<number | null>(null);

/** Capital periods with their gazetteer record, in source order. */
type CapitalItem = { info: CapitalInfo; entry: PolityCapitalEntry };
const capitalEntries = ref<CapitalItem[]>([]);
const openCapital = ref<string | null>(null);

watch(
  () => props.feature.properties?.Name,
  async (target) => {
    aboutOpen.value = false;
    asset.value = null;
    areaOverride.value = null;
    historicalFlag.value = '';
    flagBroken.value = false;
    extract.value = '';
    facts.value = null;
    lifecycle.value = null;
    capitalEntries.value = [];
    openCapital.value = null;
    relatedWars.value = null;
    relatedPeople.value = null;
    if (!target) return;

    const [assets, descriptions, factsMap, areaOverrides, flags, lifecycles, capitalFile] =
      await Promise.all([
        loadPolityAssets(),
        loadPolityDescriptions(),
        loadPolityFacts(),
        loadPolityAreaOverrides(),
        loadPolityFlags(),
        loadPolityLifecycles(),
        loadPolityCapitals(),
      ]);
    // The card may have been re-pointed while the files were in flight.
    if (props.feature.properties?.Name !== target) return;

    asset.value = findPolityAsset(target, assets);
    areaOverride.value = areaOverrides[target] ?? null;
    historicalFlag.value = flags[target] ?? '';
    facts.value = findPolityFacts(target, factsMap);
    const description = findPolityDescription(target, descriptions);
    extract.value =
      description && describesThisTile(description) ? description.zh.extract : '';
    lifecycle.value = findPolityLifecycle(target, lifecycles);
    capitalEntries.value = findPolityCapitals(target, capitalFile).flatMap((entry) => {
      const info = capitalFile?.capitals[entry.capital];
      return info ? [{ info, entry }] : [];
    });

    // The same scope the lists filter by, so the counts match what clicking
    // "filter to this polity" will actually show.
    let scope = makePolityScope(props.feature, props.names);
    if (lifecycle.value) {
      scope = withRecordedSpan(scope, lifecycle.value.firstYear, lifecycle.value.lastYear);
    }
    const [warTotal, peopleTotal] = await Promise.all([
      wars.countInScope(scope).catch(() => null),
      people.countInScope(scope).catch(() => null),
    ]);
    if (props.feature.properties?.Name !== target) return;
    relatedWars.value = warTotal;
    relatedPeople.value = peopleTotal;
  },
  { immediate: true },
);

/**
 * `polity_assets.json` describes the *modern* state, so its flag, capital and
 * population are only meaningful once the polity exists in the modern era.
 * The name lookup is fuzzy ("Egypt" finds the Arab Republic of Egypt), which
 * otherwise pinned a 21st-century flag onto a Bronze Age polity.
 */
const modern = computed(
  () => (props.feature.properties?.ToYear ?? Number.NEGATIVE_INFINITY) >= 1850,
);

const flag = computed(() => {
  if (flagBroken.value) return '';
  // A documented historical flag wins over the modern state's: the Qing card
  // must not show the PRC flag just because both match "China".
  if (historicalFlag.value) return historicalFlag.value;
  return modern.value ? (asset.value?.flag ?? '') : '';
});

/**
 * The generated profile wins over the modern state's record: it describes the
 * polity at the time it existed, which is what the card is about. The asset file
 * stays as the fallback for states whose own entry is missing.
 */
const capital = computed(
  () => facts.value?.capital || (modern.value ? (asset.value?.capital ?? '') : ''),
);
const population = computed(() => {
  if (facts.value?.population) return facts.value.population;
  return modern.value && asset.value?.population ? asset.value.population.toLocaleString() : '';
});

function toggleCapital(key: string) {
  openCapital.value = openCapital.value === key ? null : key;
}

/** Years are optional: show whichever end the archive records. */
function capitalYears(entry: PolityCapitalEntry): string {
  const { from, to } = entry;
  if (typeof from === 'number' && typeof to === 'number') {
    return formatYearRange(from, to, ui.locale);
  }
  if (typeof from === 'number') return `${formatYearRange(from, from, ui.locale)}–`;
  if (typeof to === 'number') return `–${formatYearRange(to, to, ui.locale)}`;
  return ui.t('capital.yearsUnknown');
}

/** The extracts are Chinese-only, so an English interface shows none. */
const about = computed(() => (ui.locale === 'zh' ? extract.value : ''));

/**
 * `polity_descriptions.json` holds one entry per name, written from whichever
 * century slice first introduced that name — "Norway" carries the 990–1002
 * Viking kingdom, "Honduras" its 1840s republic. A tile in 2026 must not inherit
 * that prose as its own profile, so the text is only shown when the snapshot it
 * was written for reaches the end of the tile's span. Old tiles keep their
 * period text; present-day states show nothing rather than a life that stopped
 * a century ago.
 */
function describesThisTile(description: PolityDescription): boolean {
  const last = props.feature.properties?.ToYear;
  if (typeof last !== 'number') return true;
  return description.to >= last - 10;
}

/**
 * Cliopatria records a Wikipedia article title on every feature, so this is a
 * direct citation link rather than a search. The title is English ("Song
 * dynasty"), which is why it is not run through the localisation layer.
 */
const wikiUrl = computed(() => {
  const title = props.feature.properties?.Wikipedia;
  return title ? wikiArticleUrl(title) : '';
});
</script>

<template>
  <article class="card">
    <header>
      <img
        v-if="flag"
        class="flag"
        :src="flag"
        :alt="name"
        loading="lazy"
        referrerpolicy="no-referrer"
        @error="flagBroken = true"
      />
      <div class="titles">
        <span class="cap">{{ ui.t('polity.sphereOfInfluence') }}</span>
        <h3 class="serif">{{ name }}</h3>
        <span v-if="altName" class="alt">{{ altName }}</span>
      </div>
      <button class="close" @click="emit('close')">✕</button>
    </header>
    <p v-if="about" class="about" :class="{ open: aboutOpen }">
      {{ about }}
    </p>
    <button v-if="about" class="more" @click="aboutOpen = !aboutOpen">
      {{ aboutOpen ? ui.t('card.less') : ui.t('card.more') }}
    </button>
    <dl>
      <div>
        <dt :title="ui.t('polity.recordedHint')">{{ ui.t('polity.recordedYears') }}</dt>
        <dd class="mono">{{ years }}</dd>
      </div>
      <div v-if="capital && !capitalEntries.length">
        <dt>{{ ui.t('polity.capital') }}</dt>
        <dd>{{ capital }}</dd>
      </div>
      <div v-if="population">
        <dt>{{ ui.t('polity.population') }}</dt>
        <dd class="mono">{{ population }}</dd>
      </div>
      <div>
        <dt>{{ ui.t('polity.area') }}</dt>
        <dd class="mono" :title="areaTitle">
          <span v-if="areaIsGeometry" class="approx">≈</span>{{ area }}
        </dd>
      </div>
      <div v-if="type">
        <dt>{{ ui.t('card.category') }}</dt>
        <dd>{{ type }}</dd>
      </div>
    </dl>

    <!-- Capital periods. The archive records a name, not a yearly switch, so
         unknown years stay visibly unknown instead of being interpolated. -->
    <section v-if="capitalEntries.length" class="capitals">
      <h4>{{ ui.t('capital.title') }}</h4>
      <div
        v-for="(item, index) in capitalEntries"
        :key="`${item.entry.capital}-${index}`"
        class="capital"
      >
        <button
          class="capital-head"
          :aria-expanded="openCapital === item.entry.capital"
          @click="toggleCapital(item.entry.capital)"
        >
          <span class="capital-name">
            {{ item.info.name }}
            <span v-if="item.info.nameEn" class="capital-en">{{ item.info.nameEn }}</span>
          </span>
          <span class="capital-years mono">{{ capitalYears(item.entry) }}</span>
        </button>
        <div v-if="openCapital === item.entry.capital" class="capital-body">
          <p>{{ item.info.intro }}</p>
          <div class="capital-meta">
            <span v-if="item.info.modernCountry">
              {{ ui.t('capital.modern') }}{{ item.info.modernCountry }}
            </span>
            <a
              v-if="item.info.source"
              :href="item.info.source"
              target="_blank"
              rel="noopener noreferrer"
              >{{ ui.t('capital.source') }} ↗</a
            >
          </div>
          <div class="capital-foot">
            <button
              class="ghost"
              @click="emit('locate', { lon: item.info.lon, lat: item.info.lat })"
            >
              {{ ui.t('capital.locate') }}
            </button>
          </div>
        </div>
      </div>
    </section>

    <!--
      The generated profile. Values the model could not establish are absent
      rather than guessed, so most polities show fewer rows than the schema has.
    -->
    <dl v-if="facts" class="facts">
      <div v-if="facts.government">
        <dt>{{ ui.t('polity.government') }}</dt>
        <dd>{{ facts.government }}</dd>
      </div>
      <div v-if="facts.structure">
        <dt>{{ ui.t('polity.structure') }}</dt>
        <dd>{{ facts.structure }}</dd>
      </div>
      <div v-if="facts.languages.official">
        <dt>{{ ui.t('polity.languageOfficial') }}</dt>
        <dd>{{ facts.languages.official }}</dd>
      </div>
      <div v-if="facts.languages.spoken.length">
        <dt>{{ ui.t('polity.languagesSpoken') }}</dt>
        <dd>{{ facts.languages.spoken.join('、') }}</dd>
      </div>
      <div v-if="facts.languages.family">
        <dt>{{ ui.t('polity.languageFamily') }}</dt>
        <dd>{{ facts.languages.family }}</dd>
      </div>
      <div v-if="facts.ethnicGroups.length">
        <dt>{{ ui.t('polity.ethnicGroups') }}</dt>
        <dd>{{ facts.ethnicGroups.join('、') }}</dd>
      </div>
      <div v-if="facts.religion || facts.religionNote">
        <dt>{{ ui.t('polity.religion') }}</dt>
        <dd :class="{ note: !facts.religion }">{{ facts.religion || facts.religionNote }}</dd>
      </div>
      <div v-if="facts.script">
        <dt>{{ ui.t('polity.script') }}</dt>
        <dd>{{ facts.script }}</dd>
      </div>
      <div v-if="facts.currency">
        <dt>{{ ui.t('polity.currency') }}</dt>
        <dd>{{ facts.currency }}</dd>
      </div>
      <div v-if="facts.predecessors.length">
        <dt>{{ ui.t('polity.predecessors') }}</dt>
        <dd>{{ facts.predecessors.join('、') }}</dd>
      </div>
      <div v-if="facts.successors.length">
        <dt>{{ ui.t('polity.successors') }}</dt>
        <dd>{{ facts.successors.join('、') }}</dd>
      </div>
      <div v-if="facts.modernCountries.length">
        <dt>{{ ui.t('polity.modernCountries') }}</dt>
        <dd>{{ facts.modernCountries.join('、') }}</dd>
      </div>
    </dl>
    <p v-if="facts" class="provenance">{{ ui.t('polity.generated') }}</p>

    <div v-if="relatedWars !== null || relatedPeople !== null" class="related">
      <span v-if="relatedWars !== null">
        {{ ui.t('polity.relatedWars') }} <b class="mono">{{ relatedWars }}</b>
      </span>
      <span v-if="relatedPeople !== null">
        {{ ui.t('polity.relatedPeople') }} <b class="mono">{{ relatedPeople }}</b>
      </span>
    </div>

    <footer>
      <button class="ghost scope-btn" :class="{ on: ui.scopeToPolity }" @click="emit('scope')">
        {{ ui.scopeToPolity ? ui.t('filter.polityClear') : ui.t('filter.polityUse') }}
      </button>
      <a
        v-if="wikiUrl"
        class="ghost"
        :href="wikiUrl"
        target="_blank"
        rel="noopener noreferrer"
      >
        {{ ui.t('card.wiki') }} ↗
      </a>
    </footer>
  </article>
</template>

<style scoped>
.card {
  position: absolute;
  left: 22px;
  bottom: 22px;
  width: 320px;
  /* The extract can run to several hundred characters; the card scrolls
     instead of growing past the globe controls. */
  max-height: min(70vh, 660px);
  overflow-y: auto;
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
  display: flex;
  align-items: flex-start;
  gap: 11px;
  padding: 14px 16px 12px;
  border-bottom: 1px solid var(--rule);
}
.flag {
  width: 46px;
  height: 31px;
  object-fit: cover;
  flex: none;
  border: 1px solid var(--rule-2);
  background: var(--paper-2);
}
.titles {
  min-width: 0;
}
header h3 {
  font-size: 19px;
  margin-top: 5px;
  line-height: 1.35;
}
.alt {
  display: block;
  margin-top: 2px;
  font-size: 13.5px;
  color: var(--ink-3);
}
.close {
  margin-left: auto;
  color: var(--ink-3);
  font-size: 14px;
  padding: 2px;
}
.close:hover {
  color: var(--rust);
}
.about {
  margin: 0;
  padding: 11px 16px 0;
  font-size: 14px;
  line-height: 1.72;
  color: var(--ink-2);
  /* Four lines read as a summary; the toggle below reveals the rest. */
  display: -webkit-box;
  -webkit-line-clamp: 4;
  line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.about.open {
  display: block;
  -webkit-line-clamp: unset;
  line-clamp: unset;
}
.more {
  display: block;
  width: fit-content;
  margin: 7px 16px 0 auto;
  font-size: 13.5px;
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: 3px;
}
dl {
  margin: 0;
  padding: 11px 16px;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
dl > div {
  display: flex;
  align-items: baseline;
  gap: 10px;
}
dt {
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-4);
}
dd {
  margin: 0 0 0 auto;
  font-size: 13.5px;
  color: var(--ink-2);
}

/* The generated block reads as a table rather than label/value pairs pushed to
 * opposite edges: its values ("满族、汉族、蒙古族") are too long to right-align. */
.facts {
  padding-top: 11px;
  border-top: 1px solid var(--rule);
}
.facts dt {
  flex: 0 0 62px;
}
.facts dd {
  margin: 0;
  flex: 1;
  text-align: left;
  line-height: 1.65;
}
/* A corrected record: the value shown is an explanation, not a datum. */
.facts dd.note {
  color: var(--ink-3);
  font-size: 11px;
}
.approx {
  color: var(--ink-4);
  margin-right: 2px;
}
.provenance {
  margin: -4px 0 0;
  padding: 0 16px 11px;
  font-size: 11px;
  line-height: 1.6;
  color: var(--ink-4);
}
.related {
  display: flex;
  gap: 14px;
  padding: 0 16px 11px;
  font-size: 12px;
  color: var(--ink-3);
}
.related b {
  color: var(--ink);
  font-weight: 500;
}
.capitals {
  padding: 11px 16px;
  border-top: 1px solid var(--rule);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.capitals h4 {
  margin: 0;
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-4);
  font-weight: 500;
}
.capital-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  padding: 0;
  border: 0;
  background: none;
  color: var(--ink-2);
  font: inherit;
  font-size: 13.5px;
  text-align: left;
  cursor: pointer;
}
.capital-head:hover .capital-name {
  color: var(--ink);
}
.capital-en {
  margin-left: 6px;
  font-size: 11px;
  color: var(--ink-4);
}
.capital-years {
  font-size: 11px;
  color: var(--ink-4);
  white-space: nowrap;
}
.capital-body {
  margin: 4px 0;
  padding: 8px 10px;
  border-left: 2px solid var(--rule-2);
  background: var(--paper-2, transparent);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.capital-body p {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--ink-3);
}
.capital-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  font-size: 11px;
  color: var(--ink-4);
}
.capital-meta a {
  color: var(--ink-3);
}
.capital-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
/* The shared .ghost is full-width, not what this footer wants. */
.capital-foot .ghost {
  width: auto;
  padding: 4px 10px;
  font-size: 12px;
}
footer {
  padding: 11px 16px;
  border-top: 1px solid var(--rule);
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.ghost {
  width: 100%;
  border: 1px solid var(--rule-2);
  padding: 6px 10px;
  font-size: 13px;
  color: var(--ink-2);
}
.ghost.on,
.ghost:disabled {
  border-color: var(--accent);
  color: var(--accent);
}
.ghost:disabled {
  cursor: default;
  opacity: 0.7;
}
.ghost:hover {
  border-color: var(--rule-3);
  color: var(--ink);
}
/* The same affordance as the button above it, so it borrows the same box. */
a.ghost {
  display: block;
  text-align: center;
  text-decoration: none;
}
.scope-btn {
  display: block;
  text-align: center;
}
</style>
