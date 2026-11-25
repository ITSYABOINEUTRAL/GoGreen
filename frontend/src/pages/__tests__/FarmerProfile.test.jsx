import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import FarmerProfile from '../FarmerProfile';

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, role: 'consumer' }, token: 'test-token' }),
}));

describe('FarmerProfile', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the verified badge for a verified farmer', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 42,
        name: 'Green Acres Farm',
        verified: true,
        bio: 'Fresh produce',
        products: [],
      }),
    });

    render(
      <MemoryRouter initialEntries={['/farmers/42']}>
        <Routes>
          <Route path="/farmers/:id" element={<FarmerProfile />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText(/verified/i)).toBeInTheDocument();
  });
});
