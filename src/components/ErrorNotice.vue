<script setup lang="ts">
/**
 * The one user-visible error surface.
 *
 * Data failures are a non-blocking toast: the reader keeps whatever did load.
 * A renderer that could not start is fatal and gets a blocking card, because
 * there is nothing left to interact with. Both carry the same diagnostics
 * export, so a report is a copy/paste rather than a description of a blank page.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import {
  currentFailures,
  onFailuresChanged,
  resetFailures,
  type FailureRecord,
} from '@/services/http';
import { useUiStore } from '@/stores/ui';

const emit = defineEmits<{ retry: [] }>();
const ui = useUiStore();

const err = computed(() => ui.error);
const fatal = computed(() => !!err.value && err.value.kind !== 'data');
const showDetails = ref(false);
const copied = ref(false);
const copyFailed = ref(false);

const failures = ref<FailureRecord[]>([]);
let stop: (() => void) | null = null;

onMounted(() => {
  failures.value = currentFailures();
  stop = onFailuresChanged((records) => {
    failures.value = records;
  });
});
onBeforeUnmount(() => stop?.());

function shortUrl(url: string): string {
  return url.length > 46 ? `…${url.slice(-43)}` : url;
}

/**
 * Dismiss also drops the active failure set, otherwise the next unrelated
 * failure would re-open a banner listing resources the reader already waved
 * away. The bounded history (and therefore the diagnostics blob) is kept.
 */
function dismiss() {
  resetFailures();
  ui.dismissError();
}

function retry() {
  if (fatal.value) {
    window.location.reload();
    return;
  }
  emit('retry');
}

async function copyDiagnostics() {
  const text = err.value?.diagnostics ?? '';
  try {
    await navigator.clipboard.writeText(text);
    copied.value = true;
    copyFailed.value = false;
  } catch {
    // Clipboard access is unavailable on file:// and plain HTTP in some
    // browsers. Opening the text makes a manual copy possible instead.
    showDetails.value = true;
    copyFailed.value = true;
    copied.value = false;
  }
  window.setTimeout(() => {
    copied.value = false;
    copyFailed.value = false;
  }, 2500);
}
</script>

<template>
  <Transition name="notice">
    <div
      v-if="err"
      :class="['notice', fatal ? 'is-fatal' : 'is-toast']"
      role="alert"
      :aria-live="fatal ? 'assertive' : 'polite'"
    >
      <div class="panel">
        <div class="heading">
          <span class="mark" aria-hidden="true" />
          <span class="title">{{ err.title }}</span>
          <button
            v-if="!fatal"
            class="dismiss"
            type="button"
            :title="ui.t('error.dismiss')"
            :aria-label="ui.t('error.dismiss')"
            @click="dismiss"
          >
            ×
          </button>
        </div>

        <p class="hint">{{ err.hint }}</p>

        <ul v-if="!fatal && failures.length" class="failures">
          <li v-for="f in failures.slice(0, 3)" :key="f.url">
            <span class="mono">{{ shortUrl(f.url) }}</span>
            <span class="dim">
              {{ ui.tf('error.failure', { kind: f.kind, status: f.status ?? '-', attempts: f.attempts }) }}
            </span>
          </li>
          <li v-if="failures.length > 3" class="dim">… +{{ failures.length - 3 }}</li>
        </ul>

        <div class="actions">
          <button class="primary" type="button" @click="retry">
            {{ fatal ? ui.t('error.reload') : ui.t('error.retry') }}
          </button>
          <button type="button" @click="showDetails = !showDetails">
            {{ showDetails ? ui.t('error.hideDetails') : ui.t('error.details') }}
          </button>
          <button type="button" @click="copyDiagnostics">
            {{ copied ? ui.t('error.copied') : copyFailed ? ui.t('error.copyFailed') : ui.t('error.copy') }}
          </button>
        </div>

        <template v-if="showDetails">
          <p class="privacy">{{ ui.t('error.diagnosticsHint') }}</p>
          <pre class="details">{{ err.diagnostics }}</pre>
        </template>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.notice {
  position: absolute;
  z-index: 30;
}
.is-toast {
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  width: min(620px, calc(100% - 24px));
}
.is-fatal {
  inset: 0;
  z-index: 40;
  display: grid;
  place-items: center;
  padding: 20px;
  background: var(--veil);
  backdrop-filter: blur(2px);
}
.panel {
  border: 1px solid var(--rule-2);
  border-left: 3px solid var(--rust);
  background: var(--card);
  box-shadow: var(--shadow-1);
  padding: 14px 16px;
  max-height: min(70vh, 560px);
  overflow: auto;
}
.is-fatal .panel {
  width: min(520px, 100%);
  text-align: left;
}
.heading {
  display: flex;
  align-items: center;
  gap: 9px;
}
.mark {
  width: 14px;
  height: 2px;
  flex: none;
  background: var(--rust);
}
.title {
  font-family: var(--font-display);
  font-size: var(--fs-h3, 17px);
  font-weight: 600;
  color: var(--ink);
}
.dismiss {
  margin-left: auto;
  border: 0;
  background: none;
  color: var(--ink-3);
  font-size: 18px;
  line-height: 1;
  padding: 0 2px;
}
.dismiss:hover {
  color: var(--ink);
}
.hint {
  margin: 8px 0 0;
  font-size: var(--fs-sm);
  line-height: 1.6;
  color: var(--ink-2);
}
.failures {
  margin: 10px 0 0;
  padding: 8px 10px;
  list-style: none;
  border-top: 1px solid var(--rule);
  background: var(--paper-2);
  font-size: 12px;
}
.failures li {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  justify-content: space-between;
  padding: 2px 0;
}
.mono {
  font-family: var(--font-mono);
  color: var(--ink-2);
  word-break: break-all;
}
.dim {
  color: var(--ink-3);
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
.actions button {
  border: 1px solid var(--rule-2);
  background: var(--card);
  color: var(--ink-2);
  padding: 5px 12px;
  font-size: var(--fs-sm);
}
.actions button:hover {
  border-color: var(--rule-3);
  color: var(--ink);
}
.actions .primary {
  border-color: var(--rust);
  color: var(--rust);
}
.actions .primary:hover {
  background: var(--rust-soft);
}
.privacy {
  margin: 12px 0 4px;
  font-size: 12px;
  color: var(--ink-3);
}
.details {
  margin: 0;
  padding: 10px;
  border: 1px solid var(--rule);
  background: var(--paper-2);
  font-family: var(--font-mono);
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--ink-2);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 240px;
  overflow: auto;
  user-select: text;
}
.notice-enter-active,
.notice-leave-active {
  transition: opacity 160ms var(--ease);
}
.notice-enter-from,
.notice-leave-to {
  opacity: 0;
}
</style>
