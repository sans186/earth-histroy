<script setup lang="ts">
/**
 * The unified settings drawer.
 *
 * It owns every switch that used to live in the side panel's「图层」tab, plus
 * the display preferences that had no home. The data layer is untouched: this
 * component binds the same `layers` / `ui` store fields the old panel did, so
 * the two can never disagree.
 *
 * Only the last-viewed group is persisted. The settings themselves stay in
 * memory, matching how the rest of the interface behaves in a session.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { CATEGORY_KEYS, CATEGORIES, type CategoryKey } from '@/config';
import type { CertaintyLevel } from '@/lib/format';
import {
  currentFailures,
  diagnosticSnapshot,
  onFailuresChanged,
  type FailureRecord,
} from '@/services/http';
import { useLayersStore } from '@/stores/layers';
import { useUiStore } from '@/stores/ui';
import ToggleRow from './ui/ToggleRow.vue';

type Group = 'map' | 'content' | 'ui' | 'data';

defineProps<{
  open: boolean;
  certaintyCounts: Record<CertaintyLevel, number>;
}>();

const emit = defineEmits<{ close: []; openAbout: [] }>();

const ui = useUiStore();
const layers = useLayersStore();

/**
 * Diagnostics outlive the banner.
 *
 * Dismissing ErrorNotice clears both its message and the active failure set, so
 * without a second copy here the export would be unreachable for the rest of
 * the session. The bounded history still holds the records, and the snapshot is
 * built on demand rather than stored, so nothing is captured while idle.
 */
const failures = ref<FailureRecord[]>([]);
const diagnosticsText = ref('');
const copied = ref(false);
const copyFailed = ref(false);
const showText = ref(false);
let stopFailures: (() => void) | null = null;

onMounted(() => {
  failures.value = currentFailures();
  stopFailures = onFailuresChanged((records) => {
    failures.value = records;
  });
});
onBeforeUnmount(() => stopFailures?.());

function shortUrl(url: string): string {
  return url.length > 46 ? `…${url.slice(-43)}` : url;
}

async function copyDiagnostics() {
  const text = JSON.stringify(diagnosticSnapshot(), null, 2);
  diagnosticsText.value = text;
  try {
    await navigator.clipboard.writeText(text);
    copied.value = true;
    copyFailed.value = false;
    showText.value = false;
  } catch {
    // Clipboard access is unavailable on file:// and plain HTTP in some
    // browsers. Showing the text read-only keeps a manual copy possible.
    copied.value = false;
    copyFailed.value = true;
    showText.value = true;
  }
  window.setTimeout(() => {
    copied.value = false;
    copyFailed.value = false;
  }, 2500);
}

function selectAll(event: Event) {
  const el = event.target as HTMLTextAreaElement | null;
  el?.select();
}

const GROUPS: { id: Group; key: 'settings.group.map' | 'settings.group.content' | 'settings.group.ui' | 'settings.group.data' }[] = [
  { id: 'map', key: 'settings.group.map' },
  { id: 'content', key: 'settings.group.content' },
  { id: 'ui', key: 'settings.group.ui' },
  { id: 'data', key: 'settings.group.data' },
];
const SECTION_KEY = 'earth.settings.section';

function readSection(): Group {
  try {
    const v = localStorage.getItem(SECTION_KEY);
    return v && GROUPS.some((g) => g.id === v) ? (v as Group) : 'map';
  } catch {
    return 'map';
  }
}

const group = ref<Group>(readSection());

function selectGroup(next: Group) {
  group.value = next;
  try {
    localStorage.setItem(SECTION_KEY, next);
  } catch {
    /* storage unavailable */
  }
}

const baseOptions = [
  { id: 'standard' as const, key: 'base.standard' as const },
  { id: 'satellite' as const, key: 'base.satellite' as const },
];

const certaintyOptions: { level: CertaintyLevel; key: 'certainty.high' | 'certainty.mid' | 'certainty.low' }[] = [
  { level: 'high', key: 'certainty.high' },
  { level: 'mid', key: 'certainty.mid' },
  { level: 'low', key: 'certainty.low' },
];

function catLabel(key: CategoryKey) {
  const meta = CATEGORIES[key];
  return ui.locale === 'zh' ? meta.zh : meta.en;
}
</script>

