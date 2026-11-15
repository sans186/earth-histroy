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
 *   - a global concurrency ceiling, so scrubbing the timeline cannot fan out;
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

let running = 0;
const waiting: Array<() => void> = [];

function acquire(): Promise<void> {
  if (running < NETWORK.maxConcurrent) {
    running += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    waiting.push(() => {
      running += 1;
      resolve();
    });
  });
}

function release() {
  running = Math.max(0, running - 1);
  waiting.shift()?.();
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

/** Exponential backoff, capped, with ±30% jitter and Retry-After support. */
function backoff(attempt: number, retryAfter: string | null): number {
  const seconds = retryAfter ? Number(retryAfter) : Number.NaN;
  const base = Number.isFinite(seconds)
    ? seconds * 1000
    : NETWORK.backoffBaseMs * 2 ** (attempt - 1);
  const capped = Math.min(NETWORK.backoffMaxMs, Math.max(0, base));
  return Math.round(capped * (0.7 + Math.random() * 0.6));
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Fetch and parse one JSON document. Throws `DataFetchError` on any failure;
 * never returns a half-loaded value and never swallows an exception.
 */
export async function fetchJson<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const timeoutMs = options.timeoutMs ?? NETWORK.timeoutMs;
  const maxAttempts = Math.max(1, (options.retries ?? NETWORK.retries) + 1);
  let last: FailureRecord | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    await acquire();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let data: T | undefined;
    let record: FailureRecord | null = null;
    let retryAfter: string | null = null;

    try {
      try {
        const res = await fetch(url, { signal: controller.signal });
        retryAfter = res.headers.get('retry-after');
        if (!res.ok) {
          record = makeRecord(url, 'http', res.status, attempt, `HTTP ${res.status}`);
        } else {
          try {
            data = (await res.json()) as T;
          } catch {
            record = makeRecord(url, 'parse', res.status, attempt, 'invalid JSON');
          }
        }
      } catch {
        const timedOut = controller.signal.aborted;
        record = makeRecord(
          url,
          timedOut ? 'timeout' : 'network',
          null,
          attempt,
          timedOut ? `timeout after ${timeoutMs} ms` : 'network unreachable',
        );
      }
    } finally {
      clearTimeout(timer);
      // Backoff happens outside the semaphore slot; a slow dependency must not
      // hold one of the eight slots hostage while it waits.
      release();
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
