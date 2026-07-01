/**
 * Timeline plugin – slider, playback, step-size selector, keyboard.
 *
 * Owns the #timeline-panel DOM tree.  Reads/writes core.state (currentYear,
 * isPlaying, stepSize).  Other plugins react to state changes without
 * knowing about slider internals.
 */

import {
  YEAR_MIN,
  YEAR_MAX,
  DEFAULT_STEP_SIZE,
  PLAYBACK_INTERVAL_MS,
} from '../config.js';
import { formatYear } from '../utils.js';

export default {
  name: 'timeline-plugin',

  /** @param {import('../core/index.js').Core} core */
  install(core) {
    // ── DOM ──
    const slider    = /** @type {HTMLInputElement} */ (document.getElementById('timeline-slider'));
    const yearDisp  = document.getElementById('year-display');
    const countDisp = document.getElementById('event-count');
    const globeLbl  = document.getElementById('globe-year-label');
    const btnPlay   = document.getElementById('btn-play');
    const btnStepBack = document.getElementById('btn-step-back');
    const btnStepFwd  = document.getElementById('btn-step-fwd');
    const stepSelector = document.getElementById('step-selector');

    let timer = null;

    function stop() {
      if (timer) clearInterval(timer);
      timer = null;
      core.state.set('isPlaying', false);
    }

    function start() {
      core.state.set('isPlaying', true);
      timer = setInterval(() => {
        const step = core.state.get('stepSize') ?? DEFAULT_STEP_SIZE;
        const next = (core.state.get('currentYear') ?? YEAR_MAX) + step;
        if (next > YEAR_MAX) {
          stop();
          return;
        }
        core.state.set('currentYear', next);
      }, PLAYBACK_INTERVAL_MS);
    }

    function stepYear(delta) {
      stop();
      const cur = core.state.get('currentYear') ?? YEAR_MAX;
      core.state.set('currentYear', Math.max(YEAR_MIN, Math.min(YEAR_MAX, cur + delta)));
    }

    // ── Step size selector ──
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

    // ── Slider → state ──
    slider.addEventListener('input', () => {
      core.state.set('currentYear', parseInt(slider.value, 10));
    });

    // ── State → DOM ──
    core.state.on('currentYear', (year) => {
      slider.value = year;
      yearDisp.textContent = formatYear(year);
      if (globeLbl) globeLbl.textContent = formatYear(year).replace(' AD', '');
    });

    core.state.on('isPlaying', (playing) => {
      btnPlay.textContent = playing ? '⏸' : '▶';
      btnPlay.classList.toggle('playing', playing);
    });

    // ── Event count (updated by main orchestration) ──
    core.events.on('markers:count', ({ visible, total }) => {
      if (countDisp) countDisp.textContent = `当前可见 ${visible} / ${total} 个事件`;
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
  },
};
