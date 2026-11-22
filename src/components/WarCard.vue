<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { formatYearRange } from '@/lib/format';
import { isOngoingWar, warProvenance } from '@/lib/provenance';
import { wikiSearchUrl } from '@/lib/wiki';
import type { MessageKey } from '@/lib/i18n';
import { battlePlace, battleResult, battleYear } from '@/services/war-data';
import { useUiStore } from '@/stores/ui';
import { useWarsStore } from '@/stores/wars';
import type { WarPhase, WarSide } from '@/types';
import ProvenanceBadge from '@/components/ui/ProvenanceBadge.vue';

const emit = defineEmits<{ close: []; flyToTheatre: [string] }>();

const ui = useUiStore();
const wars = useWarsStore();

type Tab = 'overview' | 'sides' | 'process' | 'timeline';
const tab = ref<Tab>('overview');

const war = computed(() => wars.selected);
const doc = computed(() => wars.profile);

/**
 * Ongoing conflicts only keep what has already happened: outcome, victory
 * analysis and legacy are withheld until the conflict has a real end state.
 */
const ongoing = computed(() => isOngoingWar(war.value));
const prov = computed(() => warProvenance(war.value, doc.value));

/**
 * War profiles list their sources but carry no Wikipedia article title, so this
 * is a search on the Chinese edition, using the name the card already shows.
 */
const wikiUrl = computed(() => {
  const name = war.value?.name;
  return name ? wikiSearchUrl(name) : '';
});

// Reset to the first tab whenever a different war is opened.
watch(
  () => wars.selectedId,
  () => {
    tab.value = 'overview';
  },
);

const span = computed(() =>
  formatYearRange(war.value?.startYear, war.value?.endYear, ui.locale),
);

/** Phase date line: current profiles store years as numbers, older ones as text. */
function phaseSpan(phase: WarPhase): string {
  if (typeof phase.startYear === 'number' || typeof phase.endYear === 'number') {
    return formatYearRange(phase.startYear, phase.endYear, ui.locale);
  }
  return phase.years ?? '';
}

function clauseSep(): string {
  return ui.locale === 'zh' ? '；' : '; ';
}

function itemSep(): string {
  return ui.locale === 'zh' ? '、' : ', ';
}

/**
 * Flatten a profile field to displayable text.
 *
 * The war profiles are model-generated, and a few put an object or an array
 * where the schema says string. Rendering such a value straight into a template
 * printed raw JSON into the card — this is the single choke point that stops
 * that, so every consumer below goes through it.
 */
function toText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(toText).filter(Boolean).join(clauseSep());
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    // Prefer a conventional text field before falling back to the values.
    for (const key of ['zh', 'text', 'name', 'value', 'description']) {
      if (typeof record[key] === 'string') return record[key] as string;
    }
    return Object.values(record).map(toText).filter(Boolean).join(clauseSep());
  }
  return '';
}

/**
 * Fields the schema calls a string, but that the profiles spell as an object of
 * named parts — `preWarStrength` and `totalCasualties`.
 *
 * Joining such an object blind produced "约10万人；约400艘战舰；无；…", where the
 * bare "无" has lost the thing it refers to, so each part keeps its label.
 */
type Part = { key: string; label: MessageKey };

/** Order of battle, in the order a battle order is read. */
const STRENGTH_PARTS: Part[] = [
  { key: 'army', label: 'war.st.army' },
  { key: 'navy', label: 'war.st.navy' },
  { key: 'airForce', label: 'war.st.airForce' },
  { key: 'armor', label: 'war.st.armor' },
  { key: 'specialForces', label: 'war.st.specialForces' },
  { key: 'reserves', label: 'war.st.reserves' },
];

const CASUALTY_PARTS: Part[] = [
  { key: 'dead', label: 'war.cs.dead' },
  { key: 'wounded', label: 'war.cs.wounded' },
  { key: 'captured', label: 'war.cs.captured' },
  { key: 'missing', label: 'war.cs.missing' },
  { key: 'civilian', label: 'war.cs.civilian' },
];

/** Values that say "this arm did not exist", which is noise in a comparison. */
const NONE_VALUES = new Set(['无', '無', '没有', 'none', 'n/a', '—', '-']);

