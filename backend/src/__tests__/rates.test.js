/**
 * Unit tests for routes/rates.js — XLM/USD exchange rate caching
 *
 * Because routes/rates.js keeps a module-level cache object, each test
 * group uses jest.resetModules() + a fresh require so tests are fully
 * isolated from one another and ordering cannot affect results.
 */

process.env.JWT_SECRET = 'test-secret-for-jest';
process.env.NODE_ENV = 'test';

const request = require('supertest');

// Helper: build a fresh Express app with a freshly-required rates router,
// bypassing the module cache so the module-level `cache` starts empty.
function buildApp() {
  jest.resetModules();
  const express = require('express');
  const app = express();
  app.use(express.json());
  const ratesRouter = require('../routes/rates');
  app.use('/api/rates', ratesRouter);
  return app;
}

afterEach(() => {
  // Restore global.fetch so no other test file is affected
  if (global.fetch && global.fetch.mockRestore) {
    global.fetch.mockRestore();
  } else {
    delete global.fetch;
  }
});

describe('GET /api/rates/xlm-usd — fresh cache per test', () => {
  test('first request fetches from CoinGecko and returns cached:false', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ stellar: { usd: 0.123 } }),
    });

    const res = await request(buildApp()).get('/api/rates/xlm-usd');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.rate).toBe(0.123);
    expect(res.body.cached).toBe(false);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=usd',
      { headers: { Accept: 'application/json' } }
    );
  });

  test('fetch is called exactly once for two requests inside the TTL window', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ stellar: { usd: 0.456 } }),
    });

    const app = buildApp();

    // First request — should call fetch
    const res1 = await request(app).get('/api/rates/xlm-usd');
    expect(res1.body.cached).toBe(false);

    // Second request within TTL — should NOT call fetch again
    const res2 = await request(app).get('/api/rates/xlm-usd');
    expect(res2.status).toBe(200);
    expect(res2.body.rate).toBe(0.456);
    expect(res2.body.cached).toBe(true);

    // Fetch called exactly once for both requests
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('refetches after the TTL expires', async () => {
    const originalDateNow = Date.now;
    let now = originalDateNow();
    Date.now = jest.fn(() => now);

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ stellar: { usd: 0.789 } }),
    });

    const app = buildApp();

    await request(app).get('/api/rates/xlm-usd');
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Still within TTL (59 s)
    now += 59_000;
    await request(app).get('/api/rates/xlm-usd');
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Past TTL (61 s total)
    now += 2_000;
    await request(app).get('/api/rates/xlm-usd');
    expect(global.fetch).toHaveBeenCalledTimes(2);

    Date.now = originalDateNow;
  });

  test('returns stale:true when fetch rejects and a cached rate exists', async () => {
    const originalDateNow = Date.now;
    let now = originalDateNow();
    Date.now = jest.fn(() => now);

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ stellar: { usd: 0.111 } }),
      })
      .mockRejectedValueOnce(new Error('Network error'));

    const app = buildApp();

    // Warm up the cache
    await request(app).get('/api/rates/xlm-usd');

    // Advance past TTL so the router attempts a refresh
    now += 61_000;

    const res = await request(app).get('/api/rates/xlm-usd');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.rate).toBe(0.111);
    expect(res.body.stale).toBe(true);

    Date.now = originalDateNow;
  });

  test('returns HTTP 502 with rate_fetch_error code when fetch rejects and cache is cold', async () => {
    global.fetch = jest.fn().mockRejectedValueOnce(new Error('Network error'));

    const res = await request(buildApp()).get('/api/rates/xlm-usd');

    expect(res.status).toBe(502);
    expect(res.body.code).toBe('rate_fetch_error');
  });

  test('returns 502 when CoinGecko response is not ok and cache is cold', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({ ok: false, status: 500 });

    const res = await request(buildApp()).get('/api/rates/xlm-usd');

    expect(res.status).toBe(502);
    expect(res.body.code).toBe('rate_fetch_error');
  });

  test('returns 502 when rate is missing from CoinGecko response', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    const res = await request(buildApp()).get('/api/rates/xlm-usd');

    expect(res.status).toBe(502);
    expect(res.body.code).toBe('rate_fetch_error');
  });

  test('handles very small rate values', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ stellar: { usd: 0.000001 } }),
    });

    const res = await request(buildApp()).get('/api/rates/xlm-usd');

    expect(res.status).toBe(200);
    expect(res.body.rate).toBe(0.000001);
  });

  test('handles very large rate values', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ stellar: { usd: 999999.99 } }),
    });

    const res = await request(buildApp()).get('/api/rates/xlm-usd');

    expect(res.status).toBe(200);
    expect(res.body.rate).toBe(999999.99);
  });

  test('returns 502 when JSON parsing throws', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => { throw new Error('Invalid JSON'); },
    });

    const res = await request(buildApp()).get('/api/rates/xlm-usd');

    expect(res.status).toBe(502);
    expect(res.body.code).toBe('rate_fetch_error');
  });
});
