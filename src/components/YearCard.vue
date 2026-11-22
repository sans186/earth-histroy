<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { documentationInfo } from '@/lib/format';
import { loadYearContext, type YearContext } from '@/services/data';
import { useTimelineStore } from '@/stores/timeline';
import { useUiStore } from '@/stores/ui';

const emit = defineEmits<{ close: [] }>();

const ui = useUiStore();
const timeline = useTimelineStore();

const context = ref<YearContext | null>(null);
const loading = ref(false);
let abort: AbortController | null = null;

const docs = computed(() => documentationInfo(context.value?.documentationLevel, ui.locale));

const yearLabel = computed(() =>
  timeline.year < 0
    ? ui.locale === 'zh'
      ? `公元前 ${-timeline.year} 年`
      : `${-timeline.year} BCE`
    : ui.locale === 'zh'
      ? `${timeline.year} 年`
      : `${timeline.year} CE`,
);

async function load() {
  abort?.abort();
  const controller = new AbortController();
  abort = controller;
  loading.value = true;
  try {
    const result = await loadYearContext(timeline.year, ui.locale, controller.signal);
    if (controller.signal.aborted) return;
    context.value = result;
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') return;
    context.value = null;
  } finally {
    if (!controller.signal.aborted) loading.value = false;
  }
}

/*
 * A drag rewrites the year on every pointer move and the year files cannot be
 * cancelled once requested, so a request per move only piles up behind the
 * others. Nothing loads during the drag; the release below reloads once.
 */
watch(
  () => [timeline.year, ui.locale] as const,
  () => {
    if (timeline.scrubbing) {
      // The heading has already moved, so the previous year's account would be
      // read as the new one's.
      loading.value = true;
      return;
    }
    void load();
  },
  { immediate: true },
);

watch(
  () => timeline.scrubbing,
  (scrubbing) => {
    if (!scrubbing) void load();
  },
);

onBeforeUnmount(() => abort?.abort());
</script>

<template>
  <article class="card">
    <header>
      <div class="left">
        <span class="cap">{{ ui.t('year.title') }}</span>
        <h3 class="serif">{{ yearLabel }}</h3>
      </div>
      <button class="close" :aria-label="ui.t('card.close')" @click="emit('close')">✕</button>
    </header>

    <div class="body">
      <div v-if="loading" class="state">{{ ui.t('loading.events') }}</div>

      <template v-else-if="context">
        <div class="row">
          <span class="k">{{ ui.t('card.docLevel') }}</span>
          <b :class="docs.level">{{ docs.label }}</b>
          <span class="k count">
            {{ context.eventCount }} {{ ui.t('status.events') }}
          </span>
        </div>

        <section v-if="context.eraContext">
          <h5 class="cap">{{ ui.t('card.eraContext') }}</h5>
          <p>{{ context.eraContext }}</p>
        </section>

        <section v-if="context.historiographicNote">
          <h5 class="cap">{{ ui.t('card.note') }}</h5>
          <p>{{ context.historiographicNote }}</p>
        </section>

        <section v-if="context.disconfirmingEvidence" class="evidence">
          <h5 class="cap">{{ ui.t('card.evidence') }}</h5>
          <p>{{ context.disconfirmingEvidence }}</p>
        </section>

        <section v-if="context.coverageGaps.length">
          <h5 class="cap">{{ ui.t('card.gaps') }}</h5>
          <div class="gaps">
            <span v-for="gap in context.coverageGaps" :key="gap">{{ gap }}</span>
          </div>
        </section>
      </template>

      <div v-else class="state">{{ ui.t('year.none') }}</div>
    </div>

    <p class="disclaimer">{{ ui.t('card.aiNotice') }}</p>
  </article>
</template>

<style scoped>
.card {
  position: absolute;
  left: 22px;
  bottom: 22px;
  width: 560px;
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
  padding: 14px 18px 11px;
  border-bottom: 1px solid var(--rule-2);
  flex: none;
}
header .left {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
header h3 {
  font-size: 21.5px;
  line-height: 1.3;
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

/*
 * One scroll region for the whole card. Individual sections used to carry
 * `overflow: auto`, which produced a separate scrollbar per section and left
 * every block showing a few lines at a time.
 */
.body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.row {
  display: flex;
  align-items: baseline;
  gap: 9px;
  padding: 11px 18px;
  border-bottom: 1px solid var(--rule);
  background: var(--paper-2);
}
.row .k {
  font-size: 13.5px;
  color: var(--ink-3);
}
.row .count {
  margin-left: auto;
  font-size: 12.5px;
  color: var(--ink-4);
}
.row b {
  font-size: 13px;
  font-weight: 500;
}
.row b.rich {
  color: var(--indigo);
}
.row b.moderate {
  color: var(--ink-2);
}
.row b.sparse {
  color: var(--ochre);
}
.row b.minimal {
  color: var(--rust);
}

section {
  padding: 13px 18px;
  border-bottom: 1px solid var(--rule);
}
section h5 {
  margin-bottom: 8px;
}
section p {
  font-size: var(--fs-sm);
  line-height: 1.95;
  color: var(--ink-2);
  text-align: justify;
  max-width: 68ch;
}
.evidence p {
  border-left: 2px solid var(--rust);
  padding-left: 11px;
}

.gaps {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.gaps span {
  font-size: 12.5px;
  color: var(--ink-3);
  border: 1px dashed var(--rule-2);
  padding: 3px 8px;
}

.disclaimer {
  flex: none;
  padding: 10px 18px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--ink-4);
  border-top: 1px solid var(--rule-2);
  background: var(--paper);
}

.state {
  padding: 34px 20px;
  text-align: center;
  font-size: var(--fs-sm);
  color: var(--ink-4);
}
</style>
