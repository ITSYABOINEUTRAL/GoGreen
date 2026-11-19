import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { request, REFRESH_TIMEOUT_MS } from '../client';

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  };
}

describe('api client refreshAccessToken single-flight', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('performs exactly one POST /auth/refresh for two concurrent 401 retries', async () => {
    let refreshCalls = 0;
    const fetchMock = vi.fn((url, options = {}) => {
      const target = typeof url === 'string' ? url : url.url;
      if (target.endsWith('/auth/refresh')) {
        refreshCalls += 1;
        return new Promise((resolve) => {
          setTimeout(() => resolve(jsonResponse({ accessToken: 'new-token' })), 10);
        });
      }
      const auth = options.headers?.Authorization;
      if (auth === 'Bearer new-token') {
        return Promise.resolve(jsonResponse({ ok: true }));
      }
      return Promise.resolve(jsonResponse({ message: 'unauthorized' }, { ok: false, status: 401 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const [first, second] = await Promise.all([
      request('/protected'),
      request('/protected'),
    ]);

    expect(refreshCalls).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(first).toEqual({ ok: true });
    expect(second).toEqual({ ok: true });
  });

  it('aborts a hanging refresh after REFRESH_TIMEOUT_MS and resolves to null', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((url) => {
      const target = typeof url === 'string' ? url : url.url;
      if (target.endsWith('/auth/refresh')) {
        return new Promise(() => {});
      }
      return Promise.resolve(jsonResponse({ message: 'unauthorized' }, { ok: false, status: 401 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const pending = request('/protected');
    await vi.advanceTimersByTimeAsync(REFRESH_TIMEOUT_MS + 1);

    await expect(pending).resolves.toBeNull();
  });

  it('resolves to null without throwing when the refresh response is not ok', async () => {
    const fetchMock = vi.fn((url) => {
      const target = typeof url === 'string' ? url : url.url;
      if (target.endsWith('/auth/refresh')) {
        return Promise.resolve(jsonResponse({ message: 'invalid' }, { ok: false, status: 401 }));
      }
      return Promise.resolve(jsonResponse({ message: 'unauthorized' }, { ok: false, status: 401 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(request('/protected')).resolves.toBeNull();
  });
});
