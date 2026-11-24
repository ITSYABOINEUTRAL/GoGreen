/**
 * Tests for backend/src/utils/realtime.js
 *
 * Uses jest.resetModules() + jest.doMock('ioredis', ...) to isolate each case.
 */

// Helper: flush micro-task queue so .catch() callbacks run.
const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

describe('realtime pub/sub', () => {
  let origRedisUrl;

  beforeEach(() => {
    origRedisUrl = process.env.REDIS_URL;
    delete process.env.REDIS_URL;
    jest.resetModules();
  });

  afterEach(() => {
    if (origRedisUrl !== undefined) {
      process.env.REDIS_URL = origRedisUrl;
    } else {
      delete process.env.REDIS_URL;
    }
    jest.resetModules();
  });

  describe('in-memory mode (no REDIS_URL)', () => {
    it('publish delivers synchronously to a local subscriber', () => {
      const realtime = require('../utils/realtime');
      const received = [];
      realtime.subscribe('test-channel', (event, data) => received.push({ event, data }));

      realtime.publish('test-channel', 'my_event', { value: 42 });

      expect(received).toHaveLength(1);
      expect(received[0]).toEqual({ event: 'my_event', data: { value: 42 } });
    });

    it('subscribe returns an unsubscribe function that stops delivery', () => {
      const realtime = require('../utils/realtime');
      const received = [];
      const unsubscribe = realtime.subscribe('unsub-channel', (event, data) =>
        received.push({ event, data })
      );

      realtime.publish('unsub-channel', 'first', {});
      unsubscribe();
      realtime.publish('unsub-channel', 'second', {});

      expect(received).toHaveLength(1);
      expect(received[0].event).toBe('first');
    });

    it('publish does not throw when there are no subscribers', () => {
      const realtime = require('../utils/realtime');
      expect(() => realtime.publish('no-listeners', 'event', {})).not.toThrow();
    });
  });

  describe('Redis mode — rejected publish falls back to local delivery', () => {
    it('delivers locally when publisher.publish rejects', async () => {
      const mockPublisher = {
        publish: jest.fn().mockReturnValue(Promise.reject(new Error('redis down'))),
      };
      const mockSubscriber = {
        on: jest.fn(),
        psubscribe: jest.fn().mockResolvedValue(undefined),
      };
      let ioredisCallCount = 0;
      jest.doMock('ioredis', () =>
        jest.fn().mockImplementation(() => {
          ioredisCallCount++;
          return ioredisCallCount === 1 ? mockPublisher : mockSubscriber;
        })
      );

      process.env.REDIS_URL = 'redis://localhost:6379';
      const realtime = require('../utils/realtime');

      const received = [];
      realtime.subscribe('fallback-channel', (event, data) => received.push({ event, data }));
      realtime.publish('fallback-channel', 'test_event', { x: 1 });

      // Let the rejected promise's .catch() run.
      await flushPromises();

      expect(received).toHaveLength(1);
      expect(received[0]).toEqual({ event: 'test_event', data: { x: 1 } });
    });
  });

  describe('ioredis not installed', () => {
    it('stays in in-memory mode without throwing', () => {
      jest.doMock('ioredis', () => {
        throw new Error('Cannot find module ioredis');
      });

      process.env.REDIS_URL = 'redis://localhost:6379';
      expect(() => require('../utils/realtime')).not.toThrow();

      const realtime = require('../utils/realtime');
      const received = [];
      realtime.subscribe('inmem-fallback', (e, d) => received.push({ e, d }));
      realtime.publish('inmem-fallback', 'ping', {});
      expect(received).toHaveLength(1);
    });
  });
});