function labelledText(value: unknown, parts: Part[]): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return toText(value);
  const record = value as Record<string, unknown>;
  const usable = (text: string) => Boolean(text) && !NONE_VALUES.has(text.toLowerCase());
  const known = parts.map(({ key, label }) => {
    const text = toText(record[key]).trim();
    return usable(text) ? `${ui.t(label)} ${text}` : '';
  });
  // Parts the schema does not name still deserve to be read.
  const extra = Object.entries(record)
    .filter(([key]) => !parts.some((part) => part.key === key))
    .map(([, part]) => toText(part).trim());
  return [...known, ...extra].filter(usable).join(clauseSep());
}

const strengthText = (value: unknown) => labelledText(value, STRENGTH_PARTS);
const casualtyText = (value: unknown) => labelledText(value, CASUALTY_PARTS);

const background = computed(() => {
  const b = doc.value?.background ?? {};
  return [
    { k: ui.t('war.field.causes'), v: toText(b.causes) },
    { k: ui.t('war.field.trigger'), v: toText(b.immediateCause) },
    { k: ui.t('war.field.preWarSituation'), v: toText(b.preWarSituation) },
    { k: ui.t('war.field.objectivesA'), v: toText(b.objectivesA) },
    { k: ui.t('war.field.objectivesB'), v: toText(b.objectivesB) },
  ].filter((row) => row.v);
});

const sides = computed(() => {
  const b = doc.value?.belligerents;
  return [
    { side: b?.sideA, tag: 'A' },
    { side: b?.sideB, tag: 'B' },
  ].filter((x) => x.side && (x.side.name || x.side.commanders?.length));
});

/**
 * Order of battle before the war, side by side.
 *
 * The source spells it as prose ("16,000 regular troops, 25,000 militia"), not
 * as numbers, so this compares the two statements rather than drawing a bar —
 * a chart would have to invent a parser for every phrasing in 95 profiles.
 */
const strengths = computed(() => {
  const b = doc.value?.belligerents;
  const rows = [
    { tag: 'A', name: b?.sideA?.name ?? '', value: strengthText(b?.sideA?.preWarStrength) },
    { tag: 'B', name: b?.sideB?.name ?? '', value: strengthText(b?.sideB?.preWarStrength) },
  ];
  return rows.some((row) => row.value) ? rows : [];
});

/** Everything else the profile records about one belligerent. */
function sideDetails(side: WarSide | undefined): { k: string; v: string }[] {
  if (!side) return [];
  return [
    { k: ui.t('war.militarySystem'), v: toText(side.militarySystem) },
    { k: ui.t('war.strength'), v: strengthText(side.preWarStrength) },
    { k: ui.t('war.equipment'), v: toText(side.equipment) },
    {
      k: ui.t('war.politicalLeaders'),
      v: (side.politicalLeaders ?? []).map((leader) => toText(leader)).filter(Boolean).join(itemSep()),
    },
    { k: ui.t('war.casualties'), v: casualtyText(side.totalCasualties) },
    { k: ui.t('war.propaganda'), v: toText(side.propaganda) },
  ].filter((row) => row.v);
}

const outcome = computed(() => {
  if (ongoing.value) return [];
  const o = doc.value?.outcome;
  if (!o) return [];
  return [
    { k: ui.t('war.field.result'), v: toText(o.result) },
    { k: ui.t('war.field.territorialChanges'), v: toText(o.territorialChanges) },
    { k: ui.t('war.field.demographicImpact'), v: toText(o.demographicImpact) },
    {
      k: ui.t('war.field.treaty'),
      v: o.treaty?.name
        ? `${o.treaty.name}${
            o.treaty.date
              ? ui.locale === 'zh'
                ? `（${o.treaty.date}）`
                : ` (${o.treaty.date})`
              : ''
          }`
        : '',
    },
  ].filter((row) => row.v);
});

const legacy = computed(() => {
  if (ongoing.value) return [];
  const l = doc.value?.legacy;
  if (!l) return [];
  return [
    { k: ui.t('war.field.significance'), v: toText(l.significance) },
    { k: ui.t('war.field.immediateConsequences'), v: toText(l.immediateConsequences) },
  ].filter((row) => row.v);
});

const hasTheatre = computed(() => {
  const id = wars.selectedId;
  return id ? Boolean(wars.locations[id]) : false;
});

const tabs: { id: Tab; key: 'war.tab.overview' | 'war.tab.sides' | 'war.tab.process' | 'war.tab.timeline'; count: number }[] = [
  { id: 'overview', key: 'war.tab.overview', count: 0 },
  { id: 'sides', key: 'war.tab.sides', count: 0 },
  { id: 'process', key: 'war.tab.process', count: 0 },
  { id: 'timeline', key: 'war.tab.timeline', count: 0 },
];

