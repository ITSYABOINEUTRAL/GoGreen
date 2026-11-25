'use strict';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-jest';
process.env.NODE_ENV = 'test';

const jwt = require('jsonwebtoken');
const request = require('supertest');

jest.mock('../middleware/auth', () => {
  const jwt = require('jsonwebtoken');
  return (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, code: 'missing_token' });
    try {
      req.user = jwt.verify(token, process.env.JWT_SECRET);
      next();
    } catch {
      res.status(401).json({ success: false, code: 'invalid_token' });
    }
  };
});

jest.mock('../routes', () => {
  const express = require('express');
  const router = express.Router();
  router.use('/api/addresses', require('../routes/addresses'));
  return router;
});

const app = require('../app');
const mockDb = jest.requireMock('../db/schema');

const SECRET = process.env.JWT_SECRET;
const buyerToken = jwt.sign({ id: 1, role: 'buyer' }, SECRET);

const fakeAddress = {
  id: 10,
  user_id: 1,
  label: 'Home',
  street: '123 Main St',
  city: 'Anytown',
  country: 'US',
  postal_code: '12345',
  is_default: 1,
  created_at: new Date().toISOString(),
};

describe('PUT /api/addresses/:id — non-numeric id returns 400', () => {
  it('returns 400 for a non-numeric id without querying the DB', async () => {
    const res = await request(app)
      .put('/api/addresses/abc')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ label: 'Home', street: '123 Main St', city: 'Anytown', country: 'US' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('validation_error');
    expect(mockDb.query).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/addresses/:id/default — non-numeric id returns 400', () => {
  it('returns 400 for a non-numeric id without querying the DB', async () => {
    const res = await request(app)
      .patch('/api/addresses/xyz/default')
      .set('Authorization', `Bearer ${buyerToken}`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('validation_error');
    expect(mockDb.query).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/addresses/:id — non-numeric id returns 400', () => {
  it('returns 400 for a non-numeric id without querying the DB', async () => {
    const res = await request(app)
      .delete('/api/addresses/not-a-number')
      .set('Authorization', `Bearer ${buyerToken}`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('validation_error');
    expect(mockDb.query).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/addresses/:id/default — atomic transaction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // restore default withTransaction implementation
    mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });
    mockDb.withTransaction.mockImplementation(async (fn) => {
      const txQuery = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 });
      return fn({ query: txQuery });
    });
  });

  it('swaps default atomically via withTransaction', async () => {
    // SELECT address lookup
    mockDb.query
      .mockResolvedValueOnce({ rows: [fakeAddress], rowCount: 1 })
      // SELECT after update
      .mockResolvedValueOnce({ rows: [{ ...fakeAddress, is_default: 1 }], rowCount: 1 });

    const txQuery = jest.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // UPDATE clear defaults
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // UPDATE set new default
    mockDb.withTransaction.mockImplementation(async (fn) => fn({ query: txQuery }));

    const res = await request(app)
      .patch('/api/addresses/10/default')
      .set('Authorization', `Bearer ${buyerToken}`);

    expect(res.status).toBe(200);
    expect(mockDb.withTransaction).toHaveBeenCalledTimes(1);
    expect(txQuery).toHaveBeenCalledTimes(2);
    // First call clears defaults for the user
    expect(txQuery.mock.calls[0][0]).toMatch(/SET is_default = 0/);
    // Second call sets new default scoped by user_id
    expect(txQuery.mock.calls[1][0]).toMatch(/SET is_default = 1/);
    expect(txQuery.mock.calls[1][1]).toEqual([10, 1]);
  });

  it('returns 500 and leaves previous default intact when the swap fails', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [fakeAddress], rowCount: 1 });
    mockDb.withTransaction.mockRejectedValueOnce(new Error('DB error'));

    const res = await request(app)
      .patch('/api/addresses/10/default')
      .set('Authorization', `Bearer ${buyerToken}`);

    expect(res.status).toBe(500);
  });
});
