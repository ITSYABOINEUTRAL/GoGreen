const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../services/WaitlistService', () => jest.fn());

const WaitlistService = require('../services/WaitlistService');
const db = require('../db/schema');
const productExtrasRoutes = require('../routes/productExtras');
const waitlistRoutes = require('../routes/waitlist');

const buyerToken = jwt.sign({ id: 1, role: 'buyer' }, process.env.JWT_SECRET);
const farmerToken = jwt.sign({ id: 2, role: 'farmer' }, process.env.JWT_SECRET);
const entries = [
  {
    id: 1,
    buyer_id: 1,
    product_id: 123,
    quantity: 2,
    position: 1,
    created_at: '2024-01-01T10:00:00Z',
    product_name: 'Organic Tomatoes',
    product_price: 5.99,
    product_stock: 0,
  },
  {
    id: 2,
    buyer_id: 1,
    product_id: 456,
    quantity: 1,
    position: 3,
    created_at: '2024-01-02T11:00:00Z',
    product_name: 'Fresh Carrots',
    product_price: 3.5,
    product_stock: 0,
  },
];

describe('waitlist status and mine endpoints', () => {
  let mockWaitlistService;

  beforeEach(() => {
    jest.clearAllMocks();
    db.query.mockResolvedValue({ rows: [{ active: 1 }], rowCount: 1 });
    mockWaitlistService = {
      getWaitlistStatus: jest.fn(),
      getBuyerWaitlistEntries: jest.fn(),
    };
    WaitlistService.mockImplementation(() => mockWaitlistService);
  });

  const createApp = () => {
    const app = express();
    app.use(express.json());
    app.use('/api/products', productExtrasRoutes);
    app.use('/api/waitlist', waitlistRoutes);
    return app;
  };

  it('returns waitlist status when the buyer is on the waitlist', async () => {
    mockWaitlistService.getWaitlistStatus.mockResolvedValue({
      success: true,
      onWaitlist: true,
      position: 2,
      totalWaiting: 5,
      code: 'ON_WAITLIST',
    });

    const response = await request(createApp())
      .get('/api/products/123/waitlist/status')
      .set('Authorization', `Bearer ${buyerToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      onWaitlist: true,
      position: 2,
      totalWaiting: 5,
    });
    expect(mockWaitlistService.getWaitlistStatus).toHaveBeenCalledWith(1, 123);
  });

  it('returns waitlist status when the buyer is not on the waitlist', async () => {
    mockWaitlistService.getWaitlistStatus.mockResolvedValue({
      success: true,
      onWaitlist: false,
      totalWaiting: 5,
      code: 'NOT_ON_WAITLIST',
    });

    const response = await request(createApp())
      .get('/api/products/123/waitlist/status')
      .set('Authorization', `Bearer ${buyerToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      onWaitlist: false,
      totalWaiting: 5,
    });
    expect(mockWaitlistService.getWaitlistStatus).toHaveBeenCalledWith(1, 123);
  });

  it('denies farmers access to waitlist status', async () => {
    const response = await request(createApp())
      .get('/api/products/123/waitlist/status')
      .set('Authorization', `Bearer ${farmerToken}`);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      success: false,
      error: 'forbidden',
      message: 'Only buyers can check waitlist status',
      code: 'forbidden',
    });
    expect(mockWaitlistService.getWaitlistStatus).not.toHaveBeenCalled();
  });

  it('returns the buyer waitlist entries', async () => {
    mockWaitlistService.getBuyerWaitlistEntries.mockResolvedValue({
      success: true,
      data: entries,
      count: 2,
      code: 'SUCCESS',
    });

    const response = await request(createApp())
      .get('/api/waitlist/mine')
      .set('Authorization', `Bearer ${buyerToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: entries, count: 2 });
    expect(mockWaitlistService.getBuyerWaitlistEntries).toHaveBeenCalledWith(1);
  });

  it('returns an empty list when the buyer has no waitlist entries', async () => {
    mockWaitlistService.getBuyerWaitlistEntries.mockResolvedValue({
      success: true,
      data: [],
      count: 0,
      code: 'SUCCESS',
    });

    const response = await request(createApp())
      .get('/api/waitlist/mine')
      .set('Authorization', `Bearer ${buyerToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: [], count: 0 });
    expect(mockWaitlistService.getBuyerWaitlistEntries).toHaveBeenCalledWith(1);
  });

  it('denies farmers access to their waitlist entries', async () => {
    const response = await request(createApp())
      .get('/api/waitlist/mine')
      .set('Authorization', `Bearer ${farmerToken}`);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      success: false,
      error: 'forbidden',
      message: 'Only buyers can view waitlist entries',
      code: 'forbidden',
    });
    expect(mockWaitlistService.getBuyerWaitlistEntries).not.toHaveBeenCalled();
  });
});