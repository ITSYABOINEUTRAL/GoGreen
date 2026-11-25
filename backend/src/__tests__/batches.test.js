const request = require('supertest');
const express = require('express');

jest.mock('../db/schema', () => ({
  query: jest.fn(),
}));

jest.mock('qrcode', () => ({
  toDataURL: jest.fn(),
}));

const db = require('../db/schema');
const QRCode = require('qrcode');
const batchesRouter = require('../routes/batches');

function makeApp(user) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = user;
    next();
  });
  app.use('/api/batches', batchesRouter);
  return app;
}

const farmer = { id: 1, role: 'farmer' };
const buyer = { id: 2, role: 'buyer' };

const VALID_UUID = '123e4567-e89b-42d3-a456-426614174000';

beforeEach(() => {
  jest.clearAllMocks();
  QRCode.toDataURL.mockResolvedValue('data:image/png;base64,abc');
});

describe('GET /api/batches', () => {
  test('returns 403 for non-farmer', async () => {
    const res = await request(makeApp(buyer)).get('/api/batches');
    expect(res.status).toBe(403);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('returns 400 when farmer_id is not an integer', async () => {
    const res = await request(makeApp(farmer)).get('/api/batches?farmer_id=abc');
    expect(res.status).toBe(400);
  });

  test('returns 400 when farmer_id is less than 1', async () => {
    const res = await request(makeApp(farmer)).get('/api/batches?farmer_id=0');
    expect(res.status).toBe(400);
  });

  test('lists batches for the authenticated farmer', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, batch_code: 'B1' }] });
    const res = await request(makeApp(farmer)).get('/api/batches');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 1, batch_code: 'B1' }]);
  });
});

describe('POST /api/batches', () => {
  test('returns 403 for non-farmer', async () => {
    const res = await request(makeApp(buyer))
      .post('/api/batches')
      .send({ harvest_date: '2024-01-01' });
    expect(res.status).toBe(403);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('returns 400 when harvest_date is missing', async () => {
    const res = await request(makeApp(farmer)).post('/api/batches').send({});
    expect(res.status).toBe(400);
  });

  test('returns 400 when harvest_date has an invalid format', async () => {
    const res = await request(makeApp(farmer))
      .post('/api/batches')
      .send({ harvest_date: '01/01/2024' });
    expect(res.status).toBe(400);
  });

  test('creates a batch and returns a QR code', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, batch_code: 'B1' }] });
    const res = await request(makeApp(farmer))
      .post('/api/batches')
      .send({ harvest_date: '2024-01-01' });
    expect(res.status).toBe(201);
    expect(res.body.qr_code).toBe('data:image/png;base64,abc');
    expect(QRCode.toDataURL).toHaveBeenCalled();
  });

  test('returns 409 on duplicate batch code (Postgres 23505)', async () => {
    const err = new Error('duplicate key');
    err.code = '23505';
    db.query.mockRejectedValueOnce(err);
    const res = await request(makeApp(farmer))
      .post('/api/batches')
      .send({ harvest_date: '2024-01-01' });
    expect(res.status).toBe(409);
  });

  test('returns 409 on duplicate batch code (SQLite UNIQUE message)', async () => {
    db.query.mockRejectedValueOnce(new Error('UNIQUE constraint failed: batches.batch_code'));
    const res = await request(makeApp(farmer))
      .post('/api/batches')
      .send({ harvest_date: '2024-01-01' });
    expect(res.status).toBe(409);
  });
});

describe('GET /api/batches/:batchId/verify', () => {
  test('returns 400 for a malformed batch id', async () => {
    const res = await request(makeApp(buyer)).get('/api/batches/not-a-uuid/verify');
    expect(res.status).toBe(400);
  });

  test('returns 404 when no batch matches', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(makeApp(buyer)).get(`/api/batches/${VALID_UUID}/verify`);
    expect(res.status).toBe(404);
  });

  test('returns certified true when certifications are present', async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        {
          batch_code: 'B1',
          harvest_date: '2024-01-01',
          farmer_name: 'Jane',
          certifications: 'Organic',
        },
      ],
    });
    const res = await request(makeApp(buyer)).get(`/api/batches/${VALID_UUID}/verify`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      batch_code: 'B1',
      harvest_date: '2024-01-01',
      farmer_name: 'Jane',
      certified: true,
    });
  });

  test('returns certified false when certifications are empty', async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        {
          batch_code: 'B2',
          harvest_date: '2024-02-02',
          farmer_name: 'John',
          certifications: '',
        },
      ],
    });
    const res = await request(makeApp(buyer)).get(`/api/batches/${VALID_UUID}/verify`);
    expect(res.status).toBe(200);
    expect(res.body.certified).toBe(false);
  });
});
