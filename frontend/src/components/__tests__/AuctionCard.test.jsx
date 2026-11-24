import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import AuctionCard from '../AuctionCard';

const api = { getAuction: vi.fn(), placeBid: vi.fn() };
vi.mock('../../api/client', () => ({ api }));

const baseAuction = {
  id: 'a1',
  product_name: 'Organic Mangoes',
  farmer_name: 'Alice',
  start_price: 10,
  current_bid: 10,
  bid_count: 0,
  status: 'active',
  ends_at: new Date(Date.now() + 3600000).toISOString(),
};

function setup(auction = baseAuction) {
  return render(<AuctionCard auction={auction} onBid={vi.fn()} />);
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false });
  api.getAuction.mockResolvedValue({ ...baseAuction });
  api.placeBid.mockResolvedValue({});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('AuctionCard – optimistic bid revert', () => {
  it('after a successful poll, a rejected bid reverts to the polled current_bid not the mount-time value', async () => {
    setup();

    const polledAuction = { ...baseAuction, current_bid: 15 };
    api.getAuction.mockResolvedValueOnce(polledAuction);
    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    api.placeBid.mockRejectedValueOnce(new Error('bid too low'));
    const input = screen.getByPlaceholderText(/Bid >/);
    fireEvent.change(input, { target: { value: '12' } });
    fireEvent.click(screen.getByText('Place Bid'));

    await waitFor(() => expect(screen.getByText(/bid too low/i)).toBeInTheDocument());
    expect(screen.getByText('15 XLM')).toBeInTheDocument();
  });
});

describe('AuctionCard – poll error state', () => {
  it('a failed poll shows "Live updates paused" indicator', async () => {
    setup();
    api.getAuction.mockRejectedValueOnce(new Error('network'));
    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByText('Live updates paused')).toBeInTheDocument());
  });

  it('a subsequent successful poll clears the poll-error indicator', async () => {
    setup();

    api.getAuction.mockRejectedValueOnce(new Error('network'));
    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByText('Live updates paused')).toBeInTheDocument());

    api.getAuction.mockResolvedValueOnce({ ...baseAuction });
    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.queryByText('Live updates paused')).toBeNull());
  });
});