<template>
  <Transition name="drawer">
    <div v-if="open" class="veil" @pointerdown.self="emit('close')">
      <aside
        class="drawer"
        role="dialog"
        aria-modal="true"
        :aria-label="ui.t('settings.title')"
      >
        <header class="head">
          <h2>{{ ui.t('settings.title') }}</h2>
          <span class="cap">{{ ui.t('settings.subtitle') }}</span>
          <button
            class="x"
            :title="ui.t('settings.close')"
            :aria-label="ui.t('settings.close')"
            @click="emit('close')"
          >
            ×
          </button>
        </header>

        <nav class="groups" role="tablist">
          <button
            v-for="g in GROUPS"
            :key="g.id"
            role="tab"
            :aria-selected="group === g.id"
            :class="{ on: group === g.id }"
            @click="selectGroup(g.id)"
          >
            {{ ui.t(g.key) }}
          </button>
        </nav>

        <div class="body">
          <!-- 地图与显示 -->
          <section v-show="group === 'map'">
            <div class="field">
              <span class="lab">{{ ui.t('settings.stage') }}</span>
              <div class="seg">
                <button :class="{ on: ui.stage === '3d' }" @click="ui.setStage('3d')">
                  {{ ui.t('stage.3d') }}
                </button>
                <button :class="{ on: ui.stage === '2d' }" @click="ui.setStage('2d')">
                  {{ ui.t('stage.2d') }}
                </button>
              </div>
            </div>

            <div class="field">
              <span class="lab">{{ ui.t('settings.basemap') }}</span>
              <div class="seg">
                <button
                  v-for="opt in baseOptions"
                  :key="opt.id"
                  :class="{ on: layers.base === opt.id }"
                  @click="layers.base = opt.id"
                >
                  {{ ui.t(opt.key) }}
                </button>
              </div>
            </div>

            <h3 class="cap">{{ ui.t('settings.layer') }}</h3>
            <ToggleRow v-model="layers.showEvents" :label="ui.t('layer.events')" />
            <ToggleRow
              v-model="layers.showLabels"
              :label="ui.t('layer.labels')"
              :disabled="!layers.showEvents"
            />
            <ToggleRow v-model="layers.showPolities" :label="ui.t('layer.polities')" />
            <ToggleRow
              v-model="layers.showPolityNames"
              :label="ui.t('layer.polityNames')"
              :hint="ui.t('layer.polityNamesHint')"
              :disabled="!layers.showPolities"
            />
            <ToggleRow
              v-model="layers.adjacentCenturies"
              :label="ui.t('layer.adjacent')"
              :hint="ui.t('layer.slow')"
              :disabled="!layers.showPolities"
            />
            <ToggleRow v-model="layers.showBorders" :label="ui.t('layer.borders')" />
            <ToggleRow v-model="layers.showWars" :label="ui.t('layer.wars')" />
          </section>

          <!-- 内容与可信度 -->
          <section v-show="group === 'content'">
            <h3 class="cap">
              {{ ui.t('settings.categories') }}
              <button class="all" @click="layers.toggleAllCategories()">
                {{ layers.allActive ? ui.t('cat.none') : ui.t('cat.all') }}
              </button>
            </h3>
            <div class="cats">
              <button
                v-for="key in CATEGORY_KEYS"
                :key="key"
                class="chip"
                :class="{ on: layers.isActive(key) }"
                @click="layers.toggleCategory(key)"
              >
                <i :style="{ background: `var(${CATEGORIES[key].cssVar})` }" />
                {{ catLabel(key) }}
              </button>
            </div>

            <h3 class="cap">{{ ui.t('settings.certainty') }}</h3>
            <ToggleRow
              v-for="opt in certaintyOptions"
              :key="opt.level"
              :model-value="layers.isCertaintyActive(opt.level)"
              :label="ui.t(opt.key)"
              :hint="String(certaintyCounts[opt.level])"
              @update:model-value="layers.toggleCertainty(opt.level)"
            />
          </section>

          <!-- 界面与语言 -->
          <section v-show="group === 'ui'">
            <div class="field">
              <span class="lab">{{ ui.t('settings.language') }}</span>
              <div class="seg">
                <button :class="{ on: ui.locale === 'zh' }" @click="ui.setLocale('zh')">
                  中文
                </button>
                <button :class="{ on: ui.locale === 'en' }" @click="ui.setLocale('en')">
                  EN
                </button>
              </div>
            </div>
            <p class="note">{{ ui.t('settings.languageHint') }}</p>
          </section>

          <!-- 数据概况（只读） -->
          <section v-show="group === 'data'">
            <p class="note">{{ ui.t('settings.statsHint') }}</p>
            <dl class="stats">
              <div>
                <dt>{{ ui.t('layer.events') }}</dt>
                <dd class="mono">{{ layers.eventCount }}</dd>
              </div>
              <div>
                <dt>{{ ui.t('status.coords') }}</dt>
                <dd class="mono">{{ layers.locatedCount }}</dd>
              </div>
              <div v-if="layers.polityStatus.ready">
                <dt>{{ ui.t('panel.polity') }}</dt>
                <dd class="mono">{{ layers.polityStatus.shown }}</dd>
              </div>
              <div v-if="layers.polityStatus.ready">
                <dt>{{ ui.t('status.matched') }}</dt>
                <dd class="mono">{{ layers.polityStatus.matched }}</dd>
              </div>
            </dl>
            <p v-if="layers.polityStatus.ready && layers.polityStatus.hidden > 0" class="note">
              {{ layers.polityStatus.hidden }} {{ ui.t('status.polities') }}
              {{ ui.t('status.hidden') }}. {{ ui.t('status.zoomIn') }}
            </p>
            <p
              v-if="layers.polityStatus.ready && layers.polityStatus.partsHidden > 0"
              class="note"
            >
              {{ layers.polityStatus.partsHidden }} {{ ui.t('status.partsHidden') }}.
              {{ ui.t('status.zoomIn') }}
            </p>

            <!-- 诊断：横幅被忽略后仍可导出 -->
            <h3 class="cap diag-head">
              {{ ui.t('error.partial') }}
              <span class="mono diag-count">{{ failures.length }}</span>
            </h3>
            <ul v-if="failures.length" class="fails">
              <li v-for="f in failures.slice(0, 5)" :key="f.url">
                <span class="mono">{{ shortUrl(f.url) }}</span>
                <span class="fail-kind">
                  {{ ui.tf('error.failure', { kind: f.kind, status: f.status ?? '-', attempts: f.attempts }) }}
                </span>
              </li>
              <li v-if="failures.length > 5" class="fail-kind">
                … +{{ failures.length - 5 }}
              </li>
            </ul>
            <div class="diag-actions">
              <button class="diag-copy" type="button" @click="copyDiagnostics">
                {{ copied ? ui.t('error.copied') : copyFailed ? ui.t('error.copyFailed') : ui.t('error.copy') }}
              </button>
              <p class="note">{{ ui.t('error.diagnosticsHint') }}</p>
            </div>
            <textarea
              v-if="showText"
              class="diag-text mono"
              readonly
              rows="7"
              :aria-label="ui.t('error.details')"
              :value="diagnosticsText"
              @focus="selectAll"
            ></textarea>

            <button class="about" @click="emit('openAbout')">
              <span class="about-main">{{ ui.t('nav.about') }}</span>
              <span class="about-sub">{{ ui.t('settings.aboutHint') }}</span>
              <span class="arrow" aria-hidden="true">›</span>
            </button>
          </section>
        </div>
      </aside>
    </div>
  </Transition>
