import React from 'react';
import { render, screen } from '@testing-library/react';
import { test, expect } from 'vitest';
import AdminDisputesPanel from '../AdminDisputesPanel';
import { expectNoA11yViolations } from '../../../test/a11y';

const sampleDisputes = [
  {
    id: 1,
    buyer_name: 'Ada',
    buyer_email: 'ada@example.com',
    product_name: 'Tomatoes',
    quantity: 2,
    total_price: 12.5,
    status: 'open',
    reason: 'Damaged',
    resolution: null,
  },
  {
    id: 2,
    buyer_name: 'Bob',
    buyer_email: 'bob@example.com',
    product_name: 'Lettuce',
    quantity: 1,
    total_price: 4,
    status: 'resolved',
    reason: 'Late',
    resolution: 'Refunded',
  },
];

test('AdminDisputesPanel has no accessibility violations and named resolve actions', async () => {
  const { container } = render(
    <AdminDisputesPanel disputes={sampleDisputes} onResolve={() => {}} />,
  );

  expect(screen.getByRole('button', { name: /resolve dispute 1/i })).toBeInTheDocument();
  expect(screen.getByCaptionText(/customer disputes/i)).toBeInTheDocument();
  await expectNoA11yViolations(container);
});
