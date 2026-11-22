/**
 * The single network boundary for every shipped JSON in this app.
 *
 * Before this module existed, each loader called `fetch` directly and swallowed
 * its own failures: a dropped connection was indistinguishable from "this year
 * has no records", and the reader got a blank list with no explanation. Here
 * every request gets the same treatment:
 *
 *   - a bounded timeout (an AbortController of its own, so cancelling one
 *     caller's *wait* never cancels the shared request — see data.ts);
 *   - retry with exponential backoff + jitter, only for failures that can
 *     plausibly recover (network, timeout, 408/429/5xx);
 *   - a global concurrency ceiling, so scrubbing the timeline cannot fan out,
 *     with a bounded queue in front of it: a caller that stops waiting leaves
 *     the line instead of taking a slot later;
 *   - a structured failure record, both exposed to the UI and kept in a bounded
 *     ring buffer for the diagnostics export;
 *   - no caching of failures. A retry always issues a real request.
 *
 * Failures are *reported*, not decided: `fetchOptionalJson` still degrades to a
 * fallback where a missing enhancement must not break the page, but the banner
 * can now say so instead of leaving the reader guessing.
 */
import { NETWORK } from '@/config';

export type FailureKind = 'network' | 'timeout' | 'http' | 'parse';

export interface FailureRecord {
  url: string;
  kind: FailureKind;
  status: number | null;
  attempts: number;
  at: number;
  /** Short technical detail, safe to show and to copy. Never contains secrets. */
  message: string;
}

export class DataFetchError extends Error {
  readonly record: FailureRecord;

  constructor(record: FailureRecord) {
    super(`${record.message} · ${record.url}`);
    this.name = 'DataFetchError';
    this.record = record;
  }
}

/* ── failure state ──────────────────────────────────────────────────────────
 *
 * `active` is keyed by URL: one banner entry per resource, most recent wins.
 * A successful request removes its entry, so a successful retry clears the
 * banner by itself — no separate "recovery" path that could drift out of sync.
 */
const active = new Map<string, FailureRecord>();
const history: FailureRecord[] = [];
const listeners = new Set<(records: FailureRecord[]) => void>();

export function currentFailures(): FailureRecord[] {
  return [...active.values()].sort((a, b) => b.at - a.at);
}

export function onFailuresChanged(fn: (records: FailureRecord[]) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Called by Retry: forget what failed so a fresh attempt starts from zero. */
export function resetFailures() {
  active.clear();
  notify();
}

function notify() {
  const snapshot = currentFailures();
  for (const fn of listeners) fn(snapshot);
}

function clearFailure(url: string) {
  if (active.delete(url)) notify();
}

function reportFailure(record: FailureRecord) {
  active.set(record.url, record);
  history.push(record);
  if (history.length > 50) history.shift();
  notify();
}

export function failureHistory(limit = 20): FailureRecord[] {
  return history.slice(-limit);
}

/**
 * One-click diagnostics payload. Only browser/runtime facts and sanitized
 * failure records — no tokens, no user content, no query strings with data.
 */
export function diagnosticSnapshot(extra: Record<string, unknown> = {}) {
  return {
    app: 'Earth / 寰宇纪年',
    at: new Date().toISOString(),
    path: location.pathname,
    userAgent: navigator.userAgent,
    online: navigator.onLine,
    activeFailures: currentFailures(),
    recentFailures: failureHistory(20),
    limits: { ...NETWORK },
    ...extra,
  };
}

/* ── concurrency ────────────────────────────────────────────────────────── */

/**
 * How many callers may wait for a slot.
 *
 * Without a ceiling, a long scrub pushes every superseded year file into the
 * queue and the window the reader is actually looking at waits behind all of
 * them. Refusing the surplus costs one aborted refresh; serving it late costs
 * the whole panel.
 */
const QUEUE_LIMIT = NETWORK.maxConcurrent * 3;

let running = 0;

interface Waiter {
  /** Take the slot this caller was queued for. */
  grant: () => void;
  /** Give up the place in line because the caller stopped waiting. */
  cancel: () => void;
}

const waiting: Waiter[] = [];

function abortReason(signal: AbortSignal): Error {
  const reason = signal.reason;
  if (reason instanceof Error) return reason;
  const err = new Error('aborted');
  err.name = 'AbortError';
  return err;
}

function queueFullError(): Error {
  const err = new Error(`request queue is full (${waiting.length} waiting, limit ${QUEUE_LIMIT})`);
  err.name = 'QueueFullError';
  return err;
}

/**
 * Reserve one of the global slots.
 *
 * The signal cancels the *wait*, never the request: data.ts hands one in-flight
 * promise to several callers, so aborting the fetch itself would reject it for
 * every waiter. A caller that stops waiting must therefore leave the line
 * here — it used to stay queued, get a slot from `release()`, and run a request
 * nobody awaited, holding one of the eight slots to the end of its timeout.
 */
function acquire(signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortReason(signal));
  if (running < NETWORK.maxConcurrent) {
    running += 1;
    return Promise.resolve();
  }
  if (waiting.length >= QUEUE_LIMIT) return Promise.reject(queueFullError());

  return new Promise<void>((resolve, reject) => {
    const waiter: Waiter = {
      grant: () => {
        signal?.removeEventListener('abort', waiter.cancel);
        running += 1;
        resolve();
      },
      cancel: () => {
        const at = waiting.indexOf(waiter);
        if (at !== -1) waiting.splice(at, 1);
        reject(signal ? abortReason(signal) : new Error('aborted'));
      },
    };
    signal?.addEventListener('abort', waiter.cancel, { once: true });
    waiting.push(waiter);
  });
}

function release() {
  running = Math.max(0, running - 1);
  waiting.shift()?.grant();
}

