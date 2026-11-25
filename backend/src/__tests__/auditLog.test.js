const { writeAuditLog } = require('../utils/auditLog');
const db = require('../db/schema');
const logger = require('../logger');

jest.mock('../db/schema', () => ({
  query: jest.fn(),
}));

jest.mock('../logger', () => ({
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

describe('writeAuditLog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.query.mockResolvedValue({ rows: [] });
  });

  it('coerces a numeric targetId to a string and JSON-encodes object snapshots', async () => {
    await writeAuditLog({
      adminId: 7,
      action: 'update',
      targetType: 'batch',
      targetId: 42,
      before: { status: 'pending' },
      after: { status: 'approved' },
    });

    expect(db.query).toHaveBeenCalledTimes(1);
    const params = db.query.mock.calls[0][1];
    expect(params).toEqual([
      7,
      'update',
      'batch',
      '42',
      JSON.stringify({ status: 'pending' }),
      JSON.stringify({ status: 'approved' }),
    ]);
  });

  it('passes null targetId and null before/after as SQL null', async () => {
    await writeAuditLog({
      adminId: 1,
      action: 'delete',
      targetType: 'user',
      targetId: null,
      before: null,
      after: null,
    });

    expect(db.query).toHaveBeenCalledTimes(1);
    const params = db.query.mock.calls[0][1];
    expect(params).toEqual([1, 'delete', 'user', null, null, null]);
    expect(params[3]).toBeNull();
    expect(params[4]).toBeNull();
    expect(params[5]).toBeNull();
  });

  it('passes null before/after when omitted', async () => {
    await writeAuditLog({
      adminId: 2,
      action: 'create',
      targetType: 'batch',
      targetId: 'abc',
    });

    const params = db.query.mock.calls[0][1];
    expect(params).toEqual([2, 'create', 'batch', 'abc', null, null]);
  });

  it('resolves without throwing and logs when db.query rejects', async () => {
    db.query.mockRejectedValue(new Error('boom'));

    await expect(
      writeAuditLog({
        adminId: 3,
        action: 'update',
        targetType: 'batch',
        targetId: 9,
        before: { a: 1 },
        after: { a: 2 },
      })
    ).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledTimes(1);
    const message = logger.error.mock.calls[0][0];
    expect(String(message)).toContain('[audit]');
  });
});
