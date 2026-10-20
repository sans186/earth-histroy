import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { DEFAULT_YEAR, YEAR_MAX, YEAR_MIN, getEra, scaleToYear, yearToScale } from '@/config';

const clampYear = (v: number) => Math.min(YEAR_MAX, Math.max(YEAR_MIN, Math.round(v)));

/**
 * How far one arrow-key press moves the clock.
 *
 * The interface has no step control and no playback; the timeline is a
 * scrubbing tool, and a fixed stride keeps dragging and the keyboard
 * consistent instead of asking the reader to pick a number first.
 */
export const ARROW_STRIDE = 5;

export const useTimelineStore = defineStore('timeline', () => {
  const year = ref(DEFAULT_YEAR);
  const scale = ref(yearToScale(DEFAULT_YEAR));

  const era = computed(() => getEra(year.value));
  const isBCE = computed(() => year.value < 0);
  const absYear = computed(() => Math.abs(year.value));

  function setYear(next: number) {
    const v = clampYear(next);
    if (v === year.value) return;
    year.value = v;
    scale.value = yearToScale(v);
  }

  function setScale(next: number) {
    scale.value = next;
    const v = scaleToYear(next);
    if (v !== year.value) year.value = v;
  }

  function stepBy(delta: number) {
    setYear(year.value + delta);
  }

  /** One arrow-key press. `direction` is -1 for earlier, 1 for later. */
  function nudge(direction: -1 | 1) {
    setYear(year.value + direction * ARROW_STRIDE);
  }

  function goToEra(start: number) {
    setYear(start + 1);
  }

  return {
    year,
    scale,
    era,
    isBCE,
    absYear,
    setYear,
    setScale,
    stepBy,
    nudge,
    goToEra,
  };
});
