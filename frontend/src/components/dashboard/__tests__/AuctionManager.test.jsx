import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../../api/client', () => ({
  api: { createAuction: vi.fn() },
}));

import AuctionManager, { validateAuctionForm } from '../AuctionManager';
import { api } from '../../../api/client';

const PRODUCTS = [{ id: 7, name: 'Coffee' }];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('validateAuctionForm', () => {
  it('rejects non-numeric start prices', () => {
    expect(validateAuctionForm({
      product_id: '7',
      start_price: 'abc',
      reserve_price: '',
      ends_at: new Date(Date.now() + 3600000).toISOString().slice(0, 16),
    }).ok).toBe(false);
  });
});

describe('AuctionManager', () => {
  it('does not call createAuction for an invalid start price', async () => {
    render(<AuctionManager products={PRODUCTS} />);
    fireEvent.change(screen.getByLabelText(/product/i), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText(/starting price/i), { target: { value: 'NaN' } });
    fireEvent.change(screen.getByLabelText(/ends at/i), {
      target: { value: '2099-01-01T12:00' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /create auction/i }));
    });
    expect(api.createAuction).not.toHaveBeenCalled();
  });

  it('calls createAuction once for a valid form', async () => {
    api.createAuction.mockResolvedValue({});
    render(<AuctionManager products={PRODUCTS} />);
    fireEvent.change(screen.getByLabelText(/product/i), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText(/starting price/i), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText(/ends at/i), {
      target: { value: '2099-01-01T12:00' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /create auction/i }));
    });
    expect(api.createAuction).toHaveBeenCalledTimes(1);
    expect(api.createAuction.mock.calls[0][0]).toMatchObject({
      product_id: 7,
      start_price: 5,
    });
  });
});