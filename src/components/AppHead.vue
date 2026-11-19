<script setup lang="ts">
import { computed } from 'vue';
import { useTimelineStore } from '@/stores/timeline';
import { useUiStore } from '@/stores/ui';
import type { ViewMode } from '@/types';

const emit = defineEmits<{ resetView: []; openStory: [] }>();

const ui = useUiStore();
const timeline = useTimelineStore();

const views: { id: ViewMode; key: 'nav.explore' | 'nav.compare' }[] = [
  { id: 'explore', key: 'nav.explore' },
  { id: 'compare', key: 'nav.compare' },
];

const yearText = computed(() => `${timeline.absYear}`);
const eraText = computed(() => (ui.locale === 'zh' ? timeline.era.name : timeline.era.nameEn));
</script>

<template>
  <header class="head">
    <div class="brand">
      <h1>{{ ui.t('app.name') }}</h1>
      <span class="tag">{{ ui.t('app.tagline') }}</span>
    </div>

    <nav>
      <button
        v-for="v in views"
        :key="v.id"
        :class="{ on: ui.view === v.id }"
        @click="ui.setView(v.id)"
      >
        {{ ui.t(v.key) }}
      </button>
      <button class="story" @click="emit('openStory')">{{ ui.t('nav.story') }}</button>
    </nav>

    <!-- Renderer switch: only meaningful while exploring, since the comparison
         board has no 3D/2D distinction. -->
    <div v-if="ui.view === 'explore'" class="stages" role="group">
      <button :class="{ on: ui.stage === '3d' }" @click="ui.setStage('3d')">
        {{ ui.t('stage.3d') }}
      </button>
      <button :class="{ on: ui.stage === '2d' }" @click="ui.setStage('2d')">
        {{ ui.t('stage.2d') }}
      </button>
    </div>

    <div class="right">
      <span class="folio cap">{{ ui.t('head.folio') }} {{ yearText }}</span>
      <span class="era">{{ eraText }}</span>
      <span class="rule" />
      <button class="ghost" :title="ui.t('card.flyTo')" @click="emit('resetView')">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <ellipse cx="12" cy="12" rx="4" ry="9" />
          <path d="M3 12h18" />
        </svg>
      </button>
      <button class="ghost lang" @click="ui.toggleLocale()">
        {{ ui.locale === 'zh' ? 'EN' : '中' }}
      </button>
    </div>
  </header>
</template>

<style scoped>
.head {
  display: flex;
  align-items: center;
  gap: 22px;
  padding: 0 22px;
  height: var(--head-h);
  border-bottom: 1px solid var(--rule-2);
  background: var(--paper);
  position: relative;
  z-index: 3;
}
.head::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -3px;
  height: 1px;
  background: var(--rule);
}

.brand {
  display: flex;
  align-items: baseline;
  gap: 10px;
}
.brand h1 {
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.06em;
}
.tag {
  font-size: 11.5px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--ink-3);
  padding-left: 10px;
  border-left: 1px solid var(--rule-2);
}

nav {
  display: flex;
  gap: 2px;
}
nav button {
  font-size: var(--fs-sm);
  letter-spacing: 0.08em;
  color: var(--ink-2);
  padding: 5px 11px;
  border-bottom: 1px solid transparent;
  transition: color var(--dur) var(--ease);
}
nav button:hover {
  color: var(--ink);
}
nav button.on {
  color: var(--ink);
  border-bottom-color: var(--rust);
}

.stages {
  display: flex;
  border: 1px solid var(--rule-2);
  margin-left: -8px;
}
.stages button {
  font-size: 11.5px;
  letter-spacing: 0.08em;
  padding: 3px 9px;
  color: var(--ink-3);
  border-right: 1px solid var(--rule);
}
.stages button:last-child {
  border-right: none;
}
.stages button:hover {
  color: var(--ink);
}
.stages button.on {
  background: var(--ink);
  color: var(--card);
}

.right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 14px;
}
.folio {
  color: var(--ink-4);
}
.era {
  font-family: var(--font-display);
  font-size: var(--fs-sm);
  color: var(--ink-2);
}
.rule {
  width: 1px;
  height: 15px;
  background: var(--rule-2);
}
.ghost {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border: 1px solid var(--rule);
  color: var(--ink-2);
  transition: border-color var(--dur) var(--ease), color var(--dur) var(--ease);
}
.ghost:hover {
  border-color: var(--rule-3);
  color: var(--ink);
}
.ghost svg {
  width: 14px;
  height: 14px;
  stroke: currentColor;
  fill: none;
  stroke-width: 1.4;
}
.lang {
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.08em;
}
</style>