const tabCounts = computed<Record<Tab, number>>(() => ({
  overview: 0,
  sides: sides.value.length,
  process: wars.battles.length,
  timeline: doc.value?.timeline?.length ?? 0,
}));
</script>

<template>
  <article class="card">
    <header>
      <div class="left">
        <span class="cap">{{ ui.t('war.title') }}</span>
        <h3 class="serif">{{ war?.name ?? '—' }}</h3>
        <span class="alt">
          {{ war?.nameEn }}
          <template v-if="doc?.alternativeNames?.length">
            · {{ doc.alternativeNames.slice(0, 2).join(' / ') }}
          </template>
        </span>
      </div>
      <button class="close" :aria-label="ui.t('card.close')" @click="emit('close')">✕</button>
    </header>

    <div class="meta">
      <span class="kv"><em>{{ ui.t('card.time') }}</em><span class="mono">{{ span }}</span></span>
      <span v-if="war?.category" class="kv"><em>{{ ui.t('war.category') }}</em>{{ war.category }}</span>
      <span v-if="war?.totalBattles" class="kv">
        <em>{{ ui.t('war.battles') }}</em><span class="mono">{{ war.totalBattles }}</span>
      </span>
      <ProvenanceBadge :evidence="prov.evidence" :dispute="prov.dispute" />
    </div>

    <nav class="tabs">
      <button
        v-for="t in tabs"
        :key="t.id"
        :class="{ on: tab === t.id }"
        @click="tab = t.id"
      >
        {{ ui.t(t.key) }}
        <span v-if="tabCounts[t.id]" class="n mono">{{ tabCounts[t.id] }}</span>
      </button>
    </nav>

    <div v-if="wars.loadingProfile" class="state">{{ ui.t('loading.war') }}</div>

    <div v-else class="body">
      <!-- 概况 -->
      <template v-if="tab === 'overview'">
        <p v-if="ongoing" class="ongoing">
          <strong>{{ ui.t('war.ongoing') }}</strong>
          {{ ui.t('war.ongoingNote') }}
        </p>
        <p v-if="doc?.summary" class="lead">{{ doc.summary }}</p>
        <section v-if="background.length">
          <h5 class="cap">{{ ui.t('war.background') }}</h5>
          <dl>
            <div v-for="row in background" :key="row.k">
              <dt>{{ row.k }}</dt>
              <dd>{{ row.v }}</dd>
            </div>
          </dl>
        </section>
        <section v-if="doc?.theaters?.length">
          <h5 class="cap">{{ ui.t('war.theaters') }}</h5>
          <div class="tags">
            <span v-for="t in doc.theaters" :key="String(t)">{{ toText(t) }}</span>
          </div>
        </section>
        <section v-if="strengths.length" class="strength">
          <h5 class="cap">{{ ui.t('war.strengthCompare') }}</h5>
          <div class="pairs">
            <div v-for="s in strengths" :key="s.tag" class="pair">
              <span class="badge" :class="s.tag === 'A' ? 'a' : 'b'">{{ s.tag }}</span>
              <div class="pt">
                <span class="pn">{{ s.name }}</span>
                <span class="pv">{{ s.value || '—' }}</span>
              </div>
            </div>
          </div>
        </section>
        <section v-if="outcome.length">
          <h5 class="cap">{{ ui.t('war.outcome') }}</h5>
          <dl>
            <div v-for="row in outcome" :key="row.k">
              <dt>{{ row.k }}</dt>
              <dd>{{ row.v }}</dd>
            </div>
          </dl>
        </section>
        <section v-if="legacy.length">
          <h5 class="cap">{{ ui.t('war.legacy') }}</h5>
          <dl>
            <div v-for="row in legacy" :key="row.k">
              <dt>{{ row.k }}</dt>
              <dd>{{ row.v }}</dd>
            </div>
          </dl>
        </section>
      </template>

      <!-- 双方 -->
      <template v-else-if="tab === 'sides'">
        <section v-for="entry in sides" :key="entry.tag" class="side">
          <h5 class="cap">
            <span class="badge" :class="entry.tag === 'A' ? 'a' : 'b'">{{ entry.tag }}</span>
            {{ entry.side?.name }}
          </h5>
          <p v-if="entry.side?.nameEn" class="en">{{ entry.side.nameEn }}</p>
          <div v-if="entry.side?.countries?.length" class="tags">
            <span v-for="c in entry.side.countries" :key="String(c)">{{ toText(c) }}</span>
          </div>
          <ul v-if="entry.side?.commanders?.length" class="commanders">
            <li v-for="(cm, i) in entry.side.commanders" :key="i">
              <span class="nm">{{ toText(cm.name) }}</span>
              <span v-if="cm.role" class="role">{{ toText(cm.role) }}</span>
              <span v-if="cm.bio" class="bio">{{ toText(cm.bio) }}</span>
            </li>
          </ul>
          <dl v-if="sideDetails(entry.side).length" class="facts">
            <div v-for="row in sideDetails(entry.side)" :key="row.k">
              <dt>{{ row.k }}</dt>
              <dd>{{ row.v }}</dd>
            </div>
          </dl>
        </section>
      </template>

      <!-- 进程 -->
      <template v-else-if="tab === 'process'">
        <div v-if="!wars.battles.length" class="state">{{ ui.t('war.noBattles') }}</div>
        <template v-else>
          <section v-for="(phase, pi) in doc?.warProcess?.phases ?? []" :key="pi" class="phase">
            <h5 class="cap">
              {{ phase.name }}
              <span v-if="phaseSpan(phase)" class="years mono">{{ phaseSpan(phase) }}</span>
            </h5>
            <p v-if="phase.summary || phase.description" class="desc">
              {{ phase.summary || phase.description }}
            </p>
            <ol v-if="phase.battles?.length" class="battles">
              <li v-for="(b, bi) in phase.battles" :key="bi">
                <span class="by mono">{{ battleYear(b) ?? '—' }}</span>
                <span class="bb">
                  <span class="bn">{{ b.name }}</span>
                  <span v-if="battlePlace(b)" class="bl">· {{ toText(battlePlace(b)) }}</span>
                  <span v-if="b.description" class="bd">{{ toText(b.description) }}</span>
                  <span v-if="battleResult(b)" class="bo">{{ toText(battleResult(b)) }}</span>
                </span>
              </li>
            </ol>
          </section>
        </template>
      </template>

      <!-- 年表 -->
      <template v-else>
        <div v-if="!doc?.timeline?.length" class="state">{{ ui.t('war.noTimeline') }}</div>
        <ol v-else class="timeline">
          <li v-for="(entry, i) in doc.timeline" :key="i">
            <span class="ty mono">{{ entry.year ?? '—' }}</span>
            <span class="tb">
              <span class="te">{{ toText(entry.event) }}</span>
              <span v-if="entry.type" class="tt">{{ toText(entry.type) }}</span>
              <span v-if="entry.description" class="td">{{ toText(entry.description) }}</span>
              <span v-if="entry.impact" class="ti">
                <em>{{ ui.t('war.field.impact') }}</em>{{ toText(entry.impact) }}
              </span>
            </span>
          </li>
        </ol>
      </template>
    </div>

    <footer>
      <button class="primary" :disabled="!hasTheatre" @click="emit('flyToTheatre', wars.selectedId ?? '')">
        {{ ui.t('war.fly') }}
      </button>
      <span v-if="!hasTheatre" class="nohint">{{ ui.t('war.noTheatre') }}</span>
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
  /* Matches EventCard / PersonCard so the three read as one system. */
  width: 520px;
  max-height: calc(100% - 44px);
  display: flex;
  flex-direction: column;
  background: var(--card);
  border: 1px solid var(--rule-2);
  box-shadow: var(--shadow-2);
  z-index: 15;
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
  gap: 12px;
  padding: 14px 16px 11px;
  border-bottom: 1px solid var(--rule);
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
.alt {
  font-size: 12.5px;
  color: var(--ink-3);
}
.close {
  margin-left: auto;
  color: var(--ink-3);
  font-size: 14.5px;
  padding: 3px;
}
.close:hover {
  color: var(--rust);
}

