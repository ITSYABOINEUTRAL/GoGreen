import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FavoritesProvider, useFavorites } from '../FavoritesContext';

const mockApi = vi.hoisted(() => ({
  getFavorites: vi.fn(),
  addFavorite: vi.fn(),
  removeFavorite: vi.fn(),
}));
vi.mock('../../api/client', () => ({ api: mockApi }));

let mockUser = { id: 'u1', role: 'buyer' };
vi.mock('../AuthContext', () => ({
  useAuth: () => ({ user: mockUser }),
}));

const GUEST_KEY = 'fm_favorites_guest';
const userKey = (id) => `fm_favorites_${id}`;

const wrapper = ({ children }) => <FavoritesProvider>{children}</FavoritesProvider>;

describe('FavoritesContext', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mockUser = { id: 'u1', role: 'buyer' };
    mockApi.getFavorites.mockResolvedValue({ data: [] });
    mockApi.addFavorite.mockResolvedValue({});
    mockApi.removeFavorite.mockResolvedValue({});
  });

  describe('guest favorites', () => {
    it('seeds favorites from guest localStorage when user is null', async () => {
      mockUser = null;
      localStorage.setItem(GUEST_KEY, JSON.stringify(['p1', 'p2']));

      const { result } = renderHook(() => useFavorites(), { wrapper });

      await waitFor(() => {
        expect(result.current.favorites.has('p1')).toBe(true);
        expect(result.current.favorites.has('p2')).toBe(true);
      });
    });
  });

  describe('merge effect — cancellation on user change', () => {
    it('does not write to the previous user storage or clear GUEST_KEY when user changes before resolve', async () => {
      localStorage.setItem(GUEST_KEY, JSON.stringify(['g1']));

      let resolveFirst;
      const firstPromise = new Promise((resolve) => { resolveFirst = resolve; });
      mockApi.getFavorites.mockReturnValueOnce(firstPromise);

      const { rerender } = renderHook(() => useFavorites(), { wrapper });

      // Switch user before first promise resolves.
      mockUser = { id: 'u2', role: 'buyer' };
      mockApi.getFavorites.mockResolvedValueOnce({ data: [] });
      rerender();

      await waitFor(() => {
        expect(mockApi.getFavorites).toHaveBeenCalledTimes(2);
      });

      // Let stale first promise resolve.
      act(() => {
        resolveFirst({ data: [{ id: 's1' }] });
      });
      await act(() => Promise.resolve());

      // Stale response must NOT have written to u1's key.
      expect(localStorage.getItem(userKey('u1'))).toBeNull();
    });
  });

  describe('guest favorite merging', () => {
    it('merges guest favorites into server set and removes GUEST_KEY on success', async () => {
      localStorage.setItem(GUEST_KEY, JSON.stringify(['g1', 'g2']));
      mockApi.getFavorites.mockResolvedValue({ data: [{ id: 's1' }] });

      const { result } = renderHook(() => useFavorites(), { wrapper });

      await waitFor(() => {
        expect(result.current.favorites.has('s1')).toBe(true);
        expect(result.current.favorites.has('g1')).toBe(true);
        expect(result.current.favorites.has('g2')).toBe(true);
      });

      expect(localStorage.getItem(GUEST_KEY)).toBeNull();
    });
  });

  describe('toggleFavorite — optimistic revert', () => {
    it('reverts only the toggled product id when its API call fails while another toggle succeeded', async () => {
      mockApi.getFavorites.mockResolvedValue({ data: [{ id: 'p1' }, { id: 'p2' }] });

      const { result } = renderHook(() => useFavorites(), { wrapper });

      await waitFor(() => {
        expect(result.current.favorites.has('p1')).toBe(true);
        expect(result.current.favorites.has('p2')).toBe(true);
      });

      // Add p3 successfully.
      mockApi.addFavorite.mockResolvedValue({});
      await act(async () => {
        await result.current.toggleFavorite('p3');
      });
      expect(result.current.favorites.has('p3')).toBe(true);

      // Remove p1 — fails.
      mockApi.removeFavorite.mockRejectedValueOnce(new Error('server error'));
      await act(async () => {
        try {
          await result.current.toggleFavorite('p1');
        } catch {
          // expected
        }
      });

      // p1 should be reverted (re-added).
      expect(result.current.favorites.has('p1')).toBe(true);
      // p3 should still be there (not clobbered by the revert).
      expect(result.current.favorites.has('p3')).toBe(true);
    });
  });
});