</template>

<style scoped>
.veil {
  position: fixed;
  inset: var(--head-h) 0 var(--foot-h) 0;
  z-index: 40;
  background: rgba(26, 28, 32, 0.18);
}

.drawer {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 420px;
  max-width: 100%;
  display: flex;
  flex-direction: column;
  background: var(--card);
  border-left: 1px solid var(--rule-2);
  box-shadow: var(--shadow-2);
}

.head {
  display: flex;
  align-items: baseline;
  gap: 9px;
  padding: 13px 18px;
  border-bottom: 1px solid var(--rule-2);
  background: var(--paper);
  flex: none;
}
.head h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 17px;
  font-weight: 600;
  letter-spacing: 0.04em;
}
.head .cap {
  font-size: 10px;
  letter-spacing: var(--track-label);
}
.x {
  margin-left: auto;
  align-self: center;
  width: 26px;
  height: 26px;
  border: 1px solid var(--rule);
  background: transparent;
  color: var(--ink-3);
  font-size: 15px;
  line-height: 1;
}
.x:hover {
  color: var(--ink);
  border-color: var(--rule-3);
}

.groups {
  display: flex;
  flex: none;
  border-bottom: 1px solid var(--rule-2);
  background: var(--paper);
}
.groups button {
  flex: 1;
  padding: 8px 4px;
  font-size: 11.5px;
  letter-spacing: 0.06em;
  color: var(--ink-3);
  border-bottom: 2px solid transparent;
}
.groups button:hover {
  color: var(--ink-2);
}
.groups button.on {
  color: var(--ink);
  border-bottom-color: var(--rust);
  background: var(--card);
}

