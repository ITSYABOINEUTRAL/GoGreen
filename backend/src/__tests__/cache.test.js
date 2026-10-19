'use strict';

// The global jest.setup.js mocks '../src/cache' for all tests.
// We need the real module here, so unmock it before requiring.
jest.unmock('../cache');

const mockSet = jest.fn().mockResolvedValue('OK');
const mockGet = jest.fn().mockResolvedValue(null);
const mockDel = jest.fn().mockResolvedValue(1);
const mockConnect = jest.fn().mockResolvedValue(undefined);
const mockOn = jest.fn();

// Must be prefixed 'mock' so Jest allows it inside the mock factory
let mockRedisStatus = 'ready';

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    get status() { return mockRedisStatus; },
    on: mockOn,
    connect: mockConnect,
    get: mockGet,
    set: mockSet,
    del: mockDel,
  }));
});

let cache;

beforeAll(() => {
  process.env.REDIS_URL = 'redis://localhost:6379';
  jest.resetModules();
  // After resetModules, re-apply the unmock so the real module loads
  jest.unmock('../cache');
  cache = require('../cache');
});

afterAll(() => {
  delete process.env.REDIS_URL;
});

beforeEach(() => {
  jest.clearAllMocks();
  mockRedisStatus = 'ready';
  mockSet.mockResolvedValue('OK');
  mockGet.mockResolvedValue(null);
});

describe('cache module', () => {
  describe('isReady', () => {
    it('returns true when client status is ready', () => {
      mockRedisStatus = 'ready';
      expect(cache.isReady()).toBe(true);
    });

    it('returns false when client status is not ready', () => {
      mockRedisStatus = 'connecting';
      expect(cache.isReady()).toBe(false);
    });
  });

  describe('set', () => {
    it('uses DEFAULT_TTL_SECONDS when no TTL argument is provided', async () => {
      await cache.set('mykey', { foo: 'bar' });
      expect(mockSet).toHaveBeenCalledWith(
        'mykey',
        JSON.stringify({ foo: 'bar' }),
        'EX',
        cache.DEFAULT_TTL_SECONDS
      );
    });

    it('uses DEFAULT_TTL_SECONDS when undefined TTL is passed', async () => {
      await cache.set('mykey', 'val', undefined);
      expect(mockSet).toHaveBeenCalledWith(
        'mykey',
        JSON.stringify('val'),
        'EX',
        cache.DEFAULT_TTL_SECONDS
      );
    });

    it('passes explicit positive TTL through', async () => {
      await cache.set('mykey', 'val', 60);
      expect(mockSet).toHaveBeenCalledWith(
        'mykey',
        JSON.stringify('val'),
        'EX',
        60
      );
    });

    it('does nothing when client is not ready', async () => {
      mockRedisStatus = 'connecting';
      await cache.set('mykey', 'val', 60);
      expect(mockSet).not.toHaveBeenCalled();
    });
  });

  describe('get', () => {
    it('returns null when client is not ready', async () => {
      mockRedisStatus = 'connecting';
      const result = await cache.get('mykey');
      expect(result).toBeNull();
    });

    it('returns parsed value on cache hit', async () => {
      mockGet.mockResolvedValueOnce(JSON.stringify({ data: 42 }));
      const result = await cache.get('mykey');
      expect(result).toEqual({ data: 42 });
    });

    it('returns null on cache miss', async () => {
      mockGet.mockResolvedValueOnce(null);
      const result = await cache.get('mykey');
      expect(result).toBeNull();
    });
  });
});
