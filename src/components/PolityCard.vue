<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { formatArea, formatYearRange } from '@/lib/format';
import { zhPolityName } from '@/lib/names';
import { wikiArticleUrl } from '@/lib/wiki';
import { makePolityScope, withLifespan } from '@/lib/polityScope';
import {
  findPolityAsset,
  findPolityDescription,
  findPolityFacts,
  loadPolityAreaOverrides,
  loadPolityAssets,
  loadPolityDescriptions,
  loadPolityFacts,
  loadPolityFlags,
  type PolityAreaOverride,
  type PolityAsset,
  type PolityFacts,
} from '@/services/data';
import { usePeopleStore } from '@/stores/people';
import { useUiStore } from '@/stores/ui';
import { useWarsStore } from '@/stores/wars';
import type { PolityFeature } from '@/types';

const props = defineProps<{
  feature: PolityFeature;
  /** English → Chinese name map; Cliopatria ships English names only. */
  names?: Record<string, string>;
  /** Which comparison column this polity already occupies, if either. */
  pinned?: 'A' | 'B' | null;
}>();
const emit = defineEmits<{ close: []; pin: [side: 'A' | 'B']; scope: [] }>();

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
 * The description file holds the real span (1645–1911) and wins when present.
 */
const lifespan = ref<{ from: number; to: number } | null>(null);

const years = computed(() =>
  formatYearRange(
    lifespan.value?.from ?? props.feature.properties?.FromYear,
    lifespan.value?.to ?? props.feature.properties?.ToYear,
    ui.locale,
  ),
);

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
    lifespan.value = null;
    relatedWars.value = null;
    relatedPeople.value = null;
    if (!target) return;

    const [assets, descriptions, factsMap, areaOverrides, flags] = await Promise.all([
      loadPolityAssets(),
      loadPolityDescriptions(),
      loadPolityFacts(),
      loadPolityAreaOverrides(),
      loadPolityFlags(),
    ]);
    // The card may have been re-pointed while the files were in flight.
    if (props.feature.properties?.Name !== target) return;

    asset.value = findPolityAsset(target, assets);
    areaOverride.value = areaOverrides[target] ?? null;
    historicalFlag.value = flags[target] ?? '';
    facts.value = findPolityFacts(target, factsMap);
    const description = findPolityDescription(target, descriptions);
    extract.value = description?.zh.extract ?? '';
    lifespan.value = description ? { from: description.from, to: description.to } : null;

    // The same scope the lists filter by, so the counts match what clicking
    // "filter to this polity" will actually show.
    let scope = makePolityScope(props.feature, props.names);
    if (description) scope = withLifespan(scope, description.from, description.to);
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

/** The extracts are Chinese-only, so an English interface shows none. */
const about = computed(() => (ui.locale === 'zh' ? extract.value : ''));

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
        <dt>{{ ui.t('polity.years') }}</dt>
        <dd class="mono">{{ years }}</dd>
      </div>
      <div v-if="capital">
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
      <!--
        Each side gets its own button: guessing which column to fill made the
        second pin silently overwrite the first. The hint below says what the
        buttons actually do, because "对照 A" on its own reads like a mode
        toggle rather than "put this polity in column A".
      -->
      <div class="pin-row">
        <button
          class="ghost"
          :class="{ on: pinned === 'A' }"
          :disabled="pinned === 'A'"
          @click="emit('pin', 'A')"
        >
          {{ pinned === 'A' ? ui.t('compare.inA') : ui.t('compare.setA') }}
        </button>
        <button
          class="ghost"
          :class="{ on: pinned === 'B' }"
          :disabled="pinned === 'B'"
          @click="emit('pin', 'B')"
        >
          {{ pinned === 'B' ? ui.t('compare.inB') : ui.t('compare.setB') }}
        </button>
      </div>
      <p class="pin-hint">{{ ui.t('compare.pinHint') }}</p>
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
footer {
  padding: 11px 16px;
  border-top: 1px solid var(--rule);
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.pin-hint {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: var(--ink-3);
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
.pin-row {
  display: flex;
  gap: 6px;
}
.pin-row .ghost {
  flex: 1;
}
</style>
