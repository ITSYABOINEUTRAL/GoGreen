import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';
import { describe, it, expect, beforeEach, vi } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const swPath = resolve(__dirname, '../../public/sw.js');
const swSource = readFileSync(swPath, 'utf8');

function getPublicApiAllowlist() {
  const block = swSource.match(/const PUBLIC_API_ALLOWLIST = (\[[\s\S]*?\]);/);
  if (!block) throw new Error('PUBLIC_API_ALLOWLIST not found in sw.js');
  return vm.runInNewContext(block[1], { RegExp });
}

// In-memory Cache Storage stub keyed by cache name.
function createCachesStub() {
  const stores = new Map();

  function makeCache(name) {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name);
    return {
      async put(request, response) {
        store.set(typeof request === 'string' ? request : request.url, response);
      },
      async match(request) {
        const key = typeof request === 'string' ? request : request.url;
        return store.get(key);
      },
      async delete(request) {
        const key = typeof request === 'string' ? request : request.url;
        return store.delete(key);
      },
      async keys() {
        return Array.from(store.keys());
      },
    };
  }

  return {
    stores,
    async open(name) {
      return makeCache(name);
    },
    async keys() {
      return Array.from(stores.keys());
    },
    async delete(name) {
      return stores.delete(name);
    },
    async match(request) {
      const key = typeof request === 'string' ? request : request.url;
      for (const store of stores.values()) {
        if (store.has(key)) return store.get(key);
      }
      return undefined;
    },
  };
}

function loadServiceWorker({ fetchImpl } = {}) {
  const caches = createCachesStub();
  const listeners = {};
  const self = {
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
    skipWaiting() {},
    clients: { claim: async () => {} },
    caches,
    location: { origin: 'https://example.com' },
  };

  const sandbox = {
    self,
    caches,
    clients: self.clients,
    location: self.location,
    console,
    fetch: fetchImpl || (async () => ({ ok: true, status: 200, clone: () => ({}) })),
    Request: class Request {
      constructor(url, init = {}) {
        this.url = url;
        this.method = init.method || 'GET';
        this.headers = new Map(Object.entries(init.headers || {}));
      }
    },
    Response: class Response {
      constructor(body, init = {}) {
        this.body = body;
        this.status = init.status ?? 200;
        this.headers = init.headers || {};
        this.ok = this.status >= 200 && this.status < 300;
      }
      clone() {
        return new sandbox.Response(this.body, {
          status: this.status,
          headers: this.headers,
        });
      }
      async json() {
        return JSON.parse(this.body);
      }
    },
    URL,
    Promise,
    Map,
    Set,
    Array,
    Object,
    JSON,
    RegExp,
    String,
    Number,
    Boolean,
    Error,
    Date,
    Math,
  };
  sandbox.globalThis = sandbox;

  vm.createContext(sandbox);
  vm.runInContext(swSource, sandbox);

  return { sandbox, caches, listeners };
}

function makeRequest(url, { method = 'GET', headers = {}, mode = 'cors' } = {}) {
  return {
    url,
    method,
    mode,
    headers: {
      get(name) {
        const key = Object.keys(headers).find(
          (h) => h.toLowerCase() === name.toLowerCase()
        );
        return key ? headers[key] : null;
      },
    },
  };
}

function requestUrl(request) {
  return new URL(request.url);
}

async function invokeFetchHandler(sw, request, options = {}) {
  const handler = sw.listeners.fetch;
  expect(handler).toBeTypeOf('function');
  let responsePromise;
  const event = {
    request,
    respondWith(promise) {
      responsePromise = promise;
    },
  };
  handler(event);
  return responsePromise;
}

describe('service worker API cache allowlist', () => {
  let sw;

  beforeEach(() => {
    sw = loadServiceWorker();
  });

  it('exposes PUBLIC_API_ALLOWLIST, isCacheableApiRequest and clearUserCache', () => {
    expect(getPublicApiAllowlist()).toHaveLength(3);
    expect(typeof sw.sandbox.isCacheableApiRequest).toBe('function');
    expect(typeof sw.sandbox.clearUserCache).toBe('function');
  });

  it('returns false for POST requests', () => {
    const request = makeRequest('https://example.com/api/v1/products', {
      method: 'POST',
    });
    const url = requestUrl(request);
    expect(sw.sandbox.isCacheableApiRequest(request, url)).toBe(false);
  });

  it('returns false for GET requests carrying an Authorization header', () => {
    const request = makeRequest('https://example.com/api/v1/products', {
      headers: { Authorization: 'Bearer token' },
    });
    const url = requestUrl(request);
    expect(sw.sandbox.isCacheableApiRequest(request, url)).toBe(false);
  });

  it('returns true for allowlisted unauthenticated GET requests', () => {
    for (const path of [
      '/api/v1/products',
      '/api/v1/products/42',
      '/api/v1/categories',
      '/api/v1/rates',
    ]) {
      const request = makeRequest(`https://example.com${path}`);
      expect(sw.sandbox.isCacheableApiRequest(request, requestUrl(request))).toBe(
        true
      );
    }
  });

  it('returns false for non-allowlisted API paths', () => {
    for (const path of ['/api/v1/orders', '/api/v1/wallet', '/api/messages']) {
      const request = makeRequest(`https://example.com${path}`);
      expect(sw.sandbox.isCacheableApiRequest(request, requestUrl(request))).toBe(
        false
      );
    }
  });
});

describe('service worker product listing fetch branch', () => {
  it('returns 503 offline JSON when cache and network are unavailable', async () => {
    const sw = loadServiceWorker({
      fetchImpl: () => Promise.reject(new Error('offline')),
    });
    const request = makeRequest('https://example.com/api/products');
    const response = await invokeFetchHandler(sw, request);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'offline' });
  });

  it('does not cache product responses that carry an Authorization header', async () => {
    const putSpy = vi.fn();
    const sw = loadServiceWorker({
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        clone() {
          return { ok: true, status: 200 };
        },
      }),
    });
    const originalOpen = sw.caches.open.bind(sw.caches);
    sw.caches.open = async (name) => {
      const cache = await originalOpen(name);
      const originalPut = cache.put.bind(cache);
      cache.put = async (...args) => {
        putSpy(...args);
        return originalPut(...args);
      };
      return cache;
    };

    const request = makeRequest('https://example.com/api/products', {
      headers: { Authorization: 'Bearer secret' },
    });
    await invokeFetchHandler(sw, request);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(putSpy).not.toHaveBeenCalled();
  });
});

describe('clearUserCache', () => {
  it('deletes cached /api/ entries but keeps non-API entries', async () => {
    const sw = loadServiceWorker();
    const cache = await sw.caches.open('api-cache');
    await cache.put('https://example.com/api/v1/products', { body: 'products' });
    await cache.put('https://example.com/api/wallet', { body: 'wallet' });
    await cache.put('https://example.com/offline.html', { body: 'offline' });

    await sw.sandbox.clearUserCache();

    const remaining = await cache.keys();
    expect(remaining).not.toContain('https://example.com/api/v1/products');
    expect(remaining).not.toContain('https://example.com/api/wallet');
    expect(remaining).toContain('https://example.com/offline.html');
  });
});