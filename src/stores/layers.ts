import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { CATEGORY_KEYS, type CategoryKey } from '@/config';
import type { PolityStatus } from '@/types';

export type BaseLayerId = 'standard' | 'satellite';

export const useLayersStore = defineStore('layers', () => {
  const base = ref<BaseLayerId>('standard');

  const showPolities = ref(true);
  const showBorders = ref(false);
  const showEvents = ref(true);
  const showLabels = ref(true);

  /** Names of the polities themselves, as opposed to the event titles. */
  const showPolityNames = ref(true);

  /** War theatre markers. Off by default — a separate reading mode. */
  const showWars = ref(false);

  /**
   * Loading the neighbouring century files makes the polity layer more
   * complete, but each file is tens of megabytes. Off by default.
   */
  const adjacentCenturies = ref(false);

  const activeCategories = ref<CategoryKey[]>([...CATEGORY_KEYS]);

  const eventCount = ref(0);
  const locatedCount = ref(0);

  const polityStatus = ref<PolityStatus>({
    year: 0,
    shown: 0,
    matched: 0,
    cap: 0,
    hidden: 0,
    partsHidden: 0,
    loading: false,
    ready: false,
  });

  const allActive = computed(() => activeCategories.value.length === CATEGORY_KEYS.length);

  function isActive(key: CategoryKey) {
    return activeCategories.value.includes(key);
  }

  function toggleCategory(key: CategoryKey) {
    const set = new Set(activeCategories.value);
    if (set.has(key)) set.delete(key);
    else set.add(key);
    // Keep canonical order so filter chips never jump around.
    activeCategories.value = CATEGORY_KEYS.filter((k) => set.has(k));
  }

  function toggleAllCategories() {
    activeCategories.value = allActive.value ? [] : [...CATEGORY_KEYS];
  }

  return {
    base,
    showPolities,
    showBorders,
    showEvents,
    showLabels,
    showPolityNames,
    showWars,
    adjacentCenturies,
    activeCategories,
    eventCount,
    locatedCount,
    polityStatus,
    allActive,
    isActive,
    toggleCategory,
    toggleAllCategories,
  };
});
