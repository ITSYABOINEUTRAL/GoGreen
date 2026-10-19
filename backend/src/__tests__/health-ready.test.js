/**
 * Tests for GET /api/health/ready — readiness probe (issue #94)
 */

process.env.JWT_SECRET = 'test-secret-for-jest';
process.env.NODE_ENV = 'test';

const request = require('supertest');

// Mock db before requiring app
jest.mock('../db/schema', () => ({
  query: jest.fn(),
  exec: jest.fn(),
  withTransaction: jest.fn(),
  ready: Promise.resolve(),
  isPostgres: false,
}));

jest.mock('../cache', () => ({
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  delByPattern: jest.fn(),
  invalidateProducts: jest.fn(),
  isReady: jest.fn(() => false),
}));

jest.mock('../logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const db = require('../db/schema');
const cache = require('../cache');
const app = require('../app');

describe('GET /api/health/ready', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: REDIS_URL unset
    delete process.env.REDIS_URL;
  });

  it('returns 200 with database ready and cache disabled when REDIS_URL is unset', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }], rowCount: 1 });

    const res = await request(app).get('/health/ready');

    expect(res.status).toBe(200);
    expect(res.body.database.status).toBe('ready');
    expect(res.body.cache.status).toBe('disabled');
    expect(res.body).toHaveProperty('stellar');
  });

  it('returns 503 when the database probe throws', async () => {
    db.query.mockRejectedValueOnce(new Error('connection refused'));

    const res = await request(app).get('/health/ready');

    expect(res.status).toBe(503);
    expect(res.body.database.status).toBe('unavailable');
  });

  it('reports cache as disabled when REDIS_URL is not set', async () => {
    db.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    delete process.env.REDIS_URL;

    const res = await request(app).get('/health/ready');

    expect(res.body.cache.status).toBe('disabled');
  });

  it('reports cache as ready when REDIS_URL is set and cache isReady returns true', async () => {
    db.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    process.env.REDIS_URL = 'redis://localhost:6379';
    cache.isReady.mockReturnValueOnce(true);

    const res = await request(app).get('/health/ready');

    expect(res.body.cache.status).toBe('ready');

    delete process.env.REDIS_URL;
  });

  it('reports cache as unavailable when REDIS_URL is set but cache not ready', async () => {
    db.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    process.env.REDIS_URL = 'redis://localhost:6379';
    cache.isReady.mockReturnValueOnce(false);

    const res = await request(app).get('/health/ready');

    expect(res.body.cache.status).toBe('unavailable');

    delete process.env.REDIS_URL;
  });
});
