<script setup lang="ts">
import { CATEGORY_KEYS, CATEGORIES, type CategoryKey } from '@/config';
import type { CertaintyLevel } from '@/lib/format';
import { useLayersStore } from '@/stores/layers';
import { useUiStore } from '@/stores/ui';
import ToggleRow from './ui/ToggleRow.vue';

defineProps<{ certaintyCounts: Record<CertaintyLevel, number> }>();

const ui = useUiStore();
const layers = useLayersStore();

const baseOptions = [
  { id: 'standard' as const, key: 'base.standard' as const },
  { id: 'satellite' as const, key: 'base.satellite' as const },
];

const certaintyOptions = [
  { level: 'high' as const, key: 'certainty.high' as const },
  { level: 'mid' as const, key: 'certainty.mid' as const },
  { level: 'low' as const, key: 'certainty.low' as const },
];

function catLabel(key: CategoryKey) {
  const meta = CATEGORIES[key];
  return ui.locale === 'zh' ? meta.zh : meta.en;
}
</script>

<template>
  <div class="wrap">
    <section>
      <h4 class="cap">{{ ui.t('panel.base') }}</h4>
      <div class="bases">
        <button
          v-for="opt in baseOptions"
          :key="opt.id"
          :class="{ on: layers.base === opt.id }"
          @click="layers.base = opt.id"
        >
          <span class="thumb" :class="opt.id" />
          {{ ui.t(opt.key) }}
        </button>
      </div>
    </section>

    <section>
      <h4 class="cap">{{ ui.t('panel.layers') }}</h4>
      <ToggleRow v-model="layers.showEvents" :label="ui.t('layer.events')" />
      <ToggleRow
        v-model="layers.showLabels"
        :label="ui.t('layer.labels')"
        :disabled="!layers.showEvents"
      />
      <ToggleRow v-model="layers.showPolities" :label="ui.t('layer.polities')" />
      <ToggleRow
        v-model="layers.showPolityNames"
        :label="ui.t('layer.polityNames')"
        :hint="ui.t('layer.polityNamesHint')"
        :disabled="!layers.showPolities"
      />
      <ToggleRow
        v-model="layers.adjacentCenturies"
        :label="ui.t('layer.adjacent')"
        :hint="ui.t('layer.slow')"
        :disabled="!layers.showPolities"
      />
      <ToggleRow v-model="layers.showBorders" :label="ui.t('layer.borders')" />
      <ToggleRow v-model="layers.showWars" :label="ui.t('layer.wars')" />
    </section>

    <section>
      <h4 class="cap">
        {{ ui.t('panel.categories') }}
        <button class="all" @click="layers.toggleAllCategories()">
          {{ layers.allActive ? ui.t('cat.none') : ui.t('cat.all') }}
        </button>
      </h4>
      <div class="cats">
        <button
          v-for="key in CATEGORY_KEYS"
          :key="key"
          class="chip"
          :class="{ on: layers.isActive(key) }"
          @click="layers.toggleCategory(key)"
        >
          <i :style="{ background: `var(${CATEGORIES[key].cssVar})` }" />
          {{ catLabel(key) }}
        </button>
      </div>
    </section>

    <section>
      <h4 class="cap">{{ ui.t('panel.certainty') }}</h4>
      <ToggleRow
        v-for="opt in certaintyOptions"
        :key="opt.level"
        :model-value="layers.isCertaintyActive(opt.level)"
        :label="ui.t(opt.key)"
        :hint="String(certaintyCounts[opt.level])"
        @update:model-value="layers.toggleCertainty(opt.level)"
      />
    </section>

    <section class="stats">
      <h4 class="cap">{{ ui.t('panel.stats') }}</h4>
      <dl>
        <div>
          <dt>{{ ui.t('layer.events') }}</dt>
          <dd class="mono">{{ layers.eventCount }}</dd>
        </div>
        <div>
          <dt>{{ ui.t('status.coords') }}</dt>
          <dd class="mono">{{ layers.locatedCount }}</dd>
        </div>
        <div v-if="layers.polityStatus.ready">
          <dt>{{ ui.t('panel.polity') }}</dt>
          <dd class="mono">{{ layers.polityStatus.shown }}</dd>
        </div>
        <div v-if="layers.polityStatus.ready">
          <dt>{{ ui.t('status.matched') }}</dt>
          <dd class="mono">{{ layers.polityStatus.matched }}</dd>
        </div>
      </dl>
      <p v-if="layers.polityStatus.ready && layers.polityStatus.hidden > 0" class="note">
        {{ layers.polityStatus.hidden }} {{ ui.t('status.polities') }}
        {{ ui.t('status.hidden') }}. {{ ui.t('status.zoomIn') }}
      </p>
      <p v-if="layers.polityStatus.ready && layers.polityStatus.partsHidden > 0" class="note">
        {{ layers.polityStatus.partsHidden }} {{ ui.t('status.partsHidden') }}.
        {{ ui.t('status.zoomIn') }}
      </p>
    </section>
  </div>
</template>

<style scoped>
.wrap {
  overflow: auto;
  height: 100%;
}
section {
  padding: 15px 18px;
  border-bottom: 1px solid var(--rule);
}
h4 {
  display: flex;
  align-items: center;
  margin-bottom: 11px;
}
.all {
  margin-left: auto;
  font-size: 11.5px;
  letter-spacing: 0.14em;
  color: var(--ink-3);
  border: 1px solid var(--rule-2);
  padding: 1px 6px;
}
.all:hover {
  color: var(--ink);
  border-color: var(--rule-3);
}

.bases {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.bases button {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 6px;
  font-size: var(--fs-sm);
  color: var(--ink-3);
  border: 1px solid transparent;
}
.bases button:hover {
  color: var(--ink-2);
}
.bases button.on {
  color: var(--ink);
  border-color: var(--rule-2);
  background: var(--card);
}
.thumb {
  width: 34px;
  height: 22px;
  flex: none;
  border: 1px solid var(--rule-2);
}
.thumb.standard {
  background: linear-gradient(135deg, #d8d5c8, #c3c9c0 55%, #cdd3d8);
}
.thumb.satellite {
  background: linear-gradient(135deg, #6f7f76, #8a9a8b 55%, #5d6f70);
}

.cats {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 5px;
}
.chip {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 5px 8px;
  font-size: 13.5px;
  border: 1px solid var(--rule);
  color: var(--ink-3);
  background: var(--paper);
  transition: border-color var(--dur) var(--ease), color var(--dur) var(--ease);
}
.chip i {
  width: 8px;
  height: 8px;
  flex: none;
  opacity: 0.35;
}
.chip:hover {
  border-color: var(--rule-3);
}
.chip.on {
  color: var(--ink);
  border-color: var(--rule-3);
  background: var(--card);
}
.chip.on i {
  opacity: 1;
}

.stats dl {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.stats dl > div {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.stats dt {
  font-size: 13.5px;
  color: var(--ink-3);
}
.stats dd {
  margin: 0 0 0 auto;
  font-size: var(--fs-sm);
  color: var(--ink-2);
}
.note {
  margin-top: 10px;
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--ink-4);
  padding-top: 9px;
  border-top: 1px dashed var(--rule-2);
}
</style>
