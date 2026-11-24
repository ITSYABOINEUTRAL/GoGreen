import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  request,
  __resetForTests,
  setAccessToken,
  setLogoutCallback,
} from '../client';

const REFRESH_TIMEOUT_MS = 10_000;

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  };
}

// Make getCsrfToken() return a value so ensureCsrfToken() does not issue an
// extra fetch call in tests that only need to track refresh calls.
function setCsrfCookie() {
  document.cookie = 'csrf_token=test-csrf';
}

describe('api client refreshAccessToken single-flight', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    __resetForTests();
    setCsrfCookie();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    setLogoutCallback(null);
  });

  it('performs exactly one POST /auth/refresh for two concurrent 401 retries', async () => {
    let refreshCalls = 0;
    const fetchMock = vi.fn((url, options = {}) => {
      const target = typeof url === 'string' ? url : url.url;
      if (target.includes('/auth/refresh')) {
        refreshCalls += 1;
        return new Promise((resolve) => {
          setTimeout(() => resolve(jsonResponse({ token: 'new-token' })), 10);
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
    expect(first).toEqual({ ok: true });
    expect(second).toEqual({ ok: true });
  });

  it('calls the logout callback exactly once when refresh fails for concurrent 401s', async () => {
    const logoutFn = vi.fn();
    setLogoutCallback(logoutFn);

    const fetchMock = vi.fn((url) => {
      const target = typeof url === 'string' ? url : url.url;
      if (target.includes('/auth/refresh')) {
        return Promise.resolve(jsonResponse({ error: 'invalid' }, { ok: false, status: 401 }));
      }
      return Promise.resolve(jsonResponse({ message: 'unauthorized' }, { ok: false, status: 401 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    await Promise.all([
      request('/protected').catch(() => {}),
      request('/protected').catch(() => {}),
    ]);

    expect(logoutFn).toHaveBeenCalledTimes(1);
  });

  it('allows a new refresh after setAccessToken re-arms the session-expiry latch', async () => {
    let refreshCalls = 0;

    // Phase 1: failed refresh → session expires
    vi.stubGlobal('fetch', vi.fn((url) => {
      const target = typeof url === 'string' ? url : url.url;
      if (target.includes('/auth/refresh')) {
        refreshCalls++;
        return Promise.resolve(jsonResponse({ error: 'invalid' }, { ok: false, status: 401 }));
      }
      return Promise.resolve(jsonResponse({}, { ok: false, status: 401 }));
    }));

    await request('/protected').catch(() => {});
    expect(refreshCalls).toBe(1);

    // Phase 2: re-arm the latch via setAccessToken
    setAccessToken('a-renewed-token');

    // Phase 3: a new 401 should trigger a fresh refresh
    vi.stubGlobal('fetch', vi.fn((url, options = {}) => {
      const target = typeof url === 'string' ? url : url.url;
      if (target.includes('/auth/refresh')) {
        refreshCalls++;
        return Promise.resolve(jsonResponse({ token: 'newer-token' }));
      }
      const auth = options.headers?.Authorization;
      if (auth === 'Bearer newer-token') return Promise.resolve(jsonResponse({ ok: true }));
      return Promise.resolve(jsonResponse({}, { ok: false, status: 401 }));
    }));

    const r = await request('/other');
    expect(r).toEqual({ ok: true });
    expect(refreshCalls).toBe(2);
  });

  it('aborts a hanging refresh after REFRESH_TIMEOUT_MS and resolves to null', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((url) => {
      const target = typeof url === 'string' ? url : url.url;
      if (target.includes('/auth/refresh')) {
        return new Promise(() => {});
      }
      return Promise.resolve(jsonResponse({ message: 'unauthorized' }, { ok: false, status: 401 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const pending = request('/protected').catch(() => null);
    await vi.advanceTimersByTimeAsync(REFRESH_TIMEOUT_MS + 1);

    await expect(pending).resolves.toBeNull();
  });

  it('does not throw when the refresh response is not ok', async () => {
    const fetchMock = vi.fn((url) => {
      const target = typeof url === 'string' ? url : url.url;
      if (target.includes('/auth/refresh')) {
        return Promise.resolve(jsonResponse({ message: 'invalid' }, { ok: false, status: 401 }));
      }
      return Promise.resolve(jsonResponse({ message: 'unauthorized' }, { ok: false, status: 401 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(request('/protected').catch(() => null)).resolves.toBeNull();
  });
});
