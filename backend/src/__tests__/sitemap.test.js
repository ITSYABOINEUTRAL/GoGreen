'use strict';

/**
 * Tests for backend/src/routes/sitemap.js (Issue #256)
 *
 * Covers:
 *  - Redis object hit path
 *  - Redis legacy string hit path
 *  - In-memory fallback after first cold generation
 *  - Cold generation path (calls cache.set and db.query)
 *  - Conditional GET: matching if-none-match yields 304
 *  - escapeXml: special characters in product names are escaped in generated XML
 */

const request = require('supertest');
const express = require('express');

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('../cache', () => ({
  get: jest.fn(),
  set: jest.fn(),
}));

jest.mock('../db/schema', () => ({
  isPostgres: false,
  query: jest.fn(),
}));

const cache = require('../cache');
const db = require('../db/schema');
const sitemapRouter = require('../routes/sitemap');
const { _resetMemCache } = require('../routes/sitemap');

function buildApp() {
  const app = express();
  app.use('/sitemap.xml', sitemapRouter);
  return app;
}

// Fixed rows returned by db.query
const PRODUCTS = [{ id: 1, created_at: '2024-01-15T00:00:00.000Z' }];
const FARMERS  = [{ id: 2, created_at: '2024-02-20T00:00:00.000Z' }];

function mockDbCold() {
  db.query
    .mockResolvedValueOnce({ rows: PRODUCTS })
    .mockResolvedValueOnce({ rows: FARMERS });
}

beforeEach(() => {
  jest.clearAllMocks();
  _resetMemCache();
});

// ---------------------------------------------------------------------------
// Redis object hit
// ---------------------------------------------------------------------------
describe('Redis object cache hit', () => {
  it('returns cached XML and ETag without hitting the DB', async () => {
    const xml = '<?xml version="1.0"?><urlset></urlset>';
    const etag = 'abc123';
    cache.get.mockResolvedValue({ xml, etag });

    const res = await request(buildApp()).get('/sitemap.xml');

    expect(res.status).toBe(200);
    expect(res.text).toBe(xml);
    expect(res.headers['etag']).toBe(`"${etag}"`);
    expect(db.query).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Redis legacy string hit
// ---------------------------------------------------------------------------
describe('Redis legacy string cache hit', () => {
  it('tolerates a plain-string cached value and returns valid XML', async () => {
    const xml = '<?xml version="1.0"?><urlset><url><loc>http://localhost:3000/</loc></url></urlset>';
    cache.get.mockResolvedValue(xml);

    const res = await request(buildApp()).get('/sitemap.xml');

    expect(res.status).toBe(200);
    expect(res.text).toBe(xml);
    expect(res.headers['etag']).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Cold generation
// ---------------------------------------------------------------------------
describe('Cold generation (no cache)', () => {
  it('queries the DB, populates both cache tiers, and returns XML', async () => {
    cache.get.mockResolvedValue(null);
    mockDbCold();

    const res = await request(buildApp()).get('/sitemap.xml');

    expect(res.status).toBe(200);
    expect(res.text).toContain('<urlset');
    expect(res.text).toContain('/products/1');
    expect(res.text).toContain('/farmers/2');
    expect(cache.set).toHaveBeenCalledWith(
      'sitemap',
      expect.objectContaining({ xml: expect.any(String), etag: expect.any(String) }),
      expect.any(Number)
    );
  });

  it('populates in-memory cache so a second request does not call DB again', async () => {
    cache.get.mockResolvedValue(null);
    mockDbCold();
    const app = buildApp();

    await request(app).get('/sitemap.xml');

    // Reset Redis mock to miss again, but memCache should serve the second hit
    cache.get.mockResolvedValue(null);
    db.query.mockClear();

    const res2 = await request(app).get('/sitemap.xml');
    expect(res2.status).toBe(200);
    expect(db.query).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Conditional GET (ETag / 304)
// ---------------------------------------------------------------------------
describe('Conditional GET', () => {
  it('returns 304 with no body when if-none-match matches the ETag', async () => {
    cache.get.mockResolvedValue(null);
    mockDbCold();
    const app = buildApp();

    // First request to learn the ETag
    const first = await request(app).get('/sitemap.xml');
    const etag = first.headers['etag'];
    expect(etag).toBeTruthy();

    // Second request with matching ETag
    cache.get.mockResolvedValue(null); // memCache will serve from memory
    const second = await request(app)
      .get('/sitemap.xml')
      .set('if-none-match', etag);

    expect(second.status).toBe(304);
    expect(second.text).toBe('');
  });
});

// ---------------------------------------------------------------------------
// escapeXml helper (via generated XML)
// ---------------------------------------------------------------------------
describe('XML special character escaping', () => {
  it('escapes &, <, >, " in generated product URLs', async () => {
    cache.get.mockResolvedValue(null);
    // Product id containing special characters
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'a&b<c>d"e', created_at: null }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(buildApp()).get('/sitemap.xml');

    expect(res.status).toBe(200);
    expect(res.text).toContain('a&amp;b&lt;c&gt;d&quot;e');
    expect(res.text).not.toContain('a&b<c>d"e');
  });
});
