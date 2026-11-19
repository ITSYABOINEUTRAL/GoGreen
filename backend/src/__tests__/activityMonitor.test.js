'use strict';

jest.mock('../db/schema', () => ({ query: jest.fn() }));
jest.mock('../utils/stellar', () => ({
  server: { payments: jest.fn(), transactions: jest.fn() },
}));
jest.mock('../logger', () => ({
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
}));

const db = require('../db/schema');
const { server } = require('../utils/stellar');
const logger = require('../logger');
const { checkUser, runWithConcurrency } = require('../jobs/activityMonitor');

function chainCall(result) {
  return {
    forAccount: () => ({
      order: () => ({
        limit: () => ({
          call: jest.fn().mockResolvedValue(result),
        }),
      }),
    }),
  };
}

describe('activityMonitor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('inserts a large_payment alert once and de-duplicates on later runs', async () => {
    const payment = {
      type: 'payment',
      asset_type: 'native',
      from: 'GUSER',
      amount: '150.00',
      transaction_hash: 'txhash-large',
    };

    server.payments.mockReturnValue(chainCall({ records: [payment] }));
    server.transactions.mockReturnValue(chainCall({ records: [] }));

    db.query
      .mockResolvedValueOnce({ rows: [] }) // no existing large_payment
      .mockResolvedValueOnce({ rows: [] }); // insert

    await checkUser(1, 'GUSER');
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO account_alerts'),
      expect.arrayContaining([1, 'large_payment', expect.stringContaining('txhash-large')])
    );

    const insertCalls = db.query.mock.calls.filter((c) =>
      String(c[0]).includes('INSERT INTO account_alerts')
    ).length;

    server.payments.mockReturnValue(chainCall({ records: [payment] }));
    server.transactions.mockReturnValue(chainCall({ records: [] }));
    db.query.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // existing alert

    await checkUser(1, 'GUSER');
    const insertCallsAfter = db.query.mock.calls.filter((c) =>
      String(c[0]).includes('INSERT INTO account_alerts')
    ).length;
    expect(insertCallsAfter).toBe(insertCalls);
  });

  it('inserts failed_transactions alert at threshold 3, not at 2', async () => {
    const now = Date.now();
    const failed = (i) => ({
      successful: false,
      created_at: new Date(now - 1000 * i).toISOString(),
    });

    server.payments.mockReturnValue(chainCall({ records: [] }));

    // 2 failures — no insert
    server.transactions.mockReturnValue(
      chainCall({ records: [failed(1), failed(2)] })
    );
    await checkUser(2, 'GUSER');
    expect(
      db.query.mock.calls.some((c) => String(c[0]).includes('INSERT INTO account_alerts'))
    ).toBe(false);

    jest.clearAllMocks();
    server.payments.mockReturnValue(chainCall({ records: [] }));
    server.transactions.mockReturnValue(
      chainCall({ records: [failed(1), failed(2), failed(3)] })
    );
    db.query
      .mockResolvedValueOnce({ rows: [] }) // no existing failed_transactions
      .mockResolvedValueOnce({ rows: [] }); // insert

    await checkUser(2, 'GUSER');
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO account_alerts'),
      expect.arrayContaining([2, 'failed_transactions', expect.stringContaining('3 failed')])
    );
  });

  it('runWithConcurrency processes every item exactly once', async () => {
    const seen = [];
    const items = ['a', 'b', 'c', 'd', 'e'];
    await runWithConcurrency(
      items,
      async (item) => {
        seen.push(item);
      },
      2
    );
    expect(seen.sort()).toEqual(items.slice().sort());
    expect(seen).toHaveLength(items.length);
  });

  it('does not reject checkUser on Horizon 429', async () => {
    const call = jest.fn().mockRejectedValue({
      status: 429,
      message: 'Too many requests',
      response: { headers: { 'retry-after': '5' } },
    });
    server.payments.mockReturnValue({
      forAccount: () => ({ order: () => ({ limit: () => ({ call }) }) }),
    });

    await expect(checkUser(9, 'GABC')).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      '[activityMonitor] Horizon rate limit reached',
      expect.objectContaining({ userId: 9, publicKey: 'GABC' })
    );
  });
});
