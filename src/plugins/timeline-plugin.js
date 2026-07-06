/**
 * Timeline plugin – slider, playback, step-size selector, keyboard, era nav.
 *
 * Owns the #timeline-panel DOM tree.  Reads/writes core.state (currentYear,
 * isPlaying, stepSize).  Other plugins react to state changes without
 * knowing about slider internals.
 *
 * Dual mode: manages separate left + right timeline controls.
 */

import {
  YEAR_MIN,
  YEAR_MAX,
  SLIDER_MIN,
  SLIDER_MAX,
  sliderToYear,
  yearToSlider,
  DEFAULT_STEP_SIZE,
  PLAYBACK_INTERVAL_MS,
  ERAS,
  getEra,
} from '../config.js';
import { formatYear } from '../utils.js';
import { t, getEraName, formatYearLocale } from '../locale.js';

export default {
  name: 'timeline-plugin',

  /** @param {import('../core/index.js').Core} core */
  install(core) {
    // ── Left (primary) DOM ──
    const slider    = /** @type {HTMLInputElement} */ (document.getElementById('timeline-slider'));
    const yearDisp  = document.getElementById('year-display');
    const eraName   = document.getElementById('era-name');
    const eraRange  = document.getElementById('era-range');
    const countDisp = document.getElementById('event-count');
    const globeLbl  = document.getElementById('globe-year-label');
    const btnPlay   = document.getElementById('btn-play');
    const btnStepBack = document.getElementById('btn-step-back');
    const btnStepFwd  = document.getElementById('btn-step-fwd');
    const stepSelector = document.getElementById('step-selector');
    const eraBar     = document.getElementById('era-bar');

    // ── Right (dual mode) DOM ──
    const sliderR    = /** @type {HTMLInputElement} */ (document.getElementById('timeline-slider-right'));
    const yearDispR  = document.getElementById('year-display-right');
    const eraNameR   = document.getElementById('era-name-right');
    const eraRangeR  = document.getElementById('era-range-right');
    const countDispR = document.getElementById('event-count-right');
    const globeLblR  = document.getElementById('globe-year-label-right');
    const btnPlayR   = document.getElementById('btn-play-right');
    const btnStepBackR = document.getElementById('btn-step-back-right');
    const btnStepFwdR  = document.getElementById('btn-step-fwd-right');

    let timer = null;
    let timerR = null;

    // ── Helpers ──
    function stop(side) {
      if (side === 'right') {
        if (timerR) clearInterval(timerR);
        timerR = null;
      } else {
        if (timer) clearInterval(timer);
        timer = null;
        core.state.set('isPlaying', false);
      }
    }

    function start(side) {
      if (side === 'right') {
        timerR = setInterval(() => {
          const curYear = core.state.get('rightYear') ?? YEAR_MAX;
          const curSlider = yearToSlider(curYear);
          const step = core.state.get('stepSize') ?? DEFAULT_STEP_SIZE;
          const nextSlider = curSlider + step;
          if (nextSlider > SLIDER_MAX) {
            stop('right');
            return;
          }
          core.state.set('rightYear', sliderToYear(nextSlider));
        }, PLAYBACK_INTERVAL_MS);
      } else {
        core.state.set('isPlaying', true);
        timer = setInterval(() => {
          const curYear = core.state.get('currentYear') ?? YEAR_MAX;
          const curSlider = yearToSlider(curYear);
          const step = core.state.get('stepSize') ?? DEFAULT_STEP_SIZE;
          const nextSlider = curSlider + step;
          if (nextSlider > SLIDER_MAX) {
            stop('left');
            return;
          }
          core.state.set('currentYear', sliderToYear(nextSlider));
        }, PLAYBACK_INTERVAL_MS);
      }
    }

    function stepYear(delta, side) {
      if (side === 'right') {
        stop('right');
        const cur = core.state.get('rightYear') ?? YEAR_MAX;
        core.state.set('rightYear', Math.max(YEAR_MIN, Math.min(YEAR_MAX, cur + delta)));
      } else {
        stop('left');
        const cur = core.state.get('currentYear') ?? YEAR_MAX;
        core.state.set('currentYear', Math.max(YEAR_MIN, Math.min(YEAR_MAX, cur + delta)));
      }
    }

    /** Format a year for era range display. */
    function fmtEraYear(y) {
      if (y < 0) return `${Math.abs(y)} BC`;
      return `${y} AD`;
    }

    /** Update era indicator elements for a given year. */
    function updateEra(year, nameEl, rangeEl) {
      const era = getEra(year);
      const locale = core.state.get('locale') ?? 'zh';
      if (!era) return;

      if (nameEl) {
        nameEl.textContent = getEraName(era, locale);
        nameEl.style.background = era.color + '33';
        nameEl.style.color = era.color;
      }

      if (rangeEl) {
        rangeEl.textContent = `${fmtEraYear(era.start)} — ${fmtEraYear(era.end)}`;
      }
    }

    /** Build the era slider gradient using non-linear slider positions. */
    function buildSliderGradient() {
      const stops = ERAS.map((era) => {
        const pStart = (yearToSlider(era.start) / SLIDER_MAX) * 100;
        const pEnd = (yearToSlider(era.end) / SLIDER_MAX) * 100;
        return `${era.color}44 ${pStart}%, ${era.color}66 ${Math.min(pEnd, 100)}%`;
      });
      return `linear-gradient(to right, ${stops.join(', ')})`;
    }

    // ── Step label locale-aware ──
    const stepLabel = document.getElementById('step-label');
    function updateStepLabel() {
      const locale = core.state.get('locale') ?? 'zh';
      if (stepLabel) stepLabel.textContent = t('timeline.step', locale);
    }
    updateStepLabel();
    core.state.on('locale', updateStepLabel);
    if (stepSelector) {
      stepSelector.querySelectorAll('.step-opt').forEach((btn) => {
        const step = parseInt(btn.dataset.step, 10);
        if (step === DEFAULT_STEP_SIZE) btn.classList.add('active');
        btn.addEventListener('click', () => core.state.set('stepSize', step));
      });
    }

    core.state.on('stepSize', (val) => {
      if (!stepSelector) return;
      stepSelector.querySelectorAll('.step-opt').forEach((btn) => {
        btn.classList.toggle('active', parseInt(btn.dataset.step, 10) === val);
      });
    });

    // ── Era navigation bar ──
    function buildEraBar() {
      if (!eraBar) return;
      const locale = core.state.get('locale') ?? 'zh';
      eraBar.innerHTML = '';
      ERAS.forEach((era) => {
        const chip = document.createElement('button');
        chip.className = 'era-chip';
        chip.dataset.eraId = era.id;
        chip.textContent = getEraName(era, locale);
        chip.addEventListener('click', () => {
          stop('left');
          core.state.set('currentYear', era.start);
        });
        eraBar.appendChild(chip);
      });
    }
    buildEraBar();
    core.state.on('locale', buildEraBar);

    // ── Slider gradient ──
    const gradient = buildSliderGradient();
    slider.style.background = gradient;
    if (sliderR) sliderR.style.background = gradient;

    // ── Left slider → state ──
    slider.addEventListener('input', () => {
      core.state.set('currentYear', sliderToYear(parseInt(slider.value, 10)));
    });

    // ── Right slider → state ──
    if (sliderR) {
      sliderR.addEventListener('input', () => {
        core.state.set('rightYear', sliderToYear(parseInt(sliderR.value, 10)));
      });
    }

    // ── State → left DOM ──
    core.state.on('currentYear', (year) => {
      const locale = core.state.get('locale') ?? 'zh';
      slider.value = yearToSlider(year);
      if (yearDisp) yearDisp.textContent = formatYearLocale(year, locale);
      if (globeLbl) globeLbl.textContent = formatYearLocale(year, locale);
      updateEra(year, eraName, eraRange);
    });

    // ── State → right DOM ──
    core.state.on('rightYear', (year) => {
      const locale = core.state.get('locale') ?? 'zh';
      if (sliderR) sliderR.value = yearToSlider(year);
      if (yearDispR) yearDispR.textContent = formatYearLocale(year, locale);
      if (globeLblR) globeLblR.textContent = formatYearLocale(year, locale);
      updateEra(year, eraNameR, eraRangeR);
    });

    // ── Left play state ──
    core.state.on('isPlaying', (playing) => {
      if (btnPlay) {
        btnPlay.textContent = playing ? '⏸' : '▶';
        btnPlay.classList.toggle('playing', playing);
      }
    });

    // ── Event count (left) ──
    core.events.on('markers:count', ({ visible, total }) => {
      const locale = core.state.get('locale') ?? 'zh';
      if (countDisp) countDisp.textContent = t('timeline.event.count', locale, { v: String(visible), t: String(total) });
    });

    // ── Dual mode: update right event count when data changes ──
    core.events.on('data:loaded', (events) => {
      if (!core.state.get('dualMode')) return;
      const rightYear = core.state.get('rightYear');
      const filters = core.state.get('activeFilters') ?? new Set();
      // Simple count for display – getDisplayCategory requires import, skip for prototype
      const rightEvents = events.filter((e) => e._year === rightYear);
      const locale = core.state.get('locale') ?? 'zh';
      if (countDispR) countDispR.textContent = t('timeline.event.count', locale, { v: String(rightEvents.length), t: String(rightEvents.length) });
    });

    // ── Left buttons ──
    if (btnPlay) {
      btnPlay.addEventListener('click', () => {
        core.state.get('isPlaying') ? stop('left') : start('left');
      });
    }

    if (btnStepBack) {
      btnStepBack.addEventListener('click', () => {
        stepYear(-(core.state.get('stepSize') ?? DEFAULT_STEP_SIZE), 'left');
      });
    }

    if (btnStepFwd) {
      btnStepFwd.addEventListener('click', () => {
        stepYear(core.state.get('stepSize') ?? DEFAULT_STEP_SIZE, 'left');
      });
    }

    // ── Right buttons ──
    if (btnPlayR) {
      btnPlayR.addEventListener('click', () => {
        timerR ? stop('right') : start('right');
        if (btnPlayR) {
          btnPlayR.textContent = timerR ? '▶' : '⏸';
          btnPlayR.classList.toggle('playing', !!timerR);
        }
      });
    }

    if (btnStepBackR) {
      btnStepBackR.addEventListener('click', () => {
        stepYear(-(core.state.get('stepSize') ?? DEFAULT_STEP_SIZE), 'right');
      });
    }

    if (btnStepFwdR) {
      btnStepFwdR.addEventListener('click', () => {
        stepYear(core.state.get('stepSize') ?? DEFAULT_STEP_SIZE, 'right');
      });
    }

    // ── Dual mode enter/exit: init right display ──
    core.state.on('dualMode', (active) => {
      if (active) {
        const locale = core.state.get('locale') ?? 'zh';
        const rightYear = core.state.get('rightYear') ?? YEAR_MAX;
        if (sliderR) sliderR.value = yearToSlider(rightYear);
        if (yearDispR) yearDispR.textContent = formatYearLocale(rightYear, locale);
        if (globeLblR) globeLblR.textContent = formatYearLocale(rightYear, locale);
        updateEra(rightYear, eraNameR, eraRangeR);
      }
    });

    // ── Keyboard ──
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.isContentEditable) return;
      const step = core.state.get('stepSize') ?? DEFAULT_STEP_SIZE;
      switch (e.key) {
        case 'ArrowLeft':
          stepYear(-step, 'left');
          break;
        case 'ArrowRight':
          stepYear(step, 'left');
          break;
        case ' ':
          e.preventDefault();
          if (btnPlay) btnPlay.click();
          break;
        case 'Escape':
          core.state.set('selectedEvent', null);
          break;
      }
    });

    // ── Initial era display ──
    updateEra(core.state.get('currentYear') ?? YEAR_MAX, eraName, eraRange);
  },
};
