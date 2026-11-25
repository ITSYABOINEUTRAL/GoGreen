import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '../../../test/a11y';

vi.mock('../../../api/client', () => ({
  api: { createAuction: vi.fn() },
}));

import AuctionManager from '../AuctionManager';

const PRODUCTS = [{ id: 3, name: 'Mango' }];

describe('AuctionManager accessibility', () => {
  it('has no axe violations on the create-auction form', async () => {
    const { container } = render(<AuctionManager products={PRODUCTS} />);
    await expectNoA11yViolations(container);
  });

  it('exposes all controls by accessible label', () => {
    render(<AuctionManager products={PRODUCTS} />);
    expect(screen.getByLabelText(/product/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/starting price/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/reserve price/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/ends at/i)).toBeInTheDocument();
  });

  it('announces validation errors in the alert region', async () => {
    render(<AuctionManager products={PRODUCTS} />);
    fireEvent.change(screen.getByLabelText(/product/i), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText(/starting price/i), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText(/ends at/i), {
      target: { value: '2000-01-01T08:00' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /create auction/i }));
    });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/end time must be in the future/i);
  });
});