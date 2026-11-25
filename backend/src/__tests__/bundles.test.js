const request = require('supertest');
const express = require('express');

jest.mock('../db/schema', () => ({ query: jest.fn() }));

const db = require('../db/schema');
const bundlesRouter = require('../routes/bundles');

function makeApp(user) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = user;
    next();
  });
  app.use('/api/bundles', bundlesRouter);
  return app;
}

const buyer = { id: 1, role: 'buyer' };
const farmer = { id: 2, role: 'farmer' };

beforeEach(() => {
  db.query.mockReset();
});

describe('POST /api/bundles/purchase', () => {
  test('returns 403 for a non-buyer', async () => {
    const res = await request(makeApp(farmer))
      .post('/api/bundles/purchase')
      .send({ bundle_id: 1 });
    expect(res.status).toBe(403);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('returns 400 when bundle_id is missing', async () => {
    const res = await request(makeApp(buyer))
      .post('/api/bundles/purchase')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('bundle_id must be a positive integer');
    expect(db.query).not.toHaveBeenCalled();
  });

  test('returns 400 when bundle_id is not an integer', async () => {
    const res = await request(makeApp(buyer))
      .post('/api/bundles/purchase')
      .send({ bundle_id: 'abc' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('bundle_id must be a positive integer');
    expect(db.query).not.toHaveBeenCalled();
  });

  test('returns 404 when the bundle does not exist', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(makeApp(buyer))
      .post('/api/bundles/purchase')
      .send({ bundle_id: 999 });
    expect(res.status).toBe(404);
    expect(db.query).toHaveBeenCalledTimes(1);
  });
});

describe('farmer-only guards', () => {
  test('POST / returns 403 for a non-farmer', async () => {
    const res = await request(makeApp(buyer))
      .post('/api/bundles')
      .send({ name: 'Box', price: 10, quantity: 5 });
    expect(res.status).toBe(403);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('DELETE /:id returns 403 for a non-farmer', async () => {
    const res = await request(makeApp(buyer)).delete('/api/bundles/1');
    expect(res.status).toBe(403);
    expect(db.query).not.toHaveBeenCalled();
  });
});
