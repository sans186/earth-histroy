/**
 * One shape for every user-visible failure.
 *
 * There used to be two unrelated mechanisms: `ui.setError()` (written in four
 * places, read in none) and a local `failed` ref in each renderer stage. This
 * module builds the single value that the shared ErrorNotice renders, and the
 * diagnostics string it can copy. Keeping the wording here means the banner
 * never has to guess what kind of failure it is showing.
 */
import { translate, type MessageKey } from '@/lib/i18n';
import { diagnosticSnapshot, type FailureRecord } from '@/services/http';
import type { Locale } from '@/types';

export type AppErrorKind = 'data' | 'renderer' | 'unexpected';

export interface AppError {
  kind: AppErrorKind;
  title: string;
  /** Says what the reader can actually do — not a stack trace. */
  hint: string;
  /** Sanitized JSON, safe to paste into an issue report. */
  diagnostics: string;
  /** Distinct failing resources; 0 for renderer/unexpected errors. */
  count: number;
  at: number;
}

function interpolate(text: string, vars: Record<string, string | number>): string {
  let out = text;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{${key}}`, String(value));
  }
  return out;
}

function t(locale: Locale, key: MessageKey, vars: Record<string, string | number> = {}) {
  return interpolate(translate(locale, key), vars);
}

/** Clip untrusted exception text before it ever reaches the diagnostics blob. */
function safeDetail(detail: unknown): string {
  return String(detail ?? '').replace(/[\r\n]+/g, ' ').slice(0, 300);
}

export function dataError(locale: Locale, records: FailureRecord[]): AppError | null {
  if (!records.length) return null;
  const offline = typeof navigator !== 'undefined' && !navigator.onLine;
  const hint =
    t(locale, 'error.dataHint', { count: records.length }) +
    (offline ? ` ${translate(locale, 'error.offline')}` : '');
  return {
    kind: 'data',
    title: translate(locale, 'error.title'),
    hint,
    diagnostics: JSON.stringify(diagnosticSnapshot({ locale }), null, 2),
    count: records.length,
    at: Date.now(),
  };
}

export function rendererError(locale: Locale, detail: unknown): AppError {
  return {
    kind: 'renderer',
    title: translate(locale, 'error.rendererTitle'),
    hint: translate(locale, 'error.rendererHint'),
    diagnostics: JSON.stringify(
      diagnosticSnapshot({ locale, rendererError: safeDetail(detail) }),
      null,
      2,
    ),
    count: 0,
    at: Date.now(),
  };
}

export function unexpectedError(locale: Locale, detail: unknown): AppError {
  return {
    kind: 'unexpected',
    title: translate(locale, 'error.unknownTitle'),
    hint: translate(locale, 'error.unknownHint'),
    diagnostics: JSON.stringify(
      diagnosticSnapshot({ locale, unexpectedError: safeDetail(detail) }),
      null,
      2,
    ),
    count: 0,
    at: Date.now(),
  };
}
