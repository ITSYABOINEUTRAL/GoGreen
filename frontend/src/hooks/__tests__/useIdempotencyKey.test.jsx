import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

let keyCounter = 0;
vi.mock('../../api/client', () => ({
  newIdempotencyKey: () => `test-key-${++keyCounter}`,
}));

import { useIdempotencyKey } from '../useIdempotencyKey';

describe('useIdempotencyKey', () => {
  beforeEach(() => {
    keyCounter = 0;
  });

  const inputs = { product_id: 1, quantity: 2 };

  it('returns the same key for identical inputs', () => {
    const { result } = renderHook(() => useIdempotencyKey());
    let a;
    let b;
    act(() => {
      a = result.current.keyFor(inputs);
      b = result.current.keyFor({ ...inputs });
    });
    expect(a).toBe(b);
  });

  it('returns a new key when inputs change', () => {
    const { result } = renderHook(() => useIdempotencyKey());
    let first;
    let second;
    act(() => {
      first = result.current.keyFor(inputs);
      second = result.current.keyFor({ ...inputs, quantity: 3 });
    });
    expect(second).not.toBe(first);
  });

  it('reset() mints a new key for the same inputs', () => {
    const { result } = renderHook(() => useIdempotencyKey());
    let first;
    let second;
    act(() => {
      first = result.current.keyFor(inputs);
      result.current.reset();
      second = result.current.keyFor(inputs);
    });
    expect(second).not.toBe(first);
  });

  it('settle() with no error resets the key', () => {
    const { result } = renderHook(() => useIdempotencyKey());
    let first;
    let second;
    act(() => {
      first = result.current.keyFor(inputs);
      result.current.settle();
      second = result.current.keyFor(inputs);
    });
    expect(second).not.toBe(first);
  });

  it('settle() with a 4xx error resets the key', () => {
    const { result } = renderHook(() => useIdempotencyKey());
    let first;
    let second;
    act(() => {
      first = result.current.keyFor(inputs);
      result.current.settle(Object.assign(new Error('bad request'), { status: 400 }));
      second = result.current.keyFor(inputs);
    });
    expect(second).not.toBe(first);
  });

  it('settle() with a 5xx error preserves the key', () => {
    const { result } = renderHook(() => useIdempotencyKey());
    let first;
    let second;
    act(() => {
      first = result.current.keyFor(inputs);
      result.current.settle(Object.assign(new Error('server error'), { status: 503 }));
      second = result.current.keyFor(inputs);
    });
    expect(second).toBe(first);
  });

  it('settle() with an error without status preserves the key', () => {
    const { result } = renderHook(() => useIdempotencyKey());
    let first;
    let second;
    act(() => {
      first = result.current.keyFor(inputs);
      result.current.settle(new TypeError('Failed to fetch'));
      second = result.current.keyFor(inputs);
    });
    expect(second).toBe(first);
  });
});