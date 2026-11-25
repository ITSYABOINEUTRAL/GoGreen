const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const mockDb = require('../db/schema');
const analyticsRouter = require('../routes/analytics');

const SECRET = process.env.JWT_SECRET || 'test-secret-for-jest';
const farmerToken = jwt.sign({ id: 1, role: 'farmer' }, SECRET);
const buyerToken = jwt.sign({ id: 2, role: 'buyer' }, SECRET);

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/analytics', analyticsRouter);
  return app;
}

describe('analytics routes (#282)', () => {
  let app;

  beforeEach(() => {
    app = buildApp();
    mockDb.query.mockReset();
    mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  describe('GET /api/analytics/farmer', () => {
    it('returns 403 for a non-farmer role', async () => {
      const res = await request(app)
        .get('/api/analytics/farmer')
        .set('Authorization', `Bearer ${buyerToken}`);
      expect(res.status).toBe(403);
    });

    it('returns success with totals and monthly data for a farmer', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ order_count: '5', total_revenue: '500.00' }] })
        .mockResolvedValueOnce({ rows: [{ name: 'Tomatoes', revenue: '300', orders: '3' }] })
        .mockResolvedValueOnce({ rows: [{ month: '2026-05', revenue: '300', orders: '3' }] });

      const res = await request(app)
        .get('/api/analytics/farmer')
        .set('Authorization', `Bearer ${farmerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('total_revenue');
      expect(res.body.data).toHaveProperty('monthly');
      expect(res.body.data).toHaveProperty('top_products');
    });

    it('uses dialect-specific SQL for the monthly bucket', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });
      await request(app)
        .get('/api/analytics/farmer')
        .set('Authorization', `Bearer ${farmerToken}`);

      const monthlyCall = mockDb.query.mock.calls[2];
      const sql = monthlyCall[0];
      if (mockDb.isPostgres) {
        expect(sql).toMatch(/TO_CHAR/);
      } else {
        expect(sql).toMatch(/strftime/);
      }
    });
  });

  describe('GET /api/analytics/farmer/waitlist', () => {
    it('returns 403 for a non-farmer role', async () => {
      const res = await request(app)
        .get('/api/analytics/farmer/waitlist')
        .set('Authorization', `Bearer ${buyerToken}`);
      expect(res.status).toBe(403);
    });

    it('returns analytics shape for a farmer with data', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ product_id: 1, product_name: 'Carrots', queue_length: '3' }] })
        .mockResolvedValueOnce({ rows: [{ product_id: 1, avg_wait_hours: '12.5' }] })
        .mockResolvedValueOnce({ rows: [{ product_id: 1, total_joins: '10', converted: '3' }] });

      const res = await request(app)
        .get('/api/analytics/farmer/waitlist')
        .set('Authorization', `Bearer ${farmerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const item = res.body.data[0];
      expect(item).toHaveProperty('product_id', 1);
      expect(item).toHaveProperty('avg_wait_hours', 12.5);
      expect(item).toHaveProperty('conversion_rate', 30.0);
      expect(item).toHaveProperty('alert', false);
    });

    it('handles null avg_wait_hours gracefully', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ product_id: 2, product_name: 'Peas', queue_length: '1' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ product_id: 2, total_joins: '1', converted: '0' }] });

      const res = await request(app)
        .get('/api/analytics/farmer/waitlist')
        .set('Authorization', `Bearer ${farmerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data[0].avg_wait_hours).toBeNull();
    });

    it('sets alert: true when queue_length exceeds ALERT_THRESHOLD (10)', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ product_id: 3, product_name: 'Beans', queue_length: '15' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ product_id: 3, total_joins: '15', converted: '2' }] });

      const res = await request(app)
        .get('/api/analytics/farmer/waitlist')
        .set('Authorization', `Bearer ${farmerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data[0].alert).toBe(true);
    });

    it('uses dialect-specific wait-time SQL', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });
      await request(app)
        .get('/api/analytics/farmer/waitlist')
        .set('Authorization', `Bearer ${farmerToken}`);

      const waitCall = mockDb.query.mock.calls[1];
      const sql = waitCall[0];
      if (mockDb.isPostgres) {
        expect(sql).toMatch(/EXTRACT/);
      } else {
        expect(sql).toMatch(/julianday/);
      }
    });
  });
});
