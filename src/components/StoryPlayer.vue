<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { Story, StoryStep } from '@/types/story';
import { useUiStore } from '@/stores/ui';

const props = defineProps<{ story: Story }>();
const emit = defineEmits<{
  step: [StoryStep];
  close: [];
  transition: [{ from: StoryStep; to: StoryStep }];
}>();

const ui = useUiStore();

const index = ref(0);
const playing = ref(false);
/** 0–1 on the current step, driven by requestAnimationFrame. */
const progress = ref(0);

/** True while App animates the route to the next/previous step. */
const transitioning = ref(false);

const step = computed(() => props.story.steps[index.value]);
const atStart = computed(() => index.value === 0);
const atEnd = computed(() => index.value >= props.story.steps.length - 1);

/* Chinese is the original copy; English falls back to it when untranslated. */
const title = computed(() =>
  ui.locale === 'zh' ? props.story.title : (props.story.titleEn ?? props.story.title),
);
const subtitle = computed(() =>
  ui.locale === 'zh' ? props.story.subtitle : (props.story.subtitleEn ?? props.story.subtitle),
);
const stepTitle = computed(() => {
  const current = step.value;
  if (!current) return '';
  return ui.locale === 'zh' ? current.title : (current.titleEn ?? current.title);
});
const stepCaption = computed(() => {
  const current = step.value;
  if (!current) return '';
  return ui.locale === 'zh' ? current.caption : (current.captionEn ?? current.caption);
});

let raf = 0;
let last = 0;
/** Milliseconds already spent on the current step — preserved while paused. */
let elapsed = 0;
/** The step index to land on once `finishTransition` runs. */
let pendingIndex = -1;

function stepDuration() {
  return Math.max(1, step.value?.duration ?? 1);
}

function emitStep() {
  if (step.value) emit('step', step.value);
}

function tick(ts: number) {
  if (!playing.value || transitioning.value) return;
  if (!last) last = ts;
  elapsed += ts - last;
  last = ts;

  const total = stepDuration();
  progress.value = Math.min(1, elapsed / total);

  if (elapsed >= total) {
    if (atEnd.value) {
      playing.value = false;
      progress.value = 1;
      raf = 0;
      return;
    }
    beginTransition(index.value + 1);
    return;
  }

  raf = window.requestAnimationFrame(tick);
}

function startLoop() {
  window.cancelAnimationFrame(raf);
  last = 0;
  raf = window.requestAnimationFrame(tick);
}

/**
 * Hand a step change to App so it can animate the route first.
 *
 * The index is not advanced here: `finishTransition` does that once the route
 * animation has landed, so the caption and map always move together.
 */
function beginTransition(next: number) {
  if (transitioning.value) return;
  const clamped = Math.max(0, Math.min(props.story.steps.length - 1, next));
  if (clamped === index.value) return;

  pendingIndex = clamped;
  transitioning.value = true;
  window.cancelAnimationFrame(raf);
  raf = 0;
  last = 0;
  emit('transition', { from: step.value, to: props.story.steps[clamped] });
}

/**
 * Called by App once the route animation has finished: commit the pending step
 * and keep the timer running.
 */
function finishTransition() {
  if (!transitioning.value) return;
  index.value = pendingIndex;
  pendingIndex = -1;
  transitioning.value = false;
  elapsed = 0;
  progress.value = 0;
  last = 0;
  emitStep();
  if (playing.value) startLoop();
}

defineExpose({ finishTransition });

function play() {
  if (playing.value) return;
  // Replay from the top once the final step has finished.
  if (atEnd.value && progress.value >= 1) {
    index.value = 0;
    elapsed = 0;
    progress.value = 0;
    emitStep();
  }
  playing.value = true;
  startLoop();
}

function pause() {
  if (!playing.value) return;
  playing.value = false;
  window.cancelAnimationFrame(raf);
  raf = 0;
}

function toggle() {
  if (playing.value) pause();
  else play();
}

function next() {
  if (atEnd.value) return;
  beginTransition(index.value + 1);
}

