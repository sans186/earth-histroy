<script setup lang="ts">
import { computed } from 'vue';
import { formatArea } from '@/lib/format';
import { wikiArticleUrl } from '@/lib/wiki';
import { useUiStore } from '@/stores/ui';
import type { PolityFeature } from '@/types';

const props = defineProps<{
  feature: PolityFeature;
  /** English → Chinese name map; Cliopatria ships English names only. */
  names?: Record<string, string>;
}>();
const emit = defineEmits<{ close: []; pin: [side: 'A' | 'B'] }>();

const ui = useUiStore();

const rawName = computed(() => props.feature.properties?.Name ?? '—');

/**
 * Cliopatria names every polity in English ("Song dynasty"), and the card used
 * to print that field straight through — so Chinese readers saw "Song dynasty"
 * under a Chinese interface. The translation map is applied here instead.
 */
const name = computed(() => {
  const raw = rawName.value;
  return ui.locale === 'zh' ? (props.names?.[raw] ?? raw) : raw;
});

/** The original English, shown only when it differs from the displayed name. */
const altName = computed(() => {
  const raw = rawName.value;
  return name.value !== raw ? raw : '';
});

const years = computed(() => {
  const from = props.feature.properties?.FromYear;
  const to = props.feature.properties?.ToYear;
  if (from === undefined && to === undefined) return '—';
  const label = (v?: number) => (v === undefined ? '?' : v < 0 ? `${-v} BCE` : `${v}`);
  return `${label(from)} – ${label(to)}`;
});

const area = computed(() => formatArea(props.feature.properties?.Area, ui.locale));
const type = computed(() => props.feature.properties?.Type ?? '');

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
      <div>
        <span class="cap">{{ ui.t('polity.sphereOfInfluence') }}</span>
        <h3 class="serif">{{ name }}</h3>
        <span v-if="altName" class="alt">{{ altName }}</span>
      </div>
      <button class="close" @click="emit('close')">✕</button>
    </header>
    <dl>
      <div>
        <dt>{{ ui.t('polity.years') }}</dt>
        <dd class="mono">{{ years }}</dd>
      </div>
      <div>
        <dt>{{ ui.t('polity.area') }}</dt>
        <dd class="mono">{{ area }}</dd>
      </div>
      <div v-if="type">
        <dt>{{ ui.t('card.category') }}</dt>
        <dd>{{ type }}</dd>
      </div>
    </dl>
    <footer>
      <!-- Each side gets its own button. Guessing which column to fill made the
           second pin silently overwrite the first. -->
      <div class="pin-row">
        <button class="ghost" @click="emit('pin', 'A')">{{ ui.t('compare.setA') }}</button>
        <button class="ghost" @click="emit('pin', 'B')">{{ ui.t('compare.setB') }}</button>
      </div>
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
  width: 288px;
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
  gap: 10px;
  padding: 13px 15px 11px;
  border-bottom: 1px solid var(--rule);
}
header h3 {
  font-size: 16px;
  margin-top: 5px;
  line-height: 1.35;
}
.alt {
  display: block;
  margin-top: 2px;
  font-size: 10.5px;
  color: var(--ink-3);
}
.close {
  margin-left: auto;
  color: var(--ink-3);
  font-size: 12px;
  padding: 2px;
}
.close:hover {
  color: var(--rust);
}
dl {
  margin: 0;
  padding: 10px 15px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
dl > div {
  display: flex;
  align-items: baseline;
  gap: 10px;
}
dt {
  font-size: 9.5px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--ink-4);
}
dd {
  margin: 0 0 0 auto;
  font-size: var(--fs-sm);
  color: var(--ink-2);
}
footer {
  padding: 10px 15px;
  border-top: 1px solid var(--rule);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ghost {
  width: 100%;
  border: 1px solid var(--rule-2);
  padding: 5px 10px;
  font-size: 11px;
  color: var(--ink-2);
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
.pin-row {
  display: flex;
  gap: 6px;
}
.pin-row .ghost {
  flex: 1;
}
</style>
