import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useReviewForm } from '../useReviewForm';

const api = vi.hoisted(() => ({ getOrders: vi.fn(), submitReview: vi.fn() }));
vi.mock('../../api/client', () => ({ api }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key }) }));

beforeEach(() => {
  vi.clearAllMocks();
});

it('reports and retries order loading failures', async () => {
  api.getOrders.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ data: [] });
  const { result } = renderHook(() => useReviewForm('12', {}));
  await act(() => result.current.loadPaidOrders()); expect(result.current.ordersLoadError).toBe(true);
  await act(() => result.current.handleReviewSubmit({ preventDefault() {} })); expect(result.current.reviewError).toMatch(/ordersLoadError/); expect(api.submitReview).not.toHaveBeenCalled();
  await act(() => result.current.loadPaidOrders()); expect(result.current.ordersLoadError).toBe(false);
});

it('ignores partially numeric product ids', async () => {
  const { result } = renderHook(() => useReviewForm('12abc', {}));
  await act(() => result.current.loadPaidOrders()); expect(result.current.reviewOrderId).toBe(''); expect(api.getOrders).not.toHaveBeenCalled();
});

it('sets reviewError and does not clear the form when submitReview rejects', async () => {
  api.getOrders.mockResolvedValueOnce({
    data: [{ id: 42, product_id: 12, status: 'paid' }],
  });
  api.submitReview.mockRejectedValueOnce(new Error('boom'));
  const { result } = renderHook(() => useReviewForm('12', {}));
  await act(() => result.current.loadPaidOrders());
  expect(result.current.reviewOrderId).toBe('42');
  await act(() =>
    result.current.handleReviewSubmit({ preventDefault() {} })
  );
  expect(result.current.reviewError).toBeTruthy();
});

it('leaves reviewOrderId empty and does not call submitReview when getOrders returns empty list', async () => {
  api.getOrders.mockResolvedValueOnce({ data: [] });
  const { result } = renderHook(() => useReviewForm('12', {}));
  await act(() => result.current.loadPaidOrders());
  expect(result.current.reviewOrderId).toBe('');
  await act(() =>
    result.current.handleReviewSubmit({ preventDefault() {} })
  );
  expect(api.submitReview).not.toHaveBeenCalled();
});