.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  padding: 9px 16px;
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

.tabs {
  display: flex;
  border-bottom: 1px solid var(--rule-2);
  background: var(--paper-2);
}
.tabs button {
  flex: 1;
  padding: 8px 4px;
  font-size: 13px;
  letter-spacing: 0.1em;
  color: var(--ink-3);
  border-bottom: 2px solid transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
}
.tabs button:hover {
  color: var(--ink-2);
}
.tabs button.on {
  color: var(--ink);
  border-bottom-color: var(--rust);
  background: var(--card);
}
.tabs .n {
  font-size: 11px;
  color: var(--ink-4);
}

.body {
  overflow: auto;
  padding: 0;
  flex: 1;
  min-height: 0;
}
.body section {
  padding: 11px 16px;
  border-bottom: 1px solid var(--rule);
}
.body section:last-child {
  border-bottom: 0;
}
.lead {
  padding: 12px 16px;
  font-size: 13.5px;
  line-height: 1.85;
  color: var(--ink-2);
  border-bottom: 1px solid var(--rule);
  text-align: justify;
}
.ongoing {
  padding: 10px 16px;
  font-size: 12.5px;
  line-height: 1.75;
  color: var(--ink-2);
  background: color-mix(in srgb, var(--rust) 6%, transparent);
  border-bottom: 1px solid var(--rule);
}
.ongoing strong {
  color: var(--rust);
  font-weight: 500;
  margin-right: 6px;
}

