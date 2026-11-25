import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AdminAnalyticsSummary from '../AdminAnalyticsSummary';

describe('AdminAnalyticsSummary', () => {
  it('renders nothing when stats is null', () => {
    const { container } = render(<AdminAnalyticsSummary stats={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders expected values for a complete payload', () => {
    render(
      <AdminAnalyticsSummary
        stats={{ users: 10, products: 20, orders: 30, total_revenue_xlm: 12.5 }}
      />
    );
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
    expect(screen.getByText('12.50')).toBeInTheDocument();
  });

  it('does not render NaN for missing revenue', () => {
    const { container } = render(
      <AdminAnalyticsSummary stats={{ users: 1, products: 2, orders: 3 }} />
    );
    expect(container.textContent).not.toContain('NaN');
    expect(screen.getByText('0.00')).toBeInTheDocument();
  });
});