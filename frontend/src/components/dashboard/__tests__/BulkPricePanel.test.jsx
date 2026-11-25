import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../../api/client', () => ({
  api: {
    bulkUpdatePrices: vi.fn(),
  },
}));

import BulkPricePanel, { buildBulkPricePayload } from '../BulkPricePanel';
import { api } from '../../../api/client';

const PRODUCTS = [
  { id: 1, name: 'Tomatoes', price: 5 },
  { id: 2, name: 'Honey', price: 12 },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('buildBulkPricePayload', () => {
  it('rejects NaN prices', () => {
    expect(buildBulkPricePayload({ 1: 'abc' }, '').error).toMatch(/invalid price/i);
  });
});

describe('BulkPricePanel', () => {
  it('shows validation error when nothing is entered', async () => {
    render(<BulkPricePanel products={PRODUCTS} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /apply price update/i }));
    });
    expect(api.bulkUpdatePrices).not.toHaveBeenCalled();
    expect(screen.getByText(/percentage adjustment or individual prices/i)).toBeInTheDocument();
  });

  it('does not call the API for a NaN price', async () => {
    render(<BulkPricePanel products={PRODUCTS} />);
    fireEvent.change(screen.getAllByPlaceholderText('—')[0], { target: { value: 'not-a-number' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /apply price update/i }));
    });
    expect(api.bulkUpdatePrices).not.toHaveBeenCalled();
    expect(screen.getByText(/invalid price/i)).toBeInTheDocument();
  });

  it('calls the API with adjustment_percent for a valid percentage', async () => {
    api.bulkUpdatePrices.mockResolvedValue({ updated: 2 });
    render(<BulkPricePanel products={PRODUCTS} onUpdated={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. \+10/i), { target: { value: '10' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /apply price update/i }));
    });
    expect(api.bulkUpdatePrices).toHaveBeenCalledWith([], 10);
    expect(screen.getByText(/updated 2 product/i)).toBeInTheDocument();
  });

  it('prefers the server-reported updated count', async () => {
    api.bulkUpdatePrices.mockResolvedValue({ data: { updated: 99 } });
    render(<BulkPricePanel products={PRODUCTS} />);
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. \+10/i), { target: { value: '5' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /apply price update/i }));
    });
    expect(screen.getByText(/updated 99 product/i)).toBeInTheDocument();
  });
});