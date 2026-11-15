<script setup lang="ts">
import { computed, ref } from 'vue';
import { ERAS, SCALE_MAX, YEAR_MAX, YEAR_MIN, eraSpan } from '@/config';
import { formatYearCompact } from '@/lib/format';
import { useTimelineStore } from '@/stores/timeline';
import { useUiStore } from '@/stores/ui';

const timeline = useTimelineStore();
const ui = useUiStore();

const track = ref<HTMLElement | null>(null);
const dragging = ref(false);

const eras = computed(() =>
  ERAS.map((era) => {
    const span = eraSpan(era);
    return {
      ...era,
      left: `${span.left}%`,
      width: `${Math.max(span.width, 2)}%`,
      label: ui.locale === 'zh' ? era.name : era.nameEn,
      hot: timeline.year >= era.start && timeline.year < era.end,
    };
  }),
);

const handleLeft = computed(() => `${(timeline.scale / SCALE_MAX) * 100}%`);

const ticks = computed(() => {
  const out: { left: string; major: boolean }[] = [];
  for (let i = 0; i <= 20; i += 1) {
    out.push({ left: `${i * 5}%`, major: i % 4 === 0 });
  }
  return out;
});

const names = computed(() =>
  ERAS.map((era) => ({
    left: `${eraSpan(era).left}%`,
    label: formatYearCompact(era.start, ui.locale),
  })),
);

function scaleFromEvent(clientX: number) {
  const el = track.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  timeline.setScale(Math.round(ratio * SCALE_MAX));
}

function onPointerDown(event: PointerEvent) {
  dragging.value = true;
  // Down here, not in the store watcher: subscribers use it to defer their
  // loads until the reader lets go of the scale.
  timeline.setScrubbing(true);
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  scaleFromEvent(event.clientX);
}

function onPointerMove(event: PointerEvent) {
  if (!dragging.value) return;
  scaleFromEvent(event.clientX);
}

function onPointerUp(event: PointerEvent) {
  if (!dragging.value) return;
  dragging.value = false;
  timeline.setScrubbing(false);
  (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
}

function onKey(event: KeyboardEvent) {
  const big = event.shiftKey ? 100 : 25;
  if (event.key === 'ArrowLeft') {
    timeline.setScale(Math.max(0, timeline.scale - big));
    event.preventDefault();
  } else if (event.key === 'ArrowRight') {
    timeline.setScale(Math.min(SCALE_MAX, timeline.scale + big));
    event.preventDefault();
  }
}

/**
 * Move the clock by a fixed number of years.
 *
 * Buttons are the only ±1 year control — the arrow keys are a coarser stride on
 * purpose (`ARROW_STRIDE`). Holding a button down is safe: App debounces the
 * reload, so a burst of clicks produces one window of requests.
 */
function step(years: number) {
  timeline.setYear(timeline.year + years);
}

const yearInput = ref('');

/**
 * Accepts "1911", "-500" and "500BC" alike.
 *
 * The timeline runs from 3400 BCE to 2100 CE on one axis, so a plain number
 * field would be ambiguous in the BCE range — the suffix has to be allowed.
 */
function applyJump() {
  const raw = yearInput.value.trim().toUpperCase();
  const match = raw.match(/^(-?\d+)\s*(BC|BCE)?$/);
  if (!match) return;
  const magnitude = Math.abs(Number(match[1]));
  const negative = match[1].startsWith('-') || Boolean(match[2]);
  timeline.setYear(negative ? -magnitude : magnitude);
  yearInput.value = '';
}
</script>

<template>
  <footer class="band">
    <div class="grid">
      <div class="left">
        <span class="cap">{{ ui.t('scale.jump') }}</span>
        <div class="jump">
          <input
            v-model="yearInput"
            class="yfield mono"
            type="text"
            inputmode="numeric"
            :placeholder="ui.t('scale.jumpHint')"
            :aria-label="ui.t('scale.jump')"
            @keydown.enter.stop="applyJump"
          />
          <button @click="applyJump">{{ ui.t('scale.go') }}</button>
        </div>
      </div>

      <div class="steps">
        <button
          :title="ui.t('scale.prev5')"
          :aria-label="ui.t('scale.prev5')"
          @click="step(-5)"
        >
          −5
        </button>
        <button
          :title="ui.t('scale.prev1')"
          :aria-label="ui.t('scale.prev1')"
          @click="step(-1)"
        >
          −1
        </button>
      </div>

      <div
        ref="track"
        class="track"
        role="slider"
        tabindex="0"
        :aria-valuemin="YEAR_MIN"
        :aria-valuemax="YEAR_MAX"
        :aria-valuenow="timeline.year"
        :aria-valuetext="`${timeline.year}`"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @keydown="onKey"
      >
        <div class="era-row">
          <span
            v-for="era in eras"
            :key="era.id"
            class="era"
            :class="{ hot: era.hot }"
            :style="{ left: era.left, width: era.width }"
            @click="timeline.goToEra(era.start)"
          >
            {{ era.label }}
          </span>
        </div>

        <div class="rail" />
        <div class="done" :style="{ width: handleLeft }" />

        <div class="ticks">
          <i
            v-for="(t, i) in ticks"
            :key="i"
            :class="{ major: t.major }"
            :style="{ left: t.left }"
          />
        </div>

        <div class="names">
          <span v-for="n in names" :key="n.label" :style="{ left: n.left }">{{ n.label }}</span>
        </div>

        <div class="knob" :style="{ left: handleLeft }" />
      </div>

      <div class="steps">
        <button
          :title="ui.t('scale.next1')"
          :aria-label="ui.t('scale.next1')"
          @click="step(1)"
        >
          +1
        </button>
        <button
          :title="ui.t('scale.next5')"
          :aria-label="ui.t('scale.next5')"
          @click="step(5)"
        >
          +5
        </button>
      </div>

      <div class="readout">
        <div class="year serif">
          <small v-if="timeline.isBCE">{{ ui.t('unit.bce') }}</small>{{ timeline.absYear }}
        </div>
        <div class="meta">
          <span>{{ ui.locale === 'zh' ? timeline.era.name : timeline.era.nameEn }}</span>
        </div>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.band {
  height: var(--foot-h);
  border-top: 1px solid var(--rule-2);
  background: var(--card);
  padding: 0 22px;
}
.grid {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 14px;
  height: 100%;
}

/* Step buttons sit on both sides of the rail, reading like a transport bar. */
.steps {
  display: flex;
  border: 1px solid var(--rule);
}
.steps button {
  width: 34px;
  height: 26px;
  font-family: var(--font-mono);
  font-size: 12.5px;
  color: var(--ink-2);
}
.steps button + button {
  border-left: 1px solid var(--rule);
}
.steps button:hover {
  background: var(--paper-2);
  color: var(--ink);
}
.steps button:active {
  background: var(--paper-3, var(--paper-2));
}

.left {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.jump {
  display: flex;
  border: 1px solid var(--rule);
}
.jump input {
  width: 82px;
  height: 24px;
  padding: 0 7px;
  font-size: 13px;
  color: var(--ink);
  background: var(--paper);
  border: 0;
  border-right: 1px solid var(--rule);
}
.jump input::placeholder {
  color: var(--ink-4);
}
.jump button {
  height: 24px;
  padding: 0 10px;
  font-size: 12px;
  letter-spacing: 0.12em;
  color: var(--ink-2);
}
.jump button:hover {
  background: var(--paper-2);
  color: var(--ink);
}

.track {
  position: relative;
  height: 62px;
  cursor: pointer;
  touch-action: none;
}
.track:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 4px;
}

.era-row {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 15px;
}
.era {
  position: absolute;
  top: 0;
  font-size: 11px;
  letter-spacing: 0.16em;
  color: var(--ink-4);
  border-left: 1px solid var(--rule-2);
  padding-left: 6px;
  line-height: 1;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
}
.era:hover {
  color: var(--ink-2);
}
.era.hot {
  color: var(--rust);
}

.rail {
  position: absolute;
  left: 0;
  right: 0;
  top: 30px;
  height: 1px;
  background: var(--rule-2);
}
.done {
  position: absolute;
  left: 0;
  top: 30px;
  height: 1px;
  background: var(--ink);
}

.ticks i {
  position: absolute;
  top: 30px;
  width: 1px;
  height: 5px;
  background: var(--rule-2);
  transform: translateY(-50%);
}
.ticks i.major {
  height: 10px;
  background: var(--rule-3);
}

.names {
  position: absolute;
  left: 0;
  right: 0;
  top: 40px;
  font-family: var(--font-mono);
  font-size: 9.5px;
  color: var(--ink-4);
}
.names span {
  position: absolute;
  transform: translateX(-50%);
  white-space: nowrap;
}

.knob {
  position: absolute;
  top: 30px;
  transform: translate(-50%, -50%);
  width: 11px;
  height: 11px;
  background: var(--rust);
  border: 2px solid var(--card);
  box-shadow: 0 0 0 1px var(--rust);
  pointer-events: none;
}

.readout {
  text-align: right;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
}
.year {
  font-size: 26px;
  font-weight: 600;
  line-height: 1;
}
.year small {
  font-family: var(--font-sans);
  font-size: 12px;
  letter-spacing: 0.16em;
  color: var(--ink-3);
  margin-right: 5px;
}
.meta {
  display: flex;
  gap: 10px;
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-3);
}
</style>