/* ── request ────────────────────────────────────────────────────────────── */

export interface RequestOptions {
  /** Override the budget, e.g. for the 18 MB century files. */
  timeoutMs?: number;
  /** Retries *after* the first attempt; defaults to NETWORK.retries. */
  retries?: number;
  /**
   * A 404 is a legitimate answer (a year with no shipped file, a person with
   * no profile). It is thrown as a DataFetchError for the caller to handle but
   * is neither retried nor reported as a failure.
   */
  allowMissing?: boolean;
}

function makeRecord(
  url: string,
  kind: FailureKind,
  status: number | null,
  attempts: number,
  message: string,
): FailureRecord {
  return { url, kind, status, attempts, at: Date.now(), message };
}

function retryable(record: FailureRecord): boolean {
  if (record.kind !== 'http') return true;
  const status = record.status ?? 0;
  return status === 408 || status === 429 || status >= 500;
}

/**
 * Retry-After in either RFC 9110 form: delta seconds, or an HTTP-date.
 *
 * Only the numeric form used to be read, so a date-valued header was treated as
 * "no hint" and the client retried on its own schedule — too early for the
 * server that asked for a wait. Returns null when the header is absent or
 * unparsable, so the caller falls back to exponential backoff.
 */
function retryAfterMs(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(value);
  if (Number.isFinite(at)) return Math.max(0, at - Date.now());
  return null;
}

/** Exponential backoff, capped, with ±30% jitter and Retry-After support. */
function backoff(attempt: number, retryAfter: string | null): number {
  const base = retryAfterMs(retryAfter) ?? NETWORK.backoffBaseMs * 2 ** (attempt - 1);
  const capped = Math.min(NETWORK.backoffMaxMs, Math.max(0, base));
  return Math.round(capped * (0.7 + Math.random() * 0.6));
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function isAbortError(err: unknown): boolean {
  return (err as Error | null | undefined)?.name === 'AbortError';
}

/**
 * Fetch and parse one JSON document. Throws `DataFetchError` on any request
 * failure; a queue that refuses the request throws that refusal unchanged,
 * because nothing was attempted and no status or network condition applies.
 * Never returns a half-loaded value and never swallows an exception.
 */
export async function fetchJson<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const timeoutMs = options.timeoutMs ?? NETWORK.timeoutMs;
  const maxAttempts = Math.max(1, (options.retries ?? NETWORK.retries) + 1);
  let last: FailureRecord | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    /*
     * The controller is created before the slot is reserved so the budget covers
     * the queue as well. Otherwise a request waiting for a slot cannot time out,
     * and the signal handed to `acquire` would never fire.
     */
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let acquired = false;
    let data: T | undefined;
    let record: FailureRecord | null = null;
    let retryAfter: string | null = null;

    try {
      try {
        await acquire(controller.signal);
        acquired = true;
        const res = await fetch(url, { signal: controller.signal });
        retryAfter = res.headers.get('retry-after');
        if (!res.ok) {
          record = makeRecord(url, 'http', res.status, attempt, `HTTP ${res.status}`);
        } else {
          try {
            data = (await res.json()) as T;
          } catch (err) {
            /*
             * Reading the body can abort after the headers arrived. That is the
             * same timeout as a connection that never answered — reporting it as
             * invalid JSON sent the reader looking for corrupt data.
             */
            if (controller.signal.aborted || isAbortError(err)) {
              record = makeRecord(
                url,
                'timeout',
                res.status,
                attempt,
                `timeout after ${timeoutMs} ms`,
              );
            } else {
              record = makeRecord(url, 'parse', res.status, attempt, 'invalid JSON');
            }
          }
        }
      } catch (err) {
        const aborted = controller.signal.aborted || isAbortError(err);
        if (!acquired) {
          /*
           * `acquire` refused the request before anything was sent: either the
           * queue is full, where retrying would queue behind the same backlog,
           * or the wait itself used up the attempt's budget.
           */
          if (!aborted) throw err;
          record = makeRecord(
            url,
            'timeout',
            null,
            attempt,
            `timeout after ${timeoutMs} ms waiting for a slot`,
          );
        } else {
          record = makeRecord(
            url,
            aborted ? 'timeout' : 'network',
            null,
            attempt,
            aborted ? `timeout after ${timeoutMs} ms` : 'network unreachable',
          );
        }
      }
    } finally {
      clearTimeout(timer);
      // Backoff happens outside the semaphore slot; a slow dependency must not
      // hold one of the eight slots hostage while it waits.
      if (acquired) release();
    }

    if (record === null && data !== undefined) {
      clearFailure(url);
      return data;
    }
    if (!record) record = makeRecord(url, 'network', null, attempt, 'empty response');
    last = record;

    const expectedMissing =
      options.allowMissing === true && record.kind === 'http' && record.status === 404;
    if (expectedMissing) {
      // A definitive 404 clears any earlier transient failure for this URL.
      clearFailure(url);
      throw new DataFetchError(record);
    }

    if (attempt === maxAttempts || !retryable(record)) {
      reportFailure(record);
      throw new DataFetchError(record);
    }
    await sleep(backoff(attempt, retryAfter));
  }

  throw new DataFetchError(
    last ?? makeRecord(url, 'network', null, maxAttempts, 'request failed'),
  );
}

/**
 * For enhancement data whose absence must not break the page. The fallback is
 * returned to the caller but *not* cached there, so a later Retry re-attempts.
 */
export async function fetchOptionalJson<T>(
  url: string,
  fallback: T,
  options: RequestOptions = {},
): Promise<{ data: T; ok: boolean }> {
  try {
    return { data: await fetchJson<T>(url, options), ok: true };
  } catch {
    return { data: fallback, ok: false };
  }
}
