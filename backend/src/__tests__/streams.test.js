/**
 * Tests for routes/streams.js — SPA-facing payment stream router (#259)
 *
 * Covers: accrual clamp, elapsed freeze on cancelled streams, non-participant
 * 404, invalid id 400, and POST forwarding of end_time in seconds.
 */

process.env.JWT_SECRET = 'test-secret-for-jest';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const jwt = require('jsonwebtoken');

const mockDb = jest.requireMock('../db/schema');

// Stub paymentStreams router so forward() does not invoke Stellar.
jest.mock('../routes/paymentStreams', () => {
  const express = require('express');
  const router = express.Router();
  router.use((req, res) => {
    res.json({ success: true, forwarded: true, body: req.body, url: req.url });
  });
  return router;
});

jest.mock('../routes', () => {
  const express = require('express');
  const router = express.Router();
  router.use('/api/streams', require('../routes/streams'));
  return router;
});

const app = require('../app');

const SECRET = process.env.JWT_SECRET;
const callerToken = jwt.sign({ id: 1, role: 'buyer' }, SECRET);
const outsiderToken = jwt.sign({ id: 2, role: 'buyer' }, SECRET);

const CALLER_ADDRESS = 'GCALLER111';
const SENDER_ADDRESS = 'GSENDER222';
const RECIPIENT_ADDRESS = 'GRECIPIENT333';

function makeStream(overrides = {}) {
  const nowSec = Math.floor(Date.now() / 1000);
  return {
    id: 1,
    contract_id: 'CCONTRACT123',
    stream_id: 42,
    sender: SENDER_ADDRESS,
    recipient: CALLER_ADDRESS,
    rate_per_second: '1',
    deposit: '100',
    accrued_at_checkpoint: '0',
    last_checkpoint_at: String(nowSec - 50),
    end_time: String(nowSec + 50),
    cancelled: false,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.query = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 });
});

describe('toClientStream accrual logic (via GET /api/streams)', () => {
  it('caps accrued at deposit when rate * elapsed would exceed it', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const stream = makeStream({
      rate_per_second: '10',
      deposit: '100',
      accrued_at_checkpoint: '0',
      last_checkpoint_at: String(nowSec - 200),
      end_time: String(nowSec + 100),
      cancelled: false,
    });
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ stellar_public_key: CALLER_ADDRESS }] })
      .mockResolvedValueOnce({ rows: [stream] });

    const res = await request(app)
      .get('/api/streams')
      .set('Authorization', `Bearer ${callerToken}`);

    expect(res.status).toBe(200);
    const s = res.body.data[0];
    expect(s.accrued).toBe(100);
    expect(s.deposit_remaining).toBe(0);
  });

  it('freezes accrual at last_checkpoint_at when stream is cancelled', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const stream = makeStream({
      rate_per_second: '1',
      deposit: '100',
      accrued_at_checkpoint: '20',
      last_checkpoint_at: String(nowSec - 30),
      end_time: String(nowSec + 60),
      cancelled: true,
    });
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ stellar_public_key: CALLER_ADDRESS }] })
      .mockResolvedValueOnce({ rows: [stream] });

    const res = await request(app)
      .get('/api/streams')
      .set('Authorization', `Bearer ${callerToken}`);

    expect(res.status).toBe(200);
    const s = res.body.data[0];
    // cancelled → accrueUntil = last_checkpoint_at → elapsed = 0 → accrued = checkpoint value
    expect(s.accrued).toBe(20);
    expect(s.cancelled).toBe(true);
  });

  it('clamps elapsed to zero when last_checkpoint_at is in the future', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const stream = makeStream({
      rate_per_second: '1',
      deposit: '100',
      accrued_at_checkpoint: '5',
      last_checkpoint_at: String(nowSec + 100),
      end_time: String(nowSec + 200),
      cancelled: false,
    });
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ stellar_public_key: CALLER_ADDRESS }] })
      .mockResolvedValueOnce({ rows: [stream] });

    const res = await request(app)
      .get('/api/streams')
      .set('Authorization', `Bearer ${callerToken}`);

    expect(res.status).toBe(200);
    const s = res.body.data[0];
    expect(s.accrued).toBe(5); // accrued_at_checkpoint + 0 (elapsed clamped)
  });
});

describe('getParticipantStream access control', () => {
  it('returns 404 stream_not_found when caller is neither sender nor recipient', async () => {
    const stream = makeStream({
      sender: SENDER_ADDRESS,
      recipient: RECIPIENT_ADDRESS,
    });
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ stellar_public_key: 'GOTHER999' }] })
      .mockResolvedValueOnce({ rows: [stream] });

    const res = await request(app)
      .post('/api/streams/1/withdraw')
      .set('Authorization', `Bearer ${outsiderToken}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('stream_not_found');
  });

  it('returns 400 validation_error for a non-integer stream id', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ stellar_public_key: CALLER_ADDRESS }] });

    const res = await request(app)
      .post('/api/streams/not-a-number/withdraw')
      .set('Authorization', `Bearer ${callerToken}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('validation_error');
  });
});

describe('POST /api/streams forwarding', () => {
  it('forwards end_time as Math.floor(Date.parse(ends_at) / 1000)', async () => {
    const ends_at = '2030-01-01T00:00:00.000Z';
    const expectedEndTime = Math.floor(Date.parse(ends_at) / 1000);

    const res = await request(app)
      .post('/api/streams')
      .set('Authorization', `Bearer ${callerToken}`)
      .send({
        recipient: RECIPIENT_ADDRESS,
        rate: '0.001',
        deposit: '100',
        ends_at,
        contract_id: 'C'.padEnd(56, 'A'),
      });

    expect(res.status).toBe(200);
    expect(res.body.body.end_time).toBe(expectedEndTime);
    expect(res.body.body.recipient).toBe(RECIPIENT_ADDRESS);
  });
});
