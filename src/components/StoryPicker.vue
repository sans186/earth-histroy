<script setup lang="ts">
/**
 * The story picker reads like a printed index: one row per route, with a
 * 3:2 cover plate on the left and a short introduction on the right. Covers
 * live in src/assets/stories and fall back to a typographic plate when absent.
 */
import { onBeforeUnmount, onMounted, reactive } from 'vue';
import type { Story } from '@/types/story';
import { useUiStore } from '@/stores/ui';
import { coverFor } from '@/data/storyCovers';
import { formatYearCompact } from '@/lib/format';

const props = defineProps<{ stories: Story[] }>();
const emit = defineEmits<{ select: [Story]; close: [] }>();

const ui = useUiStore();
const broken = reactive(new Set<string>());

const coverFiles = import.meta.glob<string>('../assets/stories/*.jpg', {
  eager: true,
  query: '?url',
  import: 'default',
});

const coverUrls: Record<string, string> = {};
for (const [path, url] of Object.entries(coverFiles)) {
  const name = path.split('/').pop()?.replace(/\.jpg$/i, '');
  if (name) coverUrls[name] = url;
}

function titleOf(story: Story) {
  return ui.locale === 'zh' ? story.title : (story.titleEn ?? story.title);
}

function subtitleOf(story: Story) {
  return ui.locale === 'zh' ? story.subtitle : (story.subtitleEn ?? story.subtitle);
}

function introOf(story: Story) {
  const cover = coverFor(story.id);
  if (!cover) return subtitleOf(story);
  return ui.locale === 'zh' ? cover.intro : cover.introEn;
}

function coverSrc(story: Story) {
  return coverUrls[story.id] ?? '';
}

function spanOf(story: Story) {
  const years = story.steps.map((step) => step.year);
  if (!years.length) return '';
  const first = Math.min(...years);
  const last = Math.max(...years);
  const from = formatYearCompact(first, ui.locale);
  return first === last ? from : `${from} – ${formatYearCompact(last, ui.locale)}`;
}

function indexOf(index: number) {
  return String(index + 1).padStart(2, '0');
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
        <div class="titles">
          <h2>{{ ui.t('story.pick') }}</h2>
          <p class="hint">{{ ui.t('story.pickHint') }}</p>
        </div>
        <button class="close" :aria-label="ui.t('story.close')" @click="emit('close')">×</button>
      </header>

      <ol class="list">
        <li v-for="(story, index) in props.stories" :key="story.id">
          <button class="row" @click="emit('select', story)">
            <span class="frame">
              <img
                v-if="coverSrc(story) && !broken.has(story.id)"
                :src="coverSrc(story)"
                :alt="titleOf(story)"
                loading="lazy"
                decoding="async"
                @error="broken.add(story.id)"
              />
              <span v-else class="plate">
                <span class="plate-no mono">{{ indexOf(index) }}</span>
                <span class="plate-title">{{ titleOf(story) }}</span>
                <span class="plate-label mono">{{ ui.t('story.plate') }}</span>
              </span>
            </span>

            <span class="copy">
              <span class="meta mono">
                <span class="index">{{ indexOf(index) }}</span>
                <span class="years">{{ spanOf(story) }}</span>
              </span>
              <span class="title">{{ titleOf(story) }}</span>
              <span class="intro">{{ introOf(story) }}</span>
              <span class="foot">
                <span class="steps mono">{{
                  ui.tf('story.steps', { count: story.steps.length })
                }}</span>
                <span class="go" aria-hidden="true">→</span>
              </span>
            </span>
          </button>
        </li>
      </ol>
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
  padding: 28px;
  background: var(--veil);
  backdrop-filter: blur(3px);
}

.dialog {
  width: min(900px, 100%);
  max-height: calc(100vh - 56px);
  display: flex;
  flex-direction: column;
  background: var(--card);
  border: 1px solid var(--rule-2);
  box-shadow: var(--shadow-2);
}

header {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 24px 28px 20px;
  border-bottom: 1px solid var(--rule);
}
.titles {
  min-width: 0;
}
header h2 {
  font-family: var(--font-display);
  font-size: var(--fs-h1);
  font-weight: 600;
  line-height: 1.15;
  color: var(--ink);
}
.hint {
  margin-top: 6px;
  font-size: var(--fs-sm);
  line-height: 1.6;
  color: var(--ink-3);
}
.close {
  margin-left: auto;
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  line-height: 1;
  font-size: 20px;
  color: var(--ink-3);
  border: 1px solid transparent;
  transition: color var(--dur) var(--ease), border-color var(--dur) var(--ease);
}
.close:hover {
  color: var(--ink);
  border-color: var(--rule-2);
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}
.list li + li {
  border-top: 1px solid var(--rule);
}

.row {
  display: grid;
  grid-template-columns: 216px minmax(0, 1fr);
  gap: 24px;
  width: 100%;
  padding: 20px 28px;
  text-align: left;
  background: transparent;
  transition: background var(--dur) var(--ease);
}
.row:hover {
  background: var(--paper);
}
.row:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.frame {
  position: relative;
  display: block;
  aspect-ratio: 3 / 2;
  overflow: hidden;
  background: var(--paper-2);
  border: 1px solid var(--rule);
}
.frame img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: saturate(0.86) contrast(0.98);
  transition: transform 620ms var(--ease);
}
.row:hover .frame img {
  transform: scale(1.035);
}

.plate {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 14px;
  background: var(--paper-2);
}
.plate::before {
  content: '';
  position: absolute;
  inset: 7px;
  border: 1px solid var(--rule-2);
  pointer-events: none;
}
.plate-no {
  font-size: 10px;
  letter-spacing: 0.2em;
  color: var(--ink-3);
}
.plate-title {
  font-family: var(--font-display);
  font-size: 19px;
  line-height: 1.3;
  color: var(--ink-2);
  padding-right: 8px;
}
.plate-label {
  font-size: 9px;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: var(--ink-4);
}

.copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 6px;
  padding: 2px 0;
}
.meta {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 10.5px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink-4);
}
.meta .index {
  color: var(--accent);
}
.title {
  font-family: var(--font-display);
  font-size: 21px;
  line-height: 1.25;
  color: var(--ink);
}
.intro {
  max-width: 56ch;
  font-size: 13.5px;
  line-height: 1.7;
  color: var(--ink-2);
}
.foot {
  margin-top: auto;
  display: flex;
  align-items: center;
  gap: 12px;
  padding-top: 8px;
}
.steps {
  font-size: 10.5px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-4);
}
.go {
  margin-left: auto;
  font-size: 18px;
  color: var(--ink-3);
  transition: transform var(--dur) var(--ease), color var(--dur) var(--ease);
}
.row:hover .go {
  color: var(--accent);
  transform: translateX(4px);
}

@media (max-width: 720px) {
  .backdrop {
    padding: 0;
  }
  .dialog {
    width: 100%;
    height: 100%;
    max-height: 100vh;
    border: 0;
  }
  header {
    padding: 20px;
  }
  .row {
    grid-template-columns: 128px minmax(0, 1fr);
    gap: 16px;
    padding: 16px 20px;
  }
  .title {
    font-size: 18px;
  }
  .intro {
    font-size: 12.5px;
    line-height: 1.6;
  }
  .plate-title {
    font-size: 15px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .row,
  .frame img,
  .go {
    transition: none;
  }
  .row:hover .frame img {
    transform: none;
  }
}
</style>
