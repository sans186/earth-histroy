<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';
import type { Story } from '@/types/story';
import { useUiStore } from '@/stores/ui';

const props = defineProps<{ stories: Story[] }>();
const emit = defineEmits<{ select: [Story]; close: [] }>();

const ui = useUiStore();

function titleOf(story: Story) {
  return ui.locale === 'zh' ? story.title : (story.titleEn ?? story.title);
}

function subtitleOf(story: Story) {
  return ui.locale === 'zh' ? story.subtitle : (story.subtitleEn ?? story.subtitle);
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close');
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <section class="dialog" role="dialog" aria-modal="true" :aria-label="ui.t('story.pick')">
      <header>
        <h2>{{ ui.t('story.pick') }}</h2>
        <button class="close" :aria-label="ui.t('story.close')" @click="emit('close')">×</button>
      </header>

      <ul>
        <li v-for="story in props.stories" :key="story.id">
          <button class="item" @click="emit('select', story)">
            <span class="t">{{ titleOf(story) }}</span>
            <span class="s">{{ subtitleOf(story) }}</span>
            <span class="n mono">{{ ui.tf('story.steps', { count: story.steps.length }) }}</span>
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 24px;
  background: var(--veil);
}

.dialog {
  width: min(440px, 100%);
  padding: 18px 20px 20px;
  background: var(--card);
  border: 1px solid var(--rule-2);
  box-shadow: var(--shadow-2);
}

header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
header h2 {
  font-family: var(--font-display);
  font-size: var(--fs-h3);
  font-weight: 600;
  color: var(--ink);
}
.close {
  margin-left: auto;
  width: 24px;
  height: 24px;
  line-height: 1;
  font-size: 18px;
  color: var(--ink-3);
  border: 1px solid transparent;
  transition: color var(--dur) var(--ease), border-color var(--dur) var(--ease);
}
.close:hover {
  color: var(--ink);
  border-color: var(--rule-2);
}

ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.item {
  width: 100%;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 3px 12px;
  padding: 11px 12px;
  text-align: left;
  border: 1px solid var(--rule);
  background: var(--paper);
  transition: border-color var(--dur) var(--ease), background var(--dur) var(--ease);
}
.item:hover {
  border-color: var(--rule-3);
  background: var(--paper-2);
}
.t {
  font-family: var(--font-display);
  font-size: var(--fs-body);
  color: var(--ink);
}
.s {
  grid-column: 1;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--ink-3);
}
.n {
  grid-row: 1 / span 2;
  grid-column: 2;
  align-self: center;
  font-size: var(--fs-label);
  letter-spacing: 0.1em;
  color: var(--ink-4);
  white-space: nowrap;
}
</style>
