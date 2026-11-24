import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import ShareButtons from '../ShareButtons';

const api = { trackShareEvent: vi.fn() };
vi.mock('../../api/client', () => ({ api }));

const defaultProps = {
  productId: '42',
  title: 'Organic Tomatoes',
  url: 'https://example.com/products/42',
};

function setup(props = {}) {
  return render(<ShareButtons {...defaultProps} {...props} />);
}

beforeEach(() => {
  vi.useFakeTimers();
  api.trackShareEvent.mockResolvedValue({});
  Object.defineProperty(navigator, 'share', { value: undefined, configurable: true, writable: true });
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('ShareButtons – copy link', () => {
  it('shows "Copied!" and calls trackShareEvent with copy_link on success', async () => {
    setup();
    fireEvent.click(screen.getByText('Copy link'));
    await waitFor(() => expect(screen.getByText('Copied!')).toBeInTheDocument());
    expect(api.trackShareEvent).toHaveBeenCalledWith('42', 'copy_link');
  });

  it('shows "Failed to copy link" when clipboard rejects', async () => {
    navigator.clipboard.writeText.mockRejectedValueOnce(new Error('denied'));
    setup();
    fireEvent.click(screen.getByText('Copy link'));
    await waitFor(() => expect(screen.getByText('Failed to copy link')).toBeInTheDocument());
  });

  it('a rejected trackShareEvent does not prevent the success toast', async () => {
    api.trackShareEvent.mockRejectedValueOnce(new Error('network'));
    setup();
    fireEvent.click(screen.getByText('Copy link'));
    await waitFor(() => expect(screen.getByText('Copied!')).toBeInTheDocument());
  });

  it('clears the toast after 2s via fake timers', async () => {
    setup();
    fireEvent.click(screen.getByText('Copy link'));
    await waitFor(() => expect(screen.getByText('Copied!')).toBeInTheDocument());
    act(() => vi.advanceTimersByTime(2001));
    await waitFor(() => expect(screen.queryByText('Copied!')).toBeNull());
  });

  it('cancels the previous timer when showToast is called twice quickly', async () => {
    setup();
    fireEvent.click(screen.getByText('Copy link'));
    await waitFor(() => expect(screen.getByText('Copied!')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Copy link'));
    await waitFor(() => expect(screen.getByText('Copied!')).toBeInTheDocument());
    act(() => vi.advanceTimersByTime(1500));
    expect(screen.getByText('Copied!')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(600));
    await waitFor(() => expect(screen.queryByText('Copied!')).toBeNull());
  });

  it('clears the timer on unmount without throwing', async () => {
    const { unmount } = setup();
    fireEvent.click(screen.getByText('Copy link'));
    await waitFor(() => expect(screen.getByText('Copied!')).toBeInTheDocument());
    unmount();
    act(() => vi.advanceTimersByTime(2001));
  });
});

describe('ShareButtons – native share', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'share', {
      value: vi.fn(),
      configurable: true,
      writable: true,
    });
  });

  it('shows no toast when navigator.share rejects with AbortError', async () => {
    const err = new DOMException('aborted', 'AbortError');
    navigator.share.mockRejectedValueOnce(err);
    setup();
    fireEvent.click(screen.getByText('Share'));
    await waitFor(() => expect(navigator.share).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByText('Share failed')).toBeNull();
  });

  it('shows "Share failed" toast for a non-AbortError', async () => {
    navigator.share.mockRejectedValueOnce(new Error('oops'));
    setup();
    fireEvent.click(screen.getByText('Share'));
    await waitFor(() => expect(screen.getByText('Share failed')).toBeInTheDocument());
  });
});
