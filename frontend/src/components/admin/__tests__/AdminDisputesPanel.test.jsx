import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AdminDisputesPanel, { disputeStatusStyle } from '../AdminDisputesPanel';

const baseDispute = {
  id: 1,
  buyer_name: 'Ada',
  buyer_email: 'ada@example.com',
  product_name: 'Tomatoes',
  quantity: 2,
  total_price: 10,
  reason: 'Not delivered',
  resolution: null,
};

describe('AdminDisputesPanel', () => {
  it('shows empty state when there are no disputes', () => {
    render(<AdminDisputesPanel disputes={[]} onResolve={vi.fn()} />);
    expect(screen.getByText(/no disputes filed/i)).toBeInTheDocument();
  });

  it('renders a missing status without throwing', () => {
    render(
      <AdminDisputesPanel disputes={[{ ...baseDispute, status: undefined }]} onResolve={vi.fn()} />
    );
    expect(screen.getByText('unknown')).toBeInTheDocument();
    expect(disputeStatusStyle(undefined)).toEqual(expect.objectContaining({ bg: '#e8e8e8' }));
  });

  it('uses a neutral style for unknown statuses', () => {
    render(
      <AdminDisputesPanel disputes={[{ ...baseDispute, status: 'open' }]} onResolve={vi.fn()} />
    );
    expect(screen.getByText('open')).toBeInTheDocument();
    expect(disputeStatusStyle('open').bg).toBe('#e8e8e8');
  });

  it('omits Resolve for resolved disputes', () => {
    render(
      <AdminDisputesPanel disputes={[{ ...baseDispute, status: 'resolved' }]} onResolve={vi.fn()} />
    );
    expect(screen.queryByRole('button', { name: /resolve/i })).not.toBeInTheDocument();
  });

  it('shows Resolve for resolvable disputes', () => {
    render(
      <AdminDisputesPanel disputes={[{ ...baseDispute, status: 'under_review' }]} onResolve={vi.fn()} />
    );
    expect(screen.getByRole('button', { name: /resolve/i })).toBeInTheDocument();
  });
});