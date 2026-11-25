/**
 * Tests for SSE auth middleware: connection cap eviction, cleanup bookkeeping,
 * and stream-token scope enforcement.
 */

const { EventEmitter } = require('events');

jest.mock('jsonwebtoken');
jest.mock('../models/User');

const jwt = require('jsonwebtoken');
const User = require('../models/User');

const {
  sseAuth,
  registerSseConnection,
  MAX_SSE_CONNECTIONS_PER_USER,
} = require('../middleware/sseAuth');

function makeRes() {
  const emitter = new EventEmitter();
  return {
    end: jest.fn(),
    on: emitter.on.bind(emitter),
    emit: emitter.emit.bind(emitter),
  };
}

function makeReq(token) {
  return { query: { token } };
}

function makeNext() {
  return jest.fn();
}

describe('registerSseConnection', () => {
  test('closes the oldest connection when the cap is exceeded', () => {
    const responses = [];
    for (let i = 0; i < MAX_SSE_CONNECTIONS_PER_USER + 1; i += 1) {
      responses.push(makeRes());
    }

    const cleanups = responses.map((res) =>
      registerSseConnection('user-cap', res)
    );

    expect(responses[0].end).toHaveBeenCalledTimes(1);
    expect(responses[1].end).not.toHaveBeenCalled();

    // Retained count equals the cap: closing the oldest leaves cap entries.
    const retained = responses.slice(1);
    expect(retained).toHaveLength(MAX_SSE_CONNECTIONS_PER_USER);

    cleanups.forEach((cleanup) => cleanup());
  });

  test('cleanup removes the entry and deletes the map key when empty', () => {
    const res = makeRes();
    const cleanup = registerSseConnection('user-cleanup', res);

    cleanup();

    // Registering again should not evict anything (map key was deleted).
    const res2 = makeRes();
    const cleanup2 = registerSseConnection('user-cleanup', res2);
    expect(res2.end).not.toHaveBeenCalled();

    cleanup2();
  });

  test('cleanup is idempotent and does not throw when called twice', () => {
    const res = makeRes();
    const cleanup = registerSseConnection('user-idempotent', res);

    expect(() => {
      cleanup();
      cleanup();
    }).not.toThrow();
  });
});

describe('sseAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns 401 when token is missing', async () => {
    const req = makeReq(undefined);
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = makeNext();

    await sseAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 when token verification throws (invalid/expired)', async () => {
    jwt.verify.mockImplementation(() => {
      throw new Error('invalid token');
    });

    const req = makeReq('bad-token');
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = makeNext();

    await sseAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 403 when token scope is not stream', async () => {
    jwt.verify.mockReturnValue({ id: 'u1', scope: 'full' });

    const req = makeReq('full-token');
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = makeNext();

    await sseAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 when user is not found', async () => {
    jwt.verify.mockReturnValue({ id: 'u1', scope: 'stream' });
    User.findById.mockResolvedValue(null);

    const req = makeReq('stream-token');
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = makeNext();

    await sseAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 403 when user is banned', async () => {
    jwt.verify.mockReturnValue({ id: 'u1', scope: 'stream' });
    User.findById.mockResolvedValue({ _id: 'u1', banned: true, active: true });

    const req = makeReq('stream-token');
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = makeNext();

    await sseAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 403 when user is inactive', async () => {
    jwt.verify.mockReturnValue({ id: 'u1', scope: 'stream' });
    User.findById.mockResolvedValue({ _id: 'u1', banned: false, active: false });

    const req = makeReq('stream-token');
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = makeNext();

    await sseAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 500 when User.findById throws', async () => {
    jwt.verify.mockReturnValue({ id: 'u1', scope: 'stream' });
    User.findById.mockRejectedValue(new Error('db down'));

    const req = makeReq('stream-token');
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = makeNext();

    await sseAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
  });

  test('calls next with req.user set for a valid stream token', async () => {
    const user = { _id: 'u1', banned: false, active: true };
    jwt.verify.mockReturnValue({ id: 'u1', scope: 'stream' });
    User.findById.mockResolvedValue(user);

    const req = makeReq('stream-token');
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = makeNext();

    await sseAuth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
    expect(req.user).toBe(user);
  });
});
