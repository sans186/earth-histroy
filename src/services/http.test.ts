import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NETWORK } from '@/config';
import {
  DataFetchError,
  currentFailures,
  fetchJson,
  fetchOptionalJson,
  resetFailures,
} from '@/services/http';

/** Build a real Response so the module exercises its normal `res` path. */
function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(body === null ? null : JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...init.headers },
  });
}

beforeEach(() => {
  resetFailures();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('fetchJson', () => {
  it('parses JSON from a 2xx response without retrying', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ year: 1912 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchJson<{ year: number }>('/events/1912.json')).resolves.toEqual({
      year: 1912,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(currentFailures()).toEqual([]);
  });

  it('retries a 5xx with backoff and then succeeds', async () => {
    vi.useFakeTimers();
    // A fixed 0.5 jitter factor means the delay equals the computed backoff.
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(null, { status: 500 }))
      .mockResolvedValueOnce(jsonResponse(null, { status: 503 }))
      .mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const pending = fetchJson<{ ok: boolean }>('/data.json');
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(NETWORK.backoffBaseMs);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(NETWORK.backoffBaseMs * 2);
    await expect(pending).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(currentFailures()).toEqual([]);
  });

  it('gives up after the retry budget and reports a network failure', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const fetchMock = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    vi.stubGlobal('fetch', fetchMock);

    const pending = fetchJson('/offline.json', { retries: 1 }).catch((error) => error);
    await vi.advanceTimersByTimeAsync(NETWORK.backoffBaseMs);

    const error = await pending;
    expect(error).toBeInstanceOf(DataFetchError);
    expect((error as DataFetchError).record).toMatchObject({
      kind: 'network',
      status: null,
      attempts: 2,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(currentFailures()).toHaveLength(1);
  });

  it('caps Retry-After at backoffMaxMs instead of honouring an hour-long wait', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(null, { status: 429, headers: { 'retry-after': '3600' } }),
      )
      .mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const pending = fetchJson<{ ok: boolean }>('/slow.json');
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // The server asked for 3 600 000 ms; the cap is 4 000 ms.
    await vi.advanceTimersByTimeAsync(NETWORK.backoffMaxMs - 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('aborts a hanging request at timeoutMs and reports kind=timeout', async () => {
    vi.useFakeTimers();

    const fetchMock = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const pending = fetchJson('/hang.json', { timeoutMs: 1000, retries: 0 }).catch(
      (error) => error,
    );
    await vi.advanceTimersByTimeAsync(1000);

    const error = await pending;
    expect(error).toBeInstanceOf(DataFetchError);
    expect((error as DataFetchError).record).toMatchObject({
      kind: 'timeout',
      status: null,
      attempts: 1,
    });
    expect((error as DataFetchError).record.message).toContain('1000');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('treats an allowed 404 as definitive: no retry, no failure banner', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(null, { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchJson('/events/1500.json', { allowMissing: true }),
    ).rejects.toBeInstanceOf(DataFetchError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(currentFailures()).toEqual([]);
  });

  it('fetchOptionalJson degrades to the fallback but reports the failure', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(null, { status: 500 })),
    );

    const pending = fetchOptionalJson('/enhancement.json', { items: [] as string[] }, { retries: 0 });
    await vi.advanceTimersByTimeAsync(0);

    await expect(pending).resolves.toEqual({ data: { items: [] }, ok: false });
    expect(currentFailures()).toHaveLength(1);
  });
});
