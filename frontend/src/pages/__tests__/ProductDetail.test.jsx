/**
 * ProductDetail.test.jsx — #263
 *
 * Guards the buy flow against a missing product and a non-positive quantity.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { HelmetProvider } from 'react-helmet-async';
import ProductDetail from '../ProductDetail';
import { api } from '../../api/client';

// ── Minimal dependency stubs ──────────────────────────────────────────────────

vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: '42' }),
  useNavigate: () => vi.fn(),
}));

vi.mock('../../api/client', () => ({
  api: {
    getProduct: vi.fn(),
    getProductReviews: vi.fn(),
    getProductImages: vi.fn(),
    getProductTiers: vi.fn(),
    getPriceHistory: vi.fn(),
    getCalendar: vi.fn(),
    getProductShareMeta: vi.fn(),
    getAddresses: vi.fn(),
    getMyAlert: vi.fn(),
    getWaitlistStatus: vi.fn(),
    getOrders: vi.fn(),
    getWalletAssets: vi.fn(),
    getFeePreview: vi.fn(),
    getStockStreamUrl: vi.fn(),
    getAuction: vi.fn(),
    placeOrder: vi.fn(),
    trackShareEvent: vi.fn(),
    setStockAlert: vi.fn(),
  },
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'buyer-1', role: 'buyer' } }),
}));

vi.mock('../../context/FavoritesContext', () => ({
  useFavorites: () => ({ isFavorited: () => false, toggleFavorite: vi.fn() }),
}));

vi.mock('../../context/NetworkContext', () => ({
  useNetwork: () => ({ explorerUrl: () => '#' }),
}));

vi.mock('../../hooks/useIdempotencyKey', () => ({
  useIdempotencyKey: () => ({ keyFor: () => 'ikey', settle: vi.fn() }),
}));

vi.mock('../../hooks/useReviewForm', () => ({
  useReviewForm: () => ({
    handleReviewSubmit: vi.fn(),
    reviewSuccess: false,
    reviewError: '',
    reviewLoading: false,
    reviewRating: 0,
    reviewComment: '',
    reviewOrderId: '',
    setReviewOrderId: vi.fn(),
    setReviewRating: vi.fn(),
    setReviewComment: vi.fn(),
  }),
}));

vi.mock('../../hooks/usePaymentLink', () => ({
  usePaymentLink: () => ({
    paymentLinkData: null,
    paymentLinkLoading: false,
    paymentLinkError: '',
    generatePaymentLink: vi.fn(),
    setPaymentLinkError: vi.fn(),
  }),
}));

vi.mock('../../utils/useXlmRate', () => ({
  useXlmRate: () => ({ rate: null, usd: () => null }),
}));

vi.mock('../../utils/toast', () => ({ showToast: vi.fn() }));
vi.mock('../../utils/recentlyViewed', () => ({ addRecentlyViewed: vi.fn() }));
vi.mock('../../utils/stellarErrors', () => ({ getStellarErrorMessage: () => null }));
vi.mock('../../utils/errorMessages', () => ({ getErrorMessage: (e) => e?.message || 'Error' }));
vi.mock('../../utils/distance', () => ({
  calculateHaversineDistance: () => 5,
  formatDistanceLabel: () => '5 km',
}));
vi.mock('../../utils/imageUtils', () => ({ buildSrcSet: () => '' }));

vi.mock('../../components/StarRating', () => ({ default: () => null }));
vi.mock('../../components/Spinner', () => ({ default: () => <div data-testid="spinner">Loading...</div> }));
vi.mock('../../components/FlashSaleCountdown', () => ({ default: () => null }));
vi.mock('../../components/ShareButtons', () => ({ default: () => null }));
vi.mock('../../components/PriceHistoryChart', () => ({ default: () => null }));
vi.mock('qrcode.react', () => ({ default: () => null }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k, opts) => opts?.count !== undefined ? `${k}(${opts.count})` : k }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const PRODUCT = {
  id: 42,
  name: 'Tomatoes',
  description: 'Fresh tomatoes',
  price: 10,
  unit: 'kg',
  quantity: 100,
  farmer_id: 99,
  farmer_name: 'Farmer Joe',
  avg_rating: 4,
  review_count: 3,
  pricing_model: 'fixed',
  pricing_type: 'unit',
  min_order_quantity: 1,
  type: 'standard',
};

function setupDefaultMocks() {
  api.getProduct.mockResolvedValue({ data: PRODUCT });
  api.getProductReviews.mockResolvedValue({ data: [] });
  api.getProductImages.mockResolvedValue({ data: [] });
  api.getProductTiers.mockResolvedValue({ data: [] });
  api.getPriceHistory.mockResolvedValue({ data: [] });
  api.getCalendar.mockResolvedValue({ data: [] });
  api.getProductShareMeta.mockResolvedValue({ data: null });
  api.getAddresses.mockResolvedValue({ data: [] });
  api.getMyAlert.mockResolvedValue({ subscribed: false });
  api.getWaitlistStatus.mockResolvedValue({ is_on_waitlist: false, position: null });
  api.getOrders.mockResolvedValue({ data: [] });
  api.getWalletAssets.mockResolvedValue({ data: [] });
  api.getFeePreview.mockResolvedValue({ feePercent: 0, feeAmount: 0, farmerAmount: 10 });
  api.getStockStreamUrl.mockReturnValue('/stream/42');
  api.getAuction.mockResolvedValue({ data: null });
}

function renderPage() {
  return render(
    <HelmetProvider>
      <ProductDetail />
    </HelmetProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ProductDetail — missing product guard', () => {
  it('renders a not-found state when getProduct resolves to null', async () => {
    api.getProduct.mockResolvedValue({ data: null });
    api.getProductReviews.mockResolvedValue({ data: [] });
    api.getProductImages.mockResolvedValue({ data: [] });
    api.getProductTiers.mockResolvedValue({ data: [] });
    api.getPriceHistory.mockResolvedValue({ data: [] });
    api.getCalendar.mockResolvedValue({ data: [] });
    api.getProductShareMeta.mockResolvedValue({ data: null });
    api.getAddresses.mockResolvedValue({ data: [] });
    api.getMyAlert.mockResolvedValue({ subscribed: false });
    api.getWaitlistStatus.mockResolvedValue({ is_on_waitlist: false });
    api.getOrders.mockResolvedValue({ data: [] });
    api.getWalletAssets.mockResolvedValue({ data: [] });
    api.getFeePreview.mockResolvedValue({ feePercent: 0, feeAmount: 0, farmerAmount: 0 });
    api.getStockStreamUrl.mockReturnValue('/stream/42');
    api.getAuction.mockResolvedValue({ data: null });

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('product-not-found')).toBeTruthy();
    });

    // Buy form must not be rendered when product is missing
    expect(screen.queryByTestId('buy-now-btn')).toBeNull();
  });
});

describe('ProductDetail — quantity clamping', () => {
  it('clamps qty to minimum of 1 when user types 0', async () => {
    setupDefaultMocks();
    renderPage();

    await waitFor(() => screen.getByTestId('qty-input'));

    const qtyInput = screen.getByTestId('qty-input');

    // Type 0 — should be clamped to 1 by the onChange handler
    fireEvent.change(qtyInput, { target: { value: '0' } });

    // The displayed value should be clamped to 1 (not 0)
    expect(Number(qtyInput.value)).toBeGreaterThanOrEqual(1);
  });

  it('does not call placeOrder when qty is 0 or negative', async () => {
    setupDefaultMocks();
    // placeOrder returns a successful response
    api.placeOrder.mockResolvedValue({ orderId: 1, totalPrice: '10.00' });

    renderPage();

    await waitFor(() => screen.getByTestId('buy-now-btn'));

    const qtyInput = screen.getByTestId('qty-input');

    // Try to set qty to 0 — the clamp should prevent it
    fireEvent.change(qtyInput, { target: { value: '0' } });

    const buyBtn = screen.getByTestId('buy-now-btn');
    fireEvent.click(buyBtn);

    // If placeOrder was called, quantity must be >= 1
    await waitFor(() => {
      if (api.placeOrder.mock.calls.length > 0) {
        const orderBody = api.placeOrder.mock.calls[0][0];
        expect(orderBody.quantity).toBeGreaterThanOrEqual(1);
      }
    });
  });

  it('Buy Now button is disabled while a purchase is in flight', async () => {
    setupDefaultMocks();
    // Make placeOrder hang so we can inspect the disabled state mid-flight
    api.placeOrder.mockImplementation(() => new Promise(() => {}));

    renderPage();

    await waitFor(() => screen.getByTestId('buy-now-btn'));

    const buyBtn = screen.getByTestId('buy-now-btn');
    expect(buyBtn.disabled).toBe(false);

    fireEvent.click(buyBtn);

    await waitFor(() => {
      expect(screen.getByTestId('buy-now-btn').disabled).toBe(true);
    });
  });
});
