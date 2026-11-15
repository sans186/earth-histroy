import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { translate, type MessageKey } from '@/lib/i18n';
import type { PolityScope } from '@/lib/polityScope';
import type { Locale, StageMode, TimelineEvent, ViewMode } from '@/types';

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
  const stage = ref<StageMode>('2d');

  const blockingTasks = ref(0);
  const backgroundTasks = ref(0);
  const loadingLabel = ref<MessageKey>('loading.events');
  const error = ref<string | null>(null);

  const selectedEvent = ref<TimelineEvent | null>(null);

  /**
   * The polity whose card is open.
   *
   * It lives here rather than in App.vue because three panels now filter by it;
   * a component-local ref would have forced each panel to be handed the feature
   * through props on every path that can select one.
   */
  const polityScope = ref<PolityScope | null>(null);
  /** Whether the lists show only what falls inside `polityScope`. */
  const scopeToPolity = ref(false);

  function setPolityScope(scope: PolityScope | null) {
    polityScope.value = scope;
    // Losing the polity must not leave the lists silently filtered.
    if (!scope) scopeToPolity.value = false;
  }

  function toggleScopeToPolity() {
    if (!polityScope.value) return;
    scopeToPolity.value = !scopeToPolity.value;
  }

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

  /**
   * Which renderer draws the explore view.
   *
   * Kept out of `view` on purpose: "explore" is what you are looking at,
   * 3D/2D is how it is drawn, and the comparison board is orthogonal to both.
   */
  function setStage(next: StageMode) {
    stage.value = next;
    selectedEvent.value = null;
  }

  return {
    locale,
    view,
    stage,
    setStage,
    loading,
    busy,
    loadingLabel,
    error,
    selectedEvent,
    polityScope,
    scopeToPolity,
    setPolityScope,
    toggleScopeToPolity,
    t,
    beginTask,
    setError,
    setLocale,
    toggleLocale,
    setView,
  };
});
