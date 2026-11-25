'use strict';

/**
 * Tests for _waitForRpc and _withTimeout in the Soroban sandbox helper.
 * Issue #248 — no Docker required; uses jest.useFakeTimers() for deadline tests.
 */

const { sorobanServer, _waitForRpc, _withTimeout } = require('./helpers/soroban');

// ---------------------------------------------------------------------------
// _withTimeout
// ---------------------------------------------------------------------------
describe('_withTimeout', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('resolves with the value when the promise settles before the deadline', async () => {
    const result = await _withTimeout(Promise.resolve('ok'), 1_000);
    expect(result).toBe('ok');
  });

  it('rejects with "timed out" when the promise never settles', async () => {
    const never = new Promise(() => {});
    const race = _withTimeout(never, 500);

    jest.runAllTimers();

    await expect(race).rejects.toThrow('timed out');
  });

  it('rejects with the original error when the wrapped promise rejects before the deadline', async () => {
    const boom = Promise.reject(new Error('original error'));
    await expect(_withTimeout(boom, 1_000)).rejects.toThrow('original error');
  });
});

// ---------------------------------------------------------------------------
// _waitForRpc
// ---------------------------------------------------------------------------
describe('_waitForRpc', () => {
  let getLatestLedgerSpy;

  beforeEach(() => {
    getLatestLedgerSpy = jest.spyOn(sorobanServer, 'getLatestLedger');
  });

  afterEach(() => {
    getLatestLedgerSpy.mockRestore();
    jest.useRealTimers();
  });

  it('resolves once getLatestLedger eventually succeeds', async () => {
    // Fail twice, then succeed.
    getLatestLedgerSpy
      .mockRejectedValueOnce(new Error('not ready yet'))
      .mockRejectedValueOnce(new Error('still not ready'))
      .mockResolvedValueOnce({ sequence: 1 });

    // Use real timers; the retry delay is capped at 1 s but the timeout is generous.
    // We replace setTimeout inside the helper to skip waiting.
    jest.useFakeTimers();

    const waitPromise = _waitForRpc(10_000);

    // Drain microtasks and advance timers to skip retry sleeps.
    for (let i = 0; i < 5; i++) {
      await Promise.resolve();
      jest.runAllTimers();
    }

    await expect(waitPromise).resolves.toBeUndefined();
  });

  it('rejects with "did not become ready within" when the deadline elapses', async () => {
    // Always fail so the loop runs until the deadline.
    getLatestLedgerSpy.mockRejectedValue(new Error('connection refused'));

    jest.useFakeTimers();

    const timeoutMs = 3_000;
    const waitPromise = _waitForRpc(timeoutMs);

    // Advance time past the deadline to make Date.now() return a value after deadline.
    jest.advanceTimersByTime(timeoutMs + 100);
    // Run any pending timers (retry sleeps) so the loop can exit.
    jest.runAllTimers();
    // Drain remaining microtasks.
    await Promise.resolve();
    await Promise.resolve();

    await expect(waitPromise).rejects.toThrow('did not become ready within');
  });
});
