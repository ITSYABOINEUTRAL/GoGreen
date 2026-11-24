/**
 * Tests for routes/reviews.js — review moderation and rating recalculation (#257)
 *
 * Covers: recalcRating writes 0/0 on empty set, approve/reject trigger
 * recalcRating, admin-only 403, missing-review 404, duplicate-review 409,
 * purchase-required 403, and rating bounds 400.
 */

process.env.JWT_SECRET = 'test-secret-for-jest';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const jwt = require('jsonwebtoken');

const mockDb = jest.requireMock('../db/schema');

jest.mock('../routes', () => {
  const express = require('express');
  const router = express.Router();
  const reviews = require('../routes/reviews');
  router.use('/api/reviews', reviews);
  router.use('/api/admin/reviews', reviews.adminRouter);
  return router;
});

const app = require('../app');

const SECRET = process.env.JWT_SECRET;
const adminToken = jwt.sign({ id: 1, role: 'admin' }, SECRET);
const buyerToken = jwt.sign({ id: 2, role: 'buyer' }, SECRET);
const farmerToken = jwt.sign({ id: 3, role: 'farmer' }, SECRET);

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.query = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 });
});

describe('recalcRating — via admin approve/reject', () => {
  it('writes avg=0 and cnt=0 to products when no approved reviews remain', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 10, product_id: 5 }] })  // SELECT review
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })               // UPDATE status
      .mockResolvedValueOnce({ rows: [{ avg: null, cnt: '0' }] })    // SELECT avg/cnt (empty)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });              // UPDATE products

    await request(app)
      .patch('/api/admin/reviews/10/approve')
      .set('Authorization', `Bearer ${adminToken}`);

    const updateCall = mockDb.query.mock.calls.find(
      ([sql]) => sql.includes('UPDATE products SET avg_rating')
    );
    expect(updateCall).toBeDefined();
    expect(updateCall[1][0]).toBe(0); // avg_rating = row.avg || 0
    expect(updateCall[1][1]).toBe(0); // review_count = row.cnt || 0
  });

  it('writes correct avg and cnt when approved reviews exist', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 11, product_id: 7 }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ avg: '4.50', cnt: '3' }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await request(app)
      .patch('/api/admin/reviews/11/approve')
      .set('Authorization', `Bearer ${adminToken}`);

    const updateCall = mockDb.query.mock.calls.find(
      ([sql]) => sql.includes('UPDATE products SET avg_rating')
    );
    expect(updateCall).toBeDefined();
    expect(Number(updateCall[1][0])).toBeCloseTo(4.5);
    expect(Number(updateCall[1][1])).toBe(3);
  });

  it('reject triggers recalcRating and updates products', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 12, product_id: 8 }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ avg: '3.00', cnt: '1' }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const res = await request(app)
      .patch('/api/admin/reviews/12/reject')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const updateCall = mockDb.query.mock.calls.find(
      ([sql]) => sql.includes('UPDATE products SET avg_rating')
    );
    expect(updateCall).toBeDefined();
  });
});

describe('admin-only guards', () => {
  it('returns 403 forbidden when a non-admin tries to approve', async () => {
    const res = await request(app)
      .patch('/api/admin/reviews/1/approve')
      .set('Authorization', `Bearer ${buyerToken}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('forbidden');
  });

  it('returns 403 forbidden when a non-admin tries to reject', async () => {
    const res = await request(app)
      .patch('/api/admin/reviews/1/reject')
      .set('Authorization', `Bearer ${farmerToken}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('forbidden');
  });
});

describe('missing review — 404', () => {
  it('returns 404 not_found when review does not exist on approve', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .patch('/api/admin/reviews/9999/approve')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('not_found');
  });

  it('returns 404 not_found when review does not exist on reject', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .patch('/api/admin/reviews/9999/reject')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('not_found');
  });
});

describe('POST /api/reviews — buyer submit', () => {
  it('returns 403 purchase_required when no paid order exists for the buyer', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ order_id: 1, rating: 4, comment: 'Good' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('purchase_required');
  });

  it('returns 409 duplicate_review when order has already been reviewed', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, product_id: 5 }] })
      .mockResolvedValueOnce({ rows: [{ id: 20 }] });

    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ order_id: 1, rating: 4, comment: 'Good' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('duplicate_review');
  });

  it('returns 400 validation_error when rating is 0', async () => {
    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ order_id: 1, rating: 0 });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('validation_error');
  });

  it('returns 400 validation_error when rating is 6', async () => {
    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ order_id: 1, rating: 6 });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('validation_error');
  });

  it('returns 403 forbidden when a non-buyer tries to submit a review', async () => {
    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${farmerToken}`)
      .send({ order_id: 1, rating: 4 });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('forbidden');
  });

  it('submits successfully for a valid order and rating', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 1, product_id: 5 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 99 }] });

    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ order_id: 1, rating: 5, comment: 'Excellent!' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.id).toBe(99);
  });
});

describe('DELETE /api/reviews/:id — buyer delete triggers recalcRating', () => {
  it('recalcRating resets product rating to 0 when last approved review is deleted', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 5, product_id: 3, buyer_id: 2 }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ avg: null, cnt: '0' }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await request(app)
      .delete('/api/reviews/5')
      .set('Authorization', `Bearer ${buyerToken}`);

    const updateCall = mockDb.query.mock.calls.find(
      ([sql]) => sql.includes('UPDATE products SET avg_rating')
    );
    expect(updateCall).toBeDefined();
    expect(updateCall[1][0]).toBe(0);
    expect(updateCall[1][1]).toBe(0);
  });
});