section h5 {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 7px;
}
section h5 .years {
  margin-left: auto;
  font-size: 11.5px;
  color: var(--ink-4);
}

/* Order of battle, A over B: prose strengths compared, not a chart. */
.strength .pairs {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.strength .pair {
  display: grid;
  grid-template-columns: 18px 1fr;
  gap: 8px;
  align-items: start;
  padding: 7px 9px;
  border-left: 2px solid var(--rule-2);
  background: color-mix(in srgb, var(--paper-2) 55%, transparent);
}
.strength .pt {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.strength .pn {
  font-size: 12.5px;
  color: var(--ink-3);
}
.strength .pv {
  font-size: 13.5px;
  line-height: 1.65;
  color: var(--ink);
}
.facts {
  margin-top: 10px;
}

dl {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
dl > div {
  display: grid;
  grid-template-columns: 74px 1fr;
  gap: 10px;
}
dt {
  font-size: 12px;
  color: var(--ink-4);
  padding-top: 2px;
}
dd {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.7;
  color: var(--ink-2);
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.tags span {
  font-size: 12.5px;
  color: var(--ink-2);
  border: 1px solid var(--rule-2);
  padding: 1px 7px;
}

.badge {
  width: 15px;
  height: 15px;
  display: grid;
  place-items: center;
  font-size: 11px;
  color: var(--card);
}
.badge.a {
  background: var(--indigo);
}
.badge.b {
  background: var(--rust);
}
.side .en {
  font-size: 12.5px;
  color: var(--ink-4);
  margin-bottom: 6px;
}
.commanders {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.commanders li {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-left: 9px;
  border-left: 2px solid var(--rule-2);
}
.commanders .nm {
  font-size: 13.5px;
  color: var(--ink);
}
.commanders .role {
  font-size: 12px;
  color: var(--ink-3);
}
.commanders .bio {
  font-size: 12.5px;
  color: var(--ink-3);
  line-height: 1.6;
}

.phase .desc {
  font-size: 13.5px;
  line-height: 1.7;
  color: var(--ink-2);
  margin-bottom: 6px;
}
.battles {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.battles li {
  display: grid;
  grid-template-columns: 38px 1fr;
  gap: 9px;
}
.battles .by {
  font-size: 12px;
  color: var(--ink-4);
  padding-top: 2px;
}
.bb {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.bn {
  font-size: 13.5px;
  color: var(--ink);
}
.bl {
  font-size: 12px;
  color: var(--ink-4);
}
.bd {
  font-size: 12.5px;
  color: var(--ink-3);
  line-height: 1.6;
}
.bo {
  font-size: 12px;
  color: var(--rust);
}

.timeline {
  list-style: none;
  margin: 0;
  padding: 0;
}
.timeline li {
  display: grid;
  grid-template-columns: 40px 1fr;
  gap: 10px;
  padding: 9px 16px;
  border-bottom: 1px solid var(--rule);
}
.timeline .ty {
  font-size: 12px;
  color: var(--ink-4);
  padding-top: 2px;
}
.tb {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.te {
  font-size: 13px;
  color: var(--ink);
}
.tt {
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-4);
}
.td {
  font-size: 13px;
  line-height: 1.65;
  color: var(--ink-2);
}
.ti {
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--ink-3);
}
.ti em {
  font-style: normal;
  color: var(--rust);
  margin-right: 5px;
}

.state {
  padding: 30px 20px;
  text-align: center;
  font-size: var(--fs-sm);
  color: var(--ink-4);
}

footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 11px 16px;
  border-top: 1px solid var(--rule);
}
/* Full width on its own row, matching the other cards' footers. */
footer .ghost {
  flex: 1 0 100%;
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
.nohint {
  font-size: 12px;
  color: var(--ink-4);
}
</style>
