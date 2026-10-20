<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { wikiSearchUrl } from '@/lib/wiki';
import { useUiStore } from '@/stores/ui';
import { useWarsStore } from '@/stores/wars';

const emit = defineEmits<{ close: []; flyToTheatre: [string] }>();

const ui = useUiStore();
const wars = useWarsStore();

type Tab = 'overview' | 'sides' | 'process' | 'timeline';
const tab = ref<Tab>('overview');

const war = computed(() => wars.selected);
const doc = computed(() => wars.profile);

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

const span = computed(() => {
  const from = war.value?.startYear;
  const to = war.value?.endYear;
  const fmt = (v?: number | null) =>
    v === undefined || v === null ? '?' : v < 0 ? `${-v} BCE` : `${v}`;
  if (from === undefined || from === null) return '—';
  return from === to ? fmt(from) : `${fmt(from)} – ${fmt(to)}`;
});

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
  if (Array.isArray(value)) return value.map(toText).filter(Boolean).join('；');
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    // Prefer a conventional text field before falling back to the values.
    for (const key of ['zh', 'text', 'name', 'value', 'description']) {
      if (typeof record[key] === 'string') return record[key] as string;
    }
    return Object.values(record).map(toText).filter(Boolean).join('；');
  }
  return '';
}

const background = computed(() => {
  const b = doc.value?.background ?? {};
  return [
    { k: ui.locale === 'zh' ? '根本原因' : 'Causes', v: toText(b.causes) },
    { k: ui.locale === 'zh' ? '直接导火索' : 'Trigger', v: toText(b.immediateCause) },
    { k: ui.locale === 'zh' ? '战前局势' : 'Pre-war', v: toText(b.preWarSituation) },
    { k: ui.locale === 'zh' ? '甲方目标' : 'Aims A', v: toText(b.objectivesA) },
    { k: ui.locale === 'zh' ? '乙方目标' : 'Aims B', v: toText(b.objectivesB) },
  ].filter((row) => row.v);
});

const sides = computed(() => {
  const b = doc.value?.belligerents;
  return [
    { side: b?.sideA, tag: 'A' },
    { side: b?.sideB, tag: 'B' },
  ].filter((x) => x.side && (x.side.name || x.side.commanders?.length));
});

const outcome = computed(() => {
  const o = doc.value?.outcome;
  if (!o) return [];
  return [
    { k: ui.locale === 'zh' ? '结果' : 'Result', v: toText(o.result) },
    { k: ui.locale === 'zh' ? '领土变化' : 'Territory', v: toText(o.territorialChanges) },
    { k: ui.locale === 'zh' ? '人口影响' : 'Demography', v: toText(o.demographicImpact) },
    {
      k: ui.locale === 'zh' ? '条约' : 'Treaty',
      v: o.treaty?.name ? `${o.treaty.name}${o.treaty.date ? `（${o.treaty.date}）` : ''}` : '',
    },
  ].filter((row) => row.v);
});

const legacy = computed(() => {
  const l = doc.value?.legacy;
  if (!l) return [];
  return [
    { k: ui.locale === 'zh' ? '历史意义' : 'Significance', v: toText(l.significance) },
    { k: ui.locale === 'zh' ? '直接影响' : 'Immediate', v: toText(l.immediateConsequences) },
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
        </section>
      </template>

      <!-- 进程 -->
      <template v-else-if="tab === 'process'">
        <div v-if="!wars.battles.length" class="state">{{ ui.t('war.noBattles') }}</div>
        <template v-else>
          <section v-for="(phase, pi) in doc?.warProcess?.phases ?? []" :key="pi" class="phase">
            <h5 class="cap">
              {{ phase.name }}
              <span v-if="phase.years" class="years mono">{{ phase.years }}</span>
            </h5>
            <p v-if="phase.description" class="desc">{{ phase.description }}</p>
            <ol v-if="phase.battles?.length" class="battles">
              <li v-for="(b, bi) in phase.battles" :key="bi">
                <span class="by mono">{{ b.year ?? '—' }}</span>
                <span class="bb">
                  <span class="bn">{{ b.name }}</span>
                  <span v-if="b.location" class="bl">· {{ toText(b.location) }}</span>
                  <span v-if="b.description" class="bd">{{ toText(b.description) }}</span>
                  <span v-if="b.outcome" class="bo">{{ toText(b.outcome) }}</span>
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
                <em>{{ ui.locale === 'zh' ? '影响' : 'Impact' }}</em>{{ toText(entry.impact) }}
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
  font-size: 19px;
  line-height: 1.3;
}
.alt {
  font-size: 10.5px;
  color: var(--ink-3);
}
.close {
  margin-left: auto;
  color: var(--ink-3);
  font-size: 13px;
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
  font-size: 11.5px;
  color: var(--ink-2);
}
.kv em {
  font-style: normal;
  font-size: 9.5px;
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
  font-size: 11px;
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
  font-size: 9px;
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
  font-size: 12.5px;
  line-height: 1.85;
  color: var(--ink-2);
  border-bottom: 1px solid var(--rule);
  text-align: justify;
}

section h5 {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 7px;
}
section h5 .years {
  margin-left: auto;
  font-size: 9.5px;
  color: var(--ink-4);
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
  font-size: 10px;
  color: var(--ink-4);
  padding-top: 2px;
}
dd {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.7;
  color: var(--ink-2);
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.tags span {
  font-size: 10.5px;
  color: var(--ink-2);
  border: 1px solid var(--rule-2);
  padding: 1px 7px;
}

.badge {
  width: 15px;
  height: 15px;
  display: grid;
  place-items: center;
  font-size: 9px;
  color: var(--card);
}
.badge.a {
  background: var(--indigo);
}
.badge.b {
  background: var(--rust);
}
.side .en {
  font-size: 10.5px;
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
  font-size: 11.5px;
  color: var(--ink);
}
.commanders .role {
  font-size: 10px;
  color: var(--ink-3);
}
.commanders .bio {
  font-size: 10.5px;
  color: var(--ink-3);
  line-height: 1.6;
}

.phase .desc {
  font-size: 11.5px;
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
  font-size: 10px;
  color: var(--ink-4);
  padding-top: 2px;
}
.bb {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.bn {
  font-size: 11.5px;
  color: var(--ink);
}
.bl {
  font-size: 10px;
  color: var(--ink-4);
}
.bd {
  font-size: 10.5px;
  color: var(--ink-3);
  line-height: 1.6;
}
.bo {
  font-size: 10px;
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
  font-size: 10px;
  color: var(--ink-4);
  padding-top: 2px;
}
.tb {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.te {
  font-size: 12px;
  color: var(--ink);
}
.tt {
  font-size: 9px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-4);
}
.td {
  font-size: 11px;
  line-height: 1.65;
  color: var(--ink-2);
}
.ti {
  font-size: 10.5px;
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
  font-size: 11px;
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
  font-size: 10px;
  color: var(--ink-4);
}
</style>
