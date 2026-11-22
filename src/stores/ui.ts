import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { translate, type MessageKey } from '@/lib/i18n';
import type { AppError } from '@/lib/appError';
import type { PolityScope } from '@/lib/polityScope';
import type { Locale, PlaceFocus, StageMode, TimelineEvent, ViewMode } from '@/types';

function readStored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key) as T | null;
    return v && (allowed as readonly string[]).includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

const LOCALE_LANG: Record<Locale, string> = { zh: 'zh-CN', en: 'en' };

/** Keep the document language in step with the interface language. */
function applyDocumentLang(value: Locale) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = LOCALE_LANG[value];
}

const initialLocale = readStored<Locale>('earth.locale', ['zh', 'en'], 'zh');
applyDocumentLang(initialLocale);

export const useUiStore = defineStore('ui', () => {
  const locale = ref<Locale>(initialLocale);
  const view = ref<ViewMode>('explore');
  const stage = ref<StageMode>('2d');

  const blockingTasks = ref(0);
  const backgroundTasks = ref(0);
  const loadingLabel = ref<MessageKey>('loading.events');

  /**
   * The single user-visible failure state, shared by the data layer and both
   * renderers. `AppError` carries the wording, the next step and a sanitized
   * diagnostics payload, so the banner never has to interpret a raw message.
   */
  const error = ref<AppError | null>(null);
  /**
   * Bumped by the shared Retry action. Renderer stages that own their own
   * enhancement loads watch it so one button re-issues everything.
   */
  const retryToken = ref(0);

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

  /**
   * The place whose chronicle is open in the「地点」tab.
   *
   * Kept here rather than in the panel because the deep link and the map's
   * blank-space click both need to set it without reaching into a component.
   */
  const placeFocus = ref<PlaceFocus | null>(null);

  function setPlaceFocus(next: PlaceFocus | null) {
    placeFocus.value = next;
  }

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

  /** Like `t`, with `{name}` placeholders — used for counts in error messages. */
  function tf(key: MessageKey, vars: Record<string, string | number> = {}) {
    let text = translate(locale.value, key);
    for (const [name, value] of Object.entries(vars)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
    return text;
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

  function setError(next: AppError | null) {
    error.value = next;
  }

  /** Dismiss without pretending the underlying data has recovered. */
  function dismissError() {
    error.value = null;
  }

  function bumpRetryToken() {
    retryToken.value += 1;
  }

  function setLocale(next: Locale) {
    locale.value = next;
    applyDocumentLang(next);
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
    placeFocus.value = null;
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
    retryToken,
    selectedEvent,
    polityScope,
    scopeToPolity,
    setPolityScope,
    toggleScopeToPolity,
    placeFocus,
    setPlaceFocus,
    t,
    tf,
    beginTask,
    setError,
    dismissError,
    bumpRetryToken,
    setLocale,
    toggleLocale,
    setView,
  };
});
