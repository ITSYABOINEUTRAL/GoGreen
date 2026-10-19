import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { vi, describe, it, beforeEach } from 'vitest';
import Dashboard from '../Dashboard';
import { api } from '../../api/client';
import { expectNoA11yViolations } from '../../test/a11y';

vi.mock('../../api/client', () => ({
  api: {
    getMyProducts: vi.fn(),
    getSales: vi.fn(),
    getFarmer: vi.fn(),
    getBundles: vi.fn(),
    getCooperatives: vi.fn(),
    getHarvestBatches: vi.fn(),
    getForecast: vi.fn(),
    getWaitlistAnalytics: vi.fn(),
    getBundleDiscounts: vi.fn(),
    getCreatorEarnings: vi.fn(),
    getMyCoupons: vi.fn(),
    getPendingMultisigTxs: vi.fn(),
    createProduct: vi.fn(),
    deleteProduct: vi.fn(),
    uploadProductImage: vi.fn(),
    createHarvestBatch: vi.fn(),
  },
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'farmer-1', role: 'farmer' } }),
}));

vi.mock('../../hooks/useConfirm', () => ({
  useConfirm: () => ({ confirm: vi.fn().mockResolvedValue(true), confirmDialog: null }),
}));

vi.mock('../../utils/useXlmRate', () => ({
  useXlmRate: () => ({ rate: null, usd: () => null }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k) => k }),
}));

vi.mock('../../utils/toast', () => ({ showToast: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  api.getMyProducts.mockResolvedValue({ data: [] });
  api.getSales.mockResolvedValue({ data: [] });
  api.getFarmer.mockResolvedValue({});
  api.getBundles.mockResolvedValue({ data: [] });
  api.getCooperatives.mockResolvedValue({ data: [] });
  api.getHarvestBatches.mockResolvedValue({ data: [] });
  api.getForecast.mockResolvedValue({ data: [] });
  api.getWaitlistAnalytics.mockResolvedValue({ data: [] });
  api.getBundleDiscounts.mockResolvedValue({ data: [] });
  api.getCreatorEarnings.mockResolvedValue({ data: null });
  api.getMyCoupons.mockResolvedValue({ data: [] });
  api.getPendingMultisigTxs.mockResolvedValue({ data: [] });
});

describe('Dashboard accessibility', () => {
  it('has no axe violations in the product form region', async () => {
    render(
      <HelmetProvider>
        <Dashboard />
      </HelmetProvider>
    );

    // Wait for the product form to appear; it carries aria-label="Add product"
    const productForm = await screen.findByRole('form', { name: /add product/i });
    await expectNoA11yViolations(productForm);
  });
});
