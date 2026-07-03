/**
 * Timeline plugin – slider, playback, step-size selector, keyboard, era nav.
 *
 * Owns the #timeline-panel DOM tree.  Reads/writes core.state (currentYear,
 * isPlaying, stepSize).  Other plugins react to state changes without
 * knowing about slider internals.
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
    // ── DOM ──
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

    let timer = null;

    // ── Helpers ──
    function stop() {
      if (timer) clearInterval(timer);
      timer = null;
      core.state.set('isPlaying', false);
    }

    function start() {
      core.state.set('isPlaying', true);
      timer = setInterval(() => {
        const curYear = core.state.get('currentYear') ?? YEAR_MAX;
        const curSlider = yearToSlider(curYear);
        const stepSlider = core.state.get('stepSize') ?? DEFAULT_STEP_SIZE;
        const nextSlider = curSlider + stepSlider;
        if (nextSlider > SLIDER_MAX) {
          stop();
          return;
        }
        core.state.set('currentYear', sliderToYear(nextSlider));
      }, PLAYBACK_INTERVAL_MS);
    }

    function stepYear(delta) {
      stop();
      const cur = core.state.get('currentYear') ?? YEAR_MAX;
      core.state.set('currentYear', Math.max(YEAR_MIN, Math.min(YEAR_MAX, cur + delta)));
    }

    /** Format a year for era range display (uses BC/AD format, cleaner short form). */
    function fmtEraYear(y) {
      if (y < 0) return `${Math.abs(y)} BC`;
      return `${y} AD`;
    }

    /** Update era indicator and active chip for a given year. */
    function updateEra(year) {
      const era = getEra(year);
      const locale = core.state.get('locale') ?? 'zh';
      if (!era) return;

      // Era name badge
      if (eraName) {
        eraName.textContent = getEraName(era, locale);
        eraName.style.background = era.color + '33'; // 20% opacity bg
        eraName.style.color = era.color;
      }

      // Era range text
      if (eraRange) {
        eraRange.textContent = `${fmtEraYear(era.start)} — ${fmtEraYear(era.end)}`;
      }

      // Active chip
      if (eraBar) {
        eraBar.querySelectorAll('.era-chip').forEach((chip) => {
          const isActive = chip.dataset.eraId === era.id;
          chip.classList.toggle('active', isActive);
          if (isActive) {
            chip.style.borderColor = era.color;
            chip.style.background = era.color + '22';
            chip.style.color = era.color;
          } else {
            chip.style.borderColor = '';
            chip.style.background = '';
            chip.style.color = '';
          }
        });
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
          stop();
          core.state.set('currentYear', era.start);
        });
        eraBar.appendChild(chip);
      });
    }
    buildEraBar();
    core.state.on('locale', buildEraBar);

    // ── Slider gradient ──
    slider.style.background = buildSliderGradient();

    // ── Slider → state (non-linear: slider position → real year) ──
    slider.addEventListener('input', () => {
      core.state.set('currentYear', sliderToYear(parseInt(slider.value, 10)));
    });

    // ── State → DOM (non-linear: real year → slider position) ──
    core.state.on('currentYear', (year) => {
      const locale = core.state.get('locale') ?? 'zh';
      slider.value = yearToSlider(year);
      yearDisp.textContent = formatYearLocale(year, locale);
      if (globeLbl) globeLbl.textContent = formatYearLocale(year, locale);
      updateEra(year);
    });

    core.state.on('isPlaying', (playing) => {
      btnPlay.textContent = playing ? '⏸' : '▶';
      btnPlay.classList.toggle('playing', playing);
    });

    // ── Event count (updated by main orchestration) ──
    core.events.on('markers:count', ({ visible, total }) => {
      const locale = core.state.get('locale') ?? 'zh';
      if (countDisp) countDisp.textContent = t('timeline.event.count', locale, { v: String(visible), t: String(total) });
    });

    // ── Buttons ──
    btnPlay.addEventListener('click', () => {
      core.state.get('isPlaying') ? stop() : start();
    });

    if (btnStepBack) {
      btnStepBack.addEventListener('click', () => {
        stepYear(-(core.state.get('stepSize') ?? DEFAULT_STEP_SIZE));
      });
    }

    if (btnStepFwd) {
      btnStepFwd.addEventListener('click', () => {
        stepYear(core.state.get('stepSize') ?? DEFAULT_STEP_SIZE);
      });
    }

    // ── Keyboard ──
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.isContentEditable) return;
      const step = core.state.get('stepSize') ?? DEFAULT_STEP_SIZE;
      switch (e.key) {
        case 'ArrowLeft':
          stepYear(-step);
          break;
        case 'ArrowRight':
          stepYear(step);
          break;
        case ' ':
          e.preventDefault();
          btnPlay.click();
          break;
        case 'Escape':
          core.state.set('selectedEvent', null);
          break;
      }
    });

    // ── Initial era display ──
    updateEra(core.state.get('currentYear') ?? YEAR_MAX);
  },
};
