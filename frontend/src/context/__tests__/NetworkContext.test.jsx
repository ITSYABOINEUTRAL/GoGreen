import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NetworkProvider, useNetwork } from '../NetworkContext';

vi.mock('../../api/client', () => ({
  api: { getNetwork: vi.fn() },
}));

import { api } from '../../api/client';

const wrapper = ({ children }) => <NetworkProvider>{children}</NetworkProvider>;

describe('NetworkContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets loading=true before the request resolves and loading=false after', async () => {
    let resolve;
    api.getNetwork.mockReturnValue(new Promise(r => { resolve = r; }));

    const { result } = renderHook(() => useNetwork(), { wrapper });
    expect(result.current.loading).toBe(true);

    await act(async () => { resolve({ network: 'testnet' }); });
    expect(result.current.loading).toBe(false);
    expect(result.current.network).toBe('testnet');
  });

  it('populates error and keeps network null when api.getNetwork rejects', async () => {
    const boom = new Error('network error');
    api.getNetwork.mockRejectedValue(boom);

    const { result } = renderHook(() => useNetwork(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe(boom);
    expect(result.current.network).toBeNull();
  });

  it('clears error and sets network on a successful refresh() after failure', async () => {
    const boom = new Error('first failure');
    api.getNetwork
      .mockRejectedValueOnce(boom)
      .mockResolvedValueOnce({ network: 'mainnet' });

    const { result } = renderHook(() => useNetwork(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(boom);

    await act(async () => { result.current.refresh(); });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeNull();
    expect(result.current.network).toBe('mainnet');
  });

  it('explorerUrl returns null when network is null', async () => {
    api.getNetwork.mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useNetwork(), { wrapper });
    expect(result.current.explorerUrl('tx', 'abc123')).toBeNull();
  });

  it('explorerUrl returns a testnet URL when network is testnet', async () => {
    api.getNetwork.mockResolvedValue({ network: 'testnet' });
    const { result } = renderHook(() => useNetwork(), { wrapper });
    await waitFor(() => expect(result.current.network).toBe('testnet'));
    expect(result.current.explorerUrl('tx', 'abc123')).toContain('testnet');
  });

  it('explorerUrl returns a mainnet URL when network is mainnet', async () => {
    api.getNetwork.mockResolvedValue({ network: 'mainnet' });
    const { result } = renderHook(() => useNetwork(), { wrapper });
    await waitFor(() => expect(result.current.network).toBe('mainnet'));
    expect(result.current.explorerUrl('tx', 'abc123')).toContain('public');
  });
});
