'use strict';

jest.mock('../db/schema');
jest.mock('../utils/cdn', () => ({ rewriteImageUrl: jest.fn() }));
jest.mock('../middleware/auth', () => (req, _res, next) => { req.user = { id: 1, role: 'farmer' }; next(); });
jest.mock('../middleware/validate', () => ({ farmerProfile: (_req, _res, next) => next() }));
jest.mock('../services/webhookVerify', () => ({ webhookMiddleware: () => (_req, _res, next) => next() }));

const db = require('../db/schema');
const { rewriteImageUrl } = require('../utils/cdn');
const express = require('express');
const request = require('supertest');
const farmersRouter = require('../routes/farmers');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/farmers', farmersRouter);
  return app;
}

describe('GET /api/farmers/:id', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    rewriteImageUrl.mockImplementation((url) => (url ? `https://cdn.example.com${url}` : url));
  });

  it('returns 404 when farmer not found', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(buildApp()).get('/api/farmers/999');
    expect(res.status).toBe(404);
  });

  it('returns farmer with verified, cooperatives and listings with CDN image_url', async () => {
    db.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            name: 'Alice',
            bio: 'bio',
            location: 'loc',
            avatar_url: null,
            created_at: '2024-01-01',
            latitude: 0,
            longitude: 0,
            farm_address: 'addr',
            verification_status: 'verified',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: 10, name: 'Tomato', image_url: '/uploads/tomato.jpg' }] })
      .mockResolvedValueOnce({ rows: [{ id: 5, name: 'Coop A' }] });

    const res = await request(buildApp()).get('/api/farmers/1');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const { data } = res.body;
    expect(data.verified).toBe(true);
    expect(data.cooperatives).toEqual([{ id: 5, name: 'Coop A' }]);
    expect(data.listings).toHaveLength(1);
    expect(data.listings[0].image_url).toBe('https://cdn.example.com/uploads/tomato.jpg');
    expect(data.verification_status).toBeUndefined();
  });

  it('res.json is invoked exactly once for a successful lookup', async () => {
    db.query
      .mockResolvedValueOnce({
        rows: [{ id: 2, name: 'Bob', bio: null, location: null, avatar_url: null,
          created_at: '2024-01-01', latitude: null, longitude: null,
          farm_address: null, verification_status: 'pending' }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const app = express();
    app.use(express.json());
    let jsonCallCount = 0;
    app.use((req, res, next) => {
      const orig = res.json.bind(res);
      res.json = (...args) => { jsonCallCount++; return orig(...args); };
      next();
    });
    app.use('/api/farmers', farmersRouter);

    const res = await request(app).get('/api/farmers/2');
    expect(res.status).toBe(200);
    expect(jsonCallCount).toBe(1);
  });
});
