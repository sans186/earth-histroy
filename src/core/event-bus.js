/**
 * Typed event bus for inter-plugin communication.
 *
 * Unlike the Store (which is for shared state), the EventBus is for
 * one-shot action notifications: "something happened" rather than
 * "something changed its value".
 *
 * Events:
 *   data:loading   – a network fetch started
 *   data:loaded    – new event batch arrived
 *   data:error     – fetch failed
 *   markers:dirty  – map layer should refresh entities
 *   playback:start / playback:stop
 */

export class EventBus {
  /** @type {Map<string, Set<Function>>} */
  #listeners = new Map();

  /**
   * @param {string} event
   * @param {Function} fn
   * @returns {() => void} Unsubscribe
   */
  on(event, fn) {
    if (!this.#listeners.has(event)) this.#listeners.set(event, new Set());
    this.#listeners.get(event).add(fn);
    return () => this.#listeners.get(event)?.delete(fn);
  }

  /**
   * Emit an event.  Listeners are called synchronously in registration order.
   * @param {string} event
   * @param  {...any} args
   */
  emit(event, ...args) {
    const fns = this.#listeners.get(event);
    if (fns) {
      for (const fn of fns) fn(...args);
    }
  }
}
