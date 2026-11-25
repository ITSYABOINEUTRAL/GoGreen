'use strict';

jest.mock('../logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const logger = require('../logger');
const { fireOrderWebhook, MAX_RETRIES } = require('../services/webhookService');

function mockDb({ farmerResult, insertImpl }) {
  const insert = jest.fn(insertImpl);
  const first = jest.fn().mockImplementation(() => farmerResult);
  const where = jest.fn().mockReturnValue({ first });
  const db = jest.fn((table) => {
    if (table === 'farmers') return { where };
    if (table === 'webhook_deliveries') return { insert };
    throw new Error(`unexpected table ${table}`);
  });
  return { db, insert, where, first };
}

describe('fireOrderWebhook', () => {
  const order = {
    id: 42,
    status: 'paid',
    buyer_id: 1,
    farmer_id: 7,
    total_amount: 10,
    currency: 'USD',
    updated_at: '2026-01-01T00:00:00.000Z',
  };

  const farmer = {
    id: 7,
    webhook_url: 'https://example.com/hook',
    webhook_secret: 'secret',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(global, 'setTimeout').mockImplementation((fn) => {
      fn();
      return 0;
    });
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'fail',
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('resolves and keeps retrying when webhook_deliveries insert throws', async () => {
    const { db, insert } = mockDb({
      farmerResult: Promise.resolve(farmer),
      insertImpl: () => Promise.reject(new Error('insert failed')),
    });

    await expect(fireOrderWebhook(db, 'order.paid', order)).resolves.toBeUndefined();

    expect(global.fetch).toHaveBeenCalledTimes(MAX_RETRIES);
    expect(insert).toHaveBeenCalledTimes(MAX_RETRIES);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to record delivery attempt'),
      expect.objectContaining({ error: 'insert failed' })
    );
  });

  it('logs and returns when farmer lookup rejects', async () => {
    const first = jest.fn().mockRejectedValue(new Error('db down'));
    const where = jest.fn().mockReturnValue({ first });
    const db = jest.fn((table) => {
      if (table === 'farmers') return { where };
      throw new Error(`unexpected table ${table}`);
    });

    await expect(fireOrderWebhook(db, 'order.paid', order)).resolves.toBeUndefined();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Farmer lookup failed'),
      expect.objectContaining({ error: 'db down' })
    );
  });
});
