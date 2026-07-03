/**
 * Core orchestrator – the "micro-kernel".
 *
 * Assembles the Store, EventBus, and Cesium Viewer into a single object
 * that every plugin receives during registration.
 *
 * Usage from main.js:
 *   const core = new Core();
 *   await core.init();
 *   core.use(mapPlugin);
 *   core.use(timelinePlugin);
 *   ...
 */

import * as Cesium from 'cesium';
import { Store } from './state.js';
import { EventBus } from './event-bus.js';
import { createViewer } from './cesium-viewer.js';
import { CESIUM_TOKEN, INITIAL_VIEW, YEAR_MAX, DEFAULT_YEAR, DEFAULT_ACTIVE_CATEGORIES, DEFAULT_STEP_SIZE } from '../config.js';

export class Core {
  constructor() {
    /** @type {Store} */
    this.state = new Store({
      currentYear: DEFAULT_YEAR,
      stepSize: DEFAULT_STEP_SIZE,
      activeFilters: new Set(DEFAULT_ACTIVE_CATEGORIES),
      isPlaying: false,
      selectedEvent: null,
      locale: 'zh',
      dataLoading: false,
      dataError: null,
      dataEvents: [],     // currently loaded batch
    });

    /** @type {EventBus} */
    this.events = new EventBus();

    /** @type {import('cesium').Viewer|null} */
    this.viewer = null;

    /** @type {Set<{ name: string, install: Function }>} */
    this._plugins = new Set();
  }

  /**
   * Create the Cesium Viewer.  Must be called once before registering
   * plugins that depend on the globe.
   */
  async init() {
    Cesium.Ion.defaultAccessToken = CESIUM_TOKEN;
    this.viewer = createViewer('cesiumContainer', INITIAL_VIEW);
  }

  /**
   * Register a plugin.
   * @param {{ name: string, install: (core: Core) => void }} plugin
   */
  use(plugin) {
    if (this._plugins.has(plugin)) {
      console.warn(`[core] Plugin "${plugin.name}" is already registered.`);
      return;
    }
    this._plugins.add(plugin);
    plugin.install(this);
    console.debug(`[core] Plugin "${plugin.name}" registered.`);
  }
}
