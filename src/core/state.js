/**
 * Reactive store – pub/sub over a plain object.
 *
 * Part of the core layer.  Plugins read/write state and subscribe to
 * changes without importing each other.
 */

export class Store {
  /** @type {Map<string, Set<Function>>} */
  #listeners = new Map();
  /** @type {Record<string, unknown>} */
  #state;

  constructor(initial = {}) {
    this.#state = { ...initial };
  }

  get(key) {
    return this.#state[key];
  }

  /**
   * @param {string} key
   * @param {unknown} value
   * @returns {boolean} true if the value actually changed
   */
  set(key, value) {
    const old = this.#state[key];
    if (old === value) return false;
    this.#state[key] = value;
    const fns = this.#listeners.get(key);
    if (fns) {
      for (const fn of fns) fn(value, old);
    }
    return true;
  }

  /**
   * @param {string} event
   * @param {Function} fn  Called with (newValue, oldValue)
   * @returns {() => void} Unsubscribe
   */
  on(event, fn) {
    if (!this.#listeners.has(event)) this.#listeners.set(event, new Set());
    this.#listeners.get(event).add(fn);
    return () => this.#listeners.get(event)?.delete(fn);
  }

  onMany(map) {
    const unsubs = Object.entries(map).map(([evt, fn]) => this.on(evt, fn));
    return () => unsubs.forEach((u) => u());
  }

  /** Read-only snapshot of all state (for debugging). */
  snapshot() {
    return { ...this.#state };
  }
}
