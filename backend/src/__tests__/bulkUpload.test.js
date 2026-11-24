/**
 * Integration tests for POST /api/products/bulk (CSV bulk upload).
 */

process.env.JWT_SECRET = 'test-secret-for-jest';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const jwt = require('jsonwebtoken');

const mockDb = jest.requireMock('../db/schema');

jest.mock('../routes', () => {
  const express = require('express');
  const router = express.Router();
  router.use('/api/products/bulk', require('../routes/bulkUpload'));
  return router;
});

const app = require('../app');

const farmerToken = jwt.sign({ id: 1, role: 'farmer' }, process.env.JWT_SECRET);

function csvUpload(csvContent) {
  return request(app)
    .post('/api/products/bulk')
    .set('Authorization', `Bearer ${farmerToken}`)
    .attach('file', Buffer.from(csvContent), { filename: 'products.csv', contentType: 'text/csv' });
}

describe('POST /api/products/bulk', () => {
  beforeEach(() => {
    mockDb.prepare = jest.fn(() => ({
      run: jest.fn(),
    }));
    mockDb.transaction = jest.fn((fn) => fn);
  });

  it('accepts a valid CSV and returns created count', async () => {
    const csv = 'name,price,quantity,unit,category\nTomatoes,2.5,100,kg,vegetables\n';
    const res = await csvUpload(csv);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.created).toBe(1);
    expect(res.body.skipped).toBe(0);
  });

  it('returns 400 with missing_columns when price column is absent', async () => {
    const csv = 'name,quantity\nTomatoes,100\n';
    const res = await csvUpload(csv);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('missing_columns');
    expect(res.body.message).toContain('price');
  });

  it('returns 400 listing all missing columns', async () => {
    const csv = 'description,unit\nFresh,kg\n';
    const res = await csvUpload(csv);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('missing_columns');
    expect(res.body.message).toContain('name');
    expect(res.body.message).toContain('price');
    expect(res.body.message).toContain('quantity');
  });

  it('returns 400 with missing_columns for empty CSV with wrong headers', async () => {
    const csv = 'description,unit\n';
    const res = await csvUpload(csv);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('missing_columns');
    expect(res.body.message).toContain('name');
    expect(res.body.message).toContain('price');
    expect(res.body.message).toContain('quantity');
  });

  it('skips invalid rows and reports them, still creates valid ones', async () => {
    const csv = [
      'name,price,quantity',
      'Tomatoes,2.5,100',   // valid
      ',1.0,10',            // missing name → skipped
      'Eggs,bad,50',        // bad price → skipped
      'Milk,3.0,20',        // valid
    ].join('\n');
    const res = await csvUpload(csv);
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(2);
    expect(res.body.skipped).toBe(2);
    expect(res.body.errors).toHaveLength(2);
  });
});

describe('POST /api/products/bulk — PostgreSQL dialect', () => {
  beforeEach(() => {
    mockDb.isPostgres = true;
    mockDb.withTransaction = jest.fn(async (fn) => {
      const q = { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 1 }) };
      await fn(q);
      return q;
    });
  });

  afterEach(() => {
    mockDb.isPostgres = false;
  });

  it('accepts a valid CSV and creates rows via withTransaction on Postgres', async () => {
    const csv = 'name,price,quantity\nTomatoes,2.5,100\n';
    const res = await csvUpload(csv);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.created).toBe(1);
    expect(mockDb.withTransaction).toHaveBeenCalledTimes(1);
  });

  it('returns 400 missing_columns without calling withTransaction', async () => {
    const csv = 'name,quantity\nTomatoes,100\n';
    const res = await csvUpload(csv);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('missing_columns');
    expect(mockDb.withTransaction).not.toHaveBeenCalled();
  });

  it('returns db_error (not parse_error) when withTransaction rejects', async () => {
    mockDb.withTransaction = jest.fn().mockRejectedValue(new Error('connection refused'));
    const csv = 'name,price,quantity\nTomatoes,2.5,100\n';
    const res = await csvUpload(csv);
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('db_error');
  });

  it('returns 400 for >500 rows without calling withTransaction', async () => {
    const rows = ['name,price,quantity'];
    for (let i = 0; i < 501; i++) rows.push(`Product ${i},1.0,10`);
    const res = await csvUpload(rows.join('\n'));
    expect(res.status).toBe(400);
    expect(mockDb.withTransaction).not.toHaveBeenCalled();
  });

  it('skips rows with bad price and reports them', async () => {
    const csv = 'name,price,quantity\nValid,2.5,100\nBadPrice,notanumber,10\n';
    const res = await csvUpload(csv);
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(1);
    expect(res.body.skipped).toBe(1);
    expect(res.body.errors[0].error).toContain('price');
  });
});
