import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { translate, type MessageKey } from '@/lib/i18n';
import type { Locale, TimelineEvent, ViewMode } from '@/types';

function readStored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key) as T | null;
    return v && (allowed as readonly string[]).includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

export const useUiStore = defineStore('ui', () => {
  const locale = ref<Locale>(readStored<Locale>('earth.locale', ['zh', 'en'], 'zh'));
  const view = ref<ViewMode>('explore');

  const blockingTasks = ref(0);
  const backgroundTasks = ref(0);
  const loadingLabel = ref<MessageKey>('loading.events');
  const error = ref<string | null>(null);

  const selectedEvent = ref<TimelineEvent | null>(null);

  /** Blocks the interface — used for the first paint of the current year. */
  const loading = computed(() => blockingTasks.value > 0);
  /** Anything still in flight, including background enhancement layers. */
  const busy = computed(() => blockingTasks.value + backgroundTasks.value > 0);

  function t(key: MessageKey) {
    return translate(locale.value, key);
  }

  /**
   * Register a task and get its completion callback.
   * `blocking: false` keeps the globe interactive while a heavy layer loads.
   */
  function beginTask(label: MessageKey, blocking = true) {
    loadingLabel.value = label;
    if (blocking) blockingTasks.value += 1;
    else backgroundTasks.value += 1;
    return () => {
      if (blocking) blockingTasks.value = Math.max(0, blockingTasks.value - 1);
      else backgroundTasks.value = Math.max(0, backgroundTasks.value - 1);
    };
  }

  function setError(message: string | null) {
    error.value = message;
  }

  function setLocale(next: Locale) {
    locale.value = next;
    try {
      localStorage.setItem('earth.locale', next);
    } catch {
      /* storage unavailable */
    }
  }

  function toggleLocale() {
    setLocale(locale.value === 'zh' ? 'en' : 'zh');
  }

  function setView(next: ViewMode) {
    view.value = next;
    selectedEvent.value = null;
  }

  return {
    locale,
    view,
    loading,
    busy,
    loadingLabel,
    error,
    selectedEvent,
    t,
    beginTask,
    setError,
    setLocale,
    toggleLocale,
    setView,
  };
});
