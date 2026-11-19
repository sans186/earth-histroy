<script setup lang="ts">
import { computed } from 'vue';
import { SCALE_MAX, yearToScale } from '@/config';
import { placeSegmentAt, placeSegments } from '@/lib/place';
import type { PlaceCity } from '@/types';

const props = defineProps<{
  city: PlaceCity;
  year: number;
  /** English polity name → localised name. Missing entries fall back. */
  names?: Record<string, string>;
}>();
const emit = defineEmits<{ select: [number] }>();

const label = (name: string) => props.names?.[name] ?? name;

const all = computed(() => placeSegments(props.city));

/**
 * Positioned on the same piecewise scale as the main timeline, so a century
 * that is compressed there is compressed here too — the two cursors line up.
 */
const segments = computed(() =>
  all.value.map((seg) => {
    const left = (yearToScale(seg.from) / SCALE_MAX) * 100;
    const right = (yearToScale(seg.to) / SCALE_MAX) * 100;
    return { ...seg, left, width: Math.max(right - left, 0.5) };
  }),
);

const cursor = computed(() => (yearToScale(props.year) / SCALE_MAX) * 100);
const current = computed(() => placeSegmentAt(all.value, props.year));

function isCurrent(seg: { from: number; to: number; name: string }) {
  return current.value?.from === seg.from && current.value?.name === seg.name;
}

function jump(seg: { from: number; to: number }) {
  emit('select', Math.round((seg.from + seg.to) / 2));
}
</script>

<template>
  <div class="band" role="group">
    <button
      v-for="seg in segments"
      :key="`${seg.from}-${seg.name}`"
      class="seg"
      :class="{ contested: seg.contested, on: isCurrent(seg) }"
      :style="{ left: `${seg.left}%`, width: `${seg.width}%` }"
      :title="`${label(seg.name)} · ${seg.from} – ${seg.to}`"
      @click="jump(seg)"
    >
      <span v-if="seg.width > 7">{{ label(seg.name) }}</span>
    </button>
    <div class="cursor" :style="{ left: `${cursor}%` }" aria-hidden="true" />
  </div>
</template>

<style scoped>
.band {
  position: relative;
  height: 26px;
  border: 1px solid var(--rule);
  border-radius: var(--radius);
  background: var(--paper);
  overflow: hidden;
}
.seg {
  position: absolute;
  top: 0;
  bottom: 0;
  min-width: 0;
  padding: 0 2px;
  border: 0;
  border-right: 1px solid var(--paper);
  background: color-mix(in srgb, var(--rust) 26%, var(--paper));
  color: var(--ink-2);
  font-size: 10px;
  letter-spacing: 0.02em;
  line-height: 26px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  cursor: pointer;
}
.seg:hover {
  background: color-mix(in srgb, var(--rust) 38%, var(--paper));
}
.seg.on {
  background: color-mix(in srgb, var(--rust) 58%, var(--paper));
  color: var(--ink);
  font-weight: 600;
}
/* Overlapping claims: hatched instead of pretending one is correct. */
.seg.contested {
  background-image: repeating-linear-gradient(
    45deg,
    transparent 0 4px,
    color-mix(in srgb, var(--rust) 26%, transparent) 4px 5px
  );
}
.cursor {
  position: absolute;
  top: -1px;
  bottom: -1px;
  width: 2px;
  background: var(--ink);
  transform: translateX(-1px);
  pointer-events: none;
}
</style>