function prev() {
  if (atStart.value) return;
  beginTransition(index.value - 1);
}

function close() {
  pause();
  emit('close');
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') close();
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
  emitStep();
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  window.cancelAnimationFrame(raf);
});
</script>

<template>
  <section v-if="step" class="player" role="region" :aria-label="title">
    <header class="head">
      <div class="titles">
        <h3>{{ title }}</h3>
        <p>{{ subtitle }}</p>
      </div>
      <button class="close" :aria-label="ui.t('story.close')" @click="close">×</button>
    </header>

    <Transition name="fade" mode="out-in">
      <p :key="index" class="caption">
        <span class="stop">{{ stepTitle }}</span>
        {{ stepCaption }}
      </p>
    </Transition>

    <div
      class="track"
      role="progressbar"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="Math.round(progress * 100)"
    >
      <i :style="{ width: `${progress * 100}%` }" />
    </div>

    <div class="controls">
      <button class="btn" :disabled="atStart" @click="prev">{{ ui.t('story.prev') }}</button>
      <button class="btn primary" @click="toggle">
        {{ playing ? ui.t('story.pause') : ui.t('story.play') }}
      </button>
      <button class="btn" :disabled="atEnd" @click="next">{{ ui.t('story.next') }}</button>
      <span class="pos mono">{{ index + 1 }} / {{ story.steps.length }}</span>
    </div>

    <p class="credit">AI 辅助生成 · 已人工校对</p>
  </section>
</template>

<style scoped>
.player {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  width: min(640px, calc(100vw - 32px));
  z-index: 60;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 18px 14px;
  background: color-mix(in srgb, var(--card) 76%, transparent);
  backdrop-filter: blur(14px) saturate(1.05);
  -webkit-backdrop-filter: blur(14px) saturate(1.05);
  border: 1px solid color-mix(in srgb, var(--rule-2) 70%, transparent);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
}

.head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.titles {
  min-width: 0;
}
.titles h3 {
  font-family: var(--font-display);
  font-size: var(--fs-h3);
  line-height: 1.25;
  color: var(--ink);
  text-shadow: 0 1px 2px rgba(255, 255, 255, 0.55);
}
.titles p {
  margin-top: 3px;
  font-size: 12.5px;
  letter-spacing: 0.06em;
  color: var(--ink-2);
  text-shadow: 0 1px 2px rgba(255, 255, 255, 0.55);
}
.close {
  flex: none;
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

.caption {
  /* Two lines of room, so the panel does not jump between steps. */
  min-height: 3.4em;
  font-size: var(--fs-sm);
  line-height: 1.7;
  color: var(--ink-2);
  text-shadow: 0 1px 2px rgba(255, 255, 255, 0.55);
}
.caption .stop {
  margin-right: 6px;
  font-family: var(--font-display);
  color: var(--ink);
  text-shadow: 0 1px 2px rgba(255, 255, 255, 0.55);
}

.track {
  height: 3px;
  background: var(--rule);
  overflow: hidden;
}
.track i {
  display: block;
  height: 100%;
  background: var(--rust);
}

.controls {
  display: flex;
  align-items: center;
  gap: 8px;
}
.btn {
  padding: 4px 12px;
  font-size: 12.5px;
  letter-spacing: 0.08em;
  color: var(--ink-2);
  border: 1px solid var(--rule-2);
  transition: color var(--dur) var(--ease), border-color var(--dur) var(--ease);
}
.btn:hover:not(:disabled) {
  color: var(--ink);
  border-color: var(--rule-3);
}
.btn:disabled {
  color: var(--ink-4);
  cursor: not-allowed;
  opacity: 0.6;
}
.btn.primary {
  color: var(--rust);
  border-color: color-mix(in srgb, var(--rust) 45%, transparent);
}
.btn.primary:hover:not(:disabled) {
  border-color: var(--rust);
}
.pos {
  margin-left: auto;
  font-size: 11.5px;
  letter-spacing: 0.12em;
  color: var(--ink-4);
}

.credit {
  font-size: 11px;
  color: var(--ink-3);
  text-align: right;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 200ms var(--ease);
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
