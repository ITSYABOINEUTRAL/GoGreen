'use strict';

/**
 * Tests for POST /api/disputes (issue #276)
 * Covers: input validation, order lookup, status/window/duplicate checks, success.
 */

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-jest';
process.env.NODE_ENV = 'test';

const jwt = require('jsonwebtoken');
const request = require('supertest');

jest.mock('../middleware/auth', () => {
  const jwt = require('jsonwebtoken');
  return (req, res, next) => {
    const header = req.headers['authorization'];
    if (!header) return res.status(401).json({ error: 'unauthorized' });
    try {
      req.user = jwt.verify(header.replace('Bearer ', ''), process.env.JWT_SECRET);
      next();
    } catch {
      res.status(401).json({ error: 'unauthorized' });
    }
  };
});

jest.mock('../middleware/validate', () => ({
  dispute: (req, res, next) => next(),
}));

jest.mock('../routes', () => {
  const express = require('express');
  const router = express.Router();
  router.use('/api/disputes', require('../routes/disputes'));
  return router;
});

jest.mock('../utils/mailer', () => ({
  sendDisputeOpenedEmail: jest.fn().mockResolvedValue({}),
  sendDisputeResolvedEmail: jest.fn().mockResolvedValue({}),
}));
jest.mock('../utils/stellar', () => ({
  burnRewardTokens: jest.fn().mockResolvedValue({}),
  invokeEscrowContract: jest.fn().mockResolvedValue({}),
}));
jest.mock('../utils/pushNotifications', () => ({
  sendPushToUser: jest.fn().mockResolvedValue({}),
}));
jest.mock('../utils/auditLog', () => ({
  writeAuditLog: jest.fn().mockResolvedValue({}),
}));
jest.mock('../utils/crypto', () => ({
  decryptUserSecretKey: jest.fn().mockResolvedValue('SECRET'),
}));

const app = require('../app');
const mockDb = jest.requireMock('../db/schema');

const SECRET = process.env.JWT_SECRET;
const buyerToken = jwt.sign({ id: 2, role: 'buyer' }, SECRET);

const validBody = { order_id: 5, reason: 'Item was damaged' };

const paidOrder = {
  id: 5,
  status: 'paid',
  buyer_id: 2,
  farmer_id: 1,
  created_at: new Date().toISOString(),
  paid_at: new Date().toISOString(),
  farmer_wallet: 'GFARMER',
  farmer_email: 'farmer@example.com',
  farmer_name: 'Farmer Joe',
  stellar_secret_key: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.query = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 });
});

describe('POST /api/disputes — input validation', () => {
  it('returns 400 for missing reason without touching the DB', async () => {
    const res = await request(app)
      .post('/api/disputes')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ order_id: 5 });
    expect(res.status).toBe(400);
    expect(mockDb.query).not.toHaveBeenCalled();
  });

  it('returns 400 for whitespace-only reason without touching the DB', async () => {
    const res = await request(app)
      .post('/api/disputes')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ order_id: 5, reason: '   ' });
    expect(res.status).toBe(400);
    expect(mockDb.query).not.toHaveBeenCalled();
  });

  it('returns 400 for non-numeric order_id without touching the DB', async () => {
    const res = await request(app)
      .post('/api/disputes')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ order_id: 'abc', reason: 'valid reason' });
    expect(res.status).toBe(400);
    expect(mockDb.query).not.toHaveBeenCalled();
  });

  it('returns 400 for order_id of zero without touching the DB', async () => {
    const res = await request(app)
      .post('/api/disputes')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ order_id: 0, reason: 'valid reason' });
    expect(res.status).toBe(400);
    expect(mockDb.query).not.toHaveBeenCalled();
  });
});

describe('POST /api/disputes — order lookup and status checks', () => {
  it('returns 404 when order is not found', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await request(app)
      .post('/api/disputes')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send(validBody);
    expect(res.status).toBe(404);
  });

  it('returns 400 when order is not in paid status', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ ...paidOrder, status: 'pending' }], rowCount: 1 });
    const res = await request(app)
      .post('/api/disputes')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send(validBody);
    expect(res.status).toBe(400);
  });

  it('returns 400 when outside the dispute window', async () => {
    const oldOrder = {
      ...paidOrder,
      created_at: new Date(Date.now() - 100 * 60 * 60 * 1000).toISOString(),
      paid_at: new Date(Date.now() - 100 * 60 * 60 * 1000).toISOString(),
    };
    mockDb.query.mockResolvedValueOnce({ rows: [oldOrder], rowCount: 1 });
    const res = await request(app)
      .post('/api/disputes')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send(validBody);
    expect(res.status).toBe(400);
  });

  it('returns 409 when a dispute already exists for the order', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [paidOrder], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 99 }], rowCount: 1 });
    const res = await request(app)
      .post('/api/disputes')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send(validBody);
    expect(res.status).toBe(409);
  });
});

describe('POST /api/disputes — success', () => {
  it('returns 201 and dispute id on success', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [paidOrder], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ id: 42 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app)
      .post('/api/disputes')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.disputeId).toBe(42);
  });
});
