import { createApp } from 'vue';
import { createPinia } from 'pinia';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import './styles/tokens.css';
import './styles/base.css';
import App from './App.vue';
import { unexpectedError } from './lib/appError';
import { useUiStore } from './stores/ui';

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);
app.mount('#app');

const ui = useUiStore(pinia);

/**
 * Last-resort reporting for failures no component can route anywhere.
 *
 * A render error or an unhandled rejection otherwise only reaches the console:
 * the reader sees a frozen panel with nothing explaining why. Each source gets
 * its own bucket so a failing watcher cannot drown out a network failure, and a
 * repeating error is shown at most once per window — a render loop would
 * otherwise re-create the banner on every frame.
 */
const UI_ERROR_THROTTLE_MS = 30_000;
const lastShownAt = new Map<string, number>();

function reportUnexpected(bucket: string, detail: unknown) {
  // The banner is single-slot: an existing message is closer to the reader's
  // problem than whatever fired next, and silently replacing it would hide the
  // failure they were already acting on.
  if (ui.error) return;
  const now = Date.now();
  if (now - (lastShownAt.get(bucket) ?? 0) < UI_ERROR_THROTTLE_MS) return;
  lastShownAt.set(bucket, now);
  ui.setError(unexpectedError(ui.locale, detail));
}

app.config.errorHandler = (err, _instance, info) => {
  reportUnexpected(`vue:${info}`, err);
};

window.addEventListener('error', (event) => {
  reportUnexpected('window', event.error ?? event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  reportUnexpected('rejection', event.reason);
});
