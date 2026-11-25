import { renderHook, act, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

vi.mock('../api/client', () => ({
  api: {
    getMarketRate: vi.fn(),
  },
}));

import { api } from '../api/client';
import { useXlmRate } from '../utils/useXlmRate';

describe('useXlmRate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the parsed numeric rate on a successful fetch', async () => {
    api.getMarketRate.mockResolvedValueOnce({ midPrice: 0.12 });

    const { result } = renderHook(() => useXlmRate());

    await waitFor(() => expect(result.current.rate).toBe(0.12));
  });

  it('falls back to null (does not throw) when the request rejects', async () => {
    api.getMarketRate.mockRejectedValueOnce(new Error('network error'));

    const { result } = renderHook(() => useXlmRate());

    // Wait for effect to run
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.rate).toBeNull();
  });

  it('falls back to null when midPrice is missing/non-numeric', async () => {
    api.getMarketRate.mockResolvedValueOnce({ midPrice: undefined });

    const { result } = renderHook(() => useXlmRate());

    await waitFor(() => {
      expect(api.getMarketRate).toHaveBeenCalled();
    });

    expect(result.current.rate).toBeNull();
  });

  it('usd() returns null when rate is not yet set', () => {
    api.getMarketRate.mockReturnValue(new Promise(() => {})); // never resolves

    const { result } = renderHook(() => useXlmRate());

    expect(result.current.usd(100)).toBeNull();
  });

  it('usd() returns formatted string when rate is available', async () => {
    api.getMarketRate.mockResolvedValueOnce({ midPrice: 0.1 });

    const { result } = renderHook(() => useXlmRate());

    await waitFor(() => expect(result.current.rate).toBe(0.1));

    expect(result.current.usd(10)).toBe('≈ $1.00');
  });

  it('does not update state after unmount (no console error)', async () => {
    let resolve;
    api.getMarketRate.mockReturnValueOnce(
      new Promise(r => { resolve = r; })
    );

    const { result, unmount } = renderHook(() => useXlmRate());

    unmount();

    // Resolving after unmount should not cause React state update warning
    await act(async () => {
      resolve({ midPrice: 0.5 });
      await Promise.resolve();
    });

    // Rate should still be null since component was unmounted before resolve
    // (The hook clears the interval on cleanup; the catch swallows errors)
    expect(result.current.rate).toBeNull();
  });
});
