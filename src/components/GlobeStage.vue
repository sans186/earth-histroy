<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { globe, type HoverInfo } from '@/services/globe';
import { CATEGORIES } from '@/config';
import { useLayersStore } from '@/stores/layers';
import { useTimelineStore } from '@/stores/timeline';
import { useUiStore } from '@/stores/ui';
import type { PolityFeature, TimelineEvent } from '@/types';
import LoadingVeil from './LoadingVeil.vue';

const emit = defineEmits<{
  ready: [];
  viewSettled: [];
  pickEvent: [TimelineEvent | null];
  pickPolity: [PolityFeature | null];
  pickWar: [string];
}>();

function reloadApp() {
  window.location.reload();
}

const ui = useUiStore();
const layers = useLayersStore();
const timeline = useTimelineStore();

const host = ref<HTMLElement | null>(null);
/** Hover state is shallow: it is swapped on every mouse move frame. */
const hover = shallowRef<HoverInfo | null>(null);
const failed = ref(false);

const yearText = computed(() => String(timeline.absYear));
const cats = computed(() =>
  Object.entries(CATEGORIES).map(([key, meta]) => ({
    key,
    label: ui.locale === 'zh' ? meta.zh : meta.en,
    color: `var(${meta.cssVar})`,
  })),
);

onMounted(async () => {
  if (!host.value) return;
  try {
    await globe.init(host.value, {
      onPickEvent: (ev) => emit('pickEvent', ev ?? null),
      onHoverEvent: (info) => {
        hover.value = info;
      },
      onPickPolity: (feature) => emit('pickPolity', feature),
      onPickWar: (warId) => emit('pickWar', warId),
      onViewChange: () => emit('viewSettled'),
    });
    emit('ready');
  } catch (err) {
    failed.value = true;
    ui.setError((err as Error).message || String(err));
  }
});

onBeforeUnmount(() => globe.destroy());
</script>

<template>
  <section class="stage">
    <div ref="host" class="canvas" />

    <div class="ghost serif" aria-hidden="true">{{ yearText }}</div>

    <span class="era-v">{{ timeline.era.name }}</span>

    <div v-if="layers.showPolities" class="status">
      <template v-if="layers.polityStatus.ready">
        <span class="mono">{{ layers.polityStatus.shown }}</span>
        <span class="cap">{{ ui.t('status.polities') }}</span>
        <span v-if="layers.polityStatus.hidden > 0" class="dim">
          · {{ layers.polityStatus.hidden }} {{ ui.t('status.hidden') }}
        </span>
      </template>
      <template v-else>
        <span class="cap">{{ ui.t('panel.polity') }}</span>
        <span class="dim">· {{ ui.t('loading.polities') }}</span>
      </template>
    </div>

    <div class="legend">
      <span class="cap">{{ ui.t('panel.legend') }}</span>
      <div class="rows">
        <span v-for="c in cats" :key="c.key" class="entry">
          <i :style="{ background: c.color }" />
          {{ c.label }}
        </span>
      </div>
    </div>

    <div class="hint cap">{{ ui.t('hint.keys') }}</div>

    <div
      v-if="hover"
      class="tip"
      :style="{ left: `${hover.x + 14}px`, top: `${hover.y + 14}px` }"
    >
      <i :style="{ background: `var(${hover.categoryVar})` }" />
      <span class="t">{{ hover.title }}</span>
      <span v-if="hover.subtitle" class="s">{{ hover.subtitle }}</span>
    </div>

    <div v-if="failed" class="failed">
      <p>{{ ui.t('error.title') }}</p>
      <button @click="reloadApp">{{ ui.t('error.retry') }}</button>
    </div>

    <LoadingVeil />
  </section>
</template>

<style scoped>
.stage {
  position: relative;
  min-width: 0;
  overflow: hidden;
  background: radial-gradient(120% 90% at 50% 40%, var(--paper) 0%, var(--paper-2) 100%);
}
.canvas {
  position: absolute;
  inset: 0;
}

.ghost {
  position: absolute;
  right: 30px;
  top: 8px;
  font-size: 118px;
  font-weight: 700;
  line-height: 0.82;
  letter-spacing: -0.02em;
  color: var(--ink);
  opacity: 0.045;
  pointer-events: none;
  user-select: none;
}

.era-v {
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  writing-mode: vertical-rl;
  font-family: var(--font-display);
  font-size: var(--fs-sm);
  letter-spacing: 0.42em;
  color: var(--ink-2);
  pointer-events: none;
}

.status {
  position: absolute;
  left: 16px;
  top: 14px;
  display: flex;
  align-items: baseline;
  gap: 5px;
  padding: 5px 9px;
  border: 1px solid var(--rule);
  background: color-mix(in srgb, var(--card) 82%, transparent);
  pointer-events: none;
}
.status .mono {
  font-size: var(--fs-sm);
  color: var(--ink);
}
.dim {
  font-size: 10.5px;
  color: var(--ink-4);
}

.legend {
  position: absolute;
  left: 16px;
  bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 9px 11px;
  border: 1px solid var(--rule);
  background: color-mix(in srgb, var(--card) 82%, transparent);
  pointer-events: none;
}
.legend .rows {
  display: grid;
  grid-template-columns: auto auto;
  gap: 4px 14px;
}
.legend .entry {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 10.5px;
  color: var(--ink-2);
}
.legend i {
  width: 12px;
  height: 3px;
  display: block;
}

.hint {
  position: absolute;
  right: 16px;
  bottom: 16px;
  color: var(--ink-4);
  pointer-events: none;
}

.tip {
  position: absolute;
  z-index: 12;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 5px 9px;
  border: 1px solid var(--rule-2);
  background: var(--card);
  box-shadow: var(--shadow-1);
  pointer-events: none;
  white-space: nowrap;
  max-width: 340px;
}
.tip i {
  width: 8px;
  height: 8px;
  display: block;
  flex: none;
}
.tip .t {
  font-size: var(--fs-sm);
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
}
.tip .s {
  font-size: 10.5px;
  color: var(--ink-3);
}

.failed {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  gap: 12px;
  text-align: center;
  background: var(--veil);
}
.failed p {
  font-family: var(--font-display);
  font-size: var(--fs-h2);
}
.failed button {
  border: 1px solid var(--rule-3);
  padding: 6px 16px;
  font-size: var(--fs-sm);
}
</style>