.body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 4px 18px 22px;
}
section {
  padding-top: 12px;
}
h3.cap {
  display: flex;
  align-items: center;
  margin: 16px 0 8px;
  font-size: var(--fs-label);
  letter-spacing: var(--track-label);
  color: var(--ink-3);
}
.all {
  margin-left: auto;
  font-size: 11.5px;
  letter-spacing: 0.14em;
  color: var(--ink-3);
  border: 1px solid var(--rule-2);
  padding: 1px 6px;
}
.all:hover {
  color: var(--ink);
  border-color: var(--rule-3);
}

.field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
}
.lab {
  font-size: var(--fs-sm);
  color: var(--ink-2);
}
.seg {
  display: flex;
  border: 1px solid var(--rule-2);
  background: var(--paper);
}
.seg button {
  padding: 4px 10px;
  font-size: 12px;
  letter-spacing: 0.04em;
  color: var(--ink-3);
  border-right: 1px solid var(--rule);
}
.seg button:last-child {
  border-right: none;
}
.seg button:hover {
  color: var(--ink);
}
.seg button.on {
  background: var(--ink);
  color: var(--card);
}

.cats {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 5px;
}
.chip {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 5px 8px;
  font-size: 13.5px;
  border: 1px solid var(--rule);
  color: var(--ink-3);
  background: var(--paper);
  transition: border-color var(--dur) var(--ease), color var(--dur) var(--ease);
}
.chip i {
  width: 8px;
  height: 8px;
  flex: none;
  opacity: 0.35;
}
.chip:hover {
  border-color: var(--rule-3);
}
.chip.on {
  color: var(--ink);
  border-color: var(--rule-3);
  background: var(--card);
}
.chip.on i {
  opacity: 1;
}

.note {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--ink-4);
}

.stats {
  margin: 12px 0 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.stats > div {
  display: flex;
  align-items: baseline;
  gap: 8px;
  border-bottom: 1px dashed var(--rule);
  padding-bottom: 6px;
}
.stats dt {
  font-size: 13px;
  color: var(--ink-3);
}
.stats dd {
  margin: 0 0 0 auto;
  font-size: var(--fs-sm);
  color: var(--ink-2);
}

/* Diagnostics: one entry point that survives dismissing the banner. */
h3.diag-head {
  margin-top: 18px;
  padding-top: 12px;
  border-top: 1px solid var(--rule-2);
}
.diag-count {
  margin-left: auto;
  font-size: var(--fs-sm);
  color: var(--ink-2);
}
.fails {
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 12px;
}
.fails li {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 10px;
  justify-content: space-between;
  padding: 3px 0;
  border-bottom: 1px dashed var(--rule);
}
.fails li .mono {
  color: var(--ink-2);
  word-break: break-all;
}
.fail-kind {
  color: var(--ink-3);
}
.diag-actions {
  margin-top: 10px;
}
.diag-copy {
  border: 1px solid var(--rule-2);
  background: var(--card);
  color: var(--ink-2);
  padding: 5px 12px;
  font-size: var(--fs-sm);
}
.diag-copy:hover {
  border-color: var(--rule-3);
  color: var(--ink);
}
.diag-actions .note {
  margin-top: 6px;
}
.diag-text {
  box-sizing: border-box;
  width: 100%;
  margin-top: 8px;
  padding: 8px;
  border: 1px solid var(--rule);
  background: var(--paper-2);
  color: var(--ink-2);
  font-size: 11.5px;
  line-height: 1.5;
  resize: vertical;
}

.about {
  display: flex;
  align-items: baseline;
  gap: 8px;
  width: 100%;
  margin-top: 20px;
  padding: 11px 0 2px;
  border-top: 1px solid var(--rule-2);
  text-align: left;
}
.about-main {
  font-size: var(--fs-sm);
  color: var(--ink-2);
  letter-spacing: 0.04em;
}
.about-sub {
  flex: 1;
  font-size: 11.5px;
  color: var(--ink-4);
}
.arrow {
  color: var(--ink-4);
}
.about:hover .about-main,
.about:hover .arrow {
  color: var(--ink);
}

/* Slide in from the right; the veil fades underneath. */
.drawer-enter-active,
.drawer-leave-active {
  transition: opacity var(--dur) var(--ease);
}
.drawer-enter-active .drawer,
.drawer-leave-active .drawer {
  transition: transform var(--dur) var(--ease);
}
.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}
.drawer-enter-from .drawer,
.drawer-leave-to .drawer {
  transform: translateX(100%);
}
</style>
