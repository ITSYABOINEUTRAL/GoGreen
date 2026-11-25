import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import UpdatePrompt from '../UpdatePrompt';

describe('UpdatePrompt', () => {
  const originalLocation = window.location;
  let serviceWorker;
  let reloadSpy;

  beforeEach(() => {
    serviceWorker = new EventTarget();
    serviceWorker.controller = null;
    serviceWorker.ready = Promise.resolve({ waiting: null, addEventListener: vi.fn() });
    Object.defineProperty(navigator, 'serviceWorker', { value: serviceWorker, configurable: true });

    reloadSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, reload: reloadSpy },
    });
  });

  afterEach(() => {
    delete navigator.serviceWorker;
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  });

  const dispatchMessage = (data) =>
    act(() => {
      serviceWorker.dispatchEvent(new MessageEvent('message', { data }));
    });

  it('shows the banner when an SW_UPDATED message arrives', () => {
    render(<UpdatePrompt />);
    expect(screen.queryByRole('alert')).toBeNull();

    dispatchMessage({ type: 'SW_UPDATED' });

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('ignores messages with a different type', () => {
    render(<UpdatePrompt />);

    dispatchMessage({ type: 'SOMETHING_ELSE' });

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('marks the banner as a polite live region', () => {
    render(<UpdatePrompt />);
    dispatchMessage({ type: 'SW_UPDATED' });

    expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'polite');
  });

  it('hides the banner on Dismiss without reloading the page', () => {
    render(<UpdatePrompt />);
    dispatchMessage({ type: 'SW_UPDATED' });

    fireEvent.click(screen.getByRole('button', { name: /dismiss update notification/i }));

    expect(screen.queryByRole('alert')).toBeNull();
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('reloads the page on Refresh', () => {
    render(<UpdatePrompt />);
    dispatchMessage({ type: 'SW_UPDATED' });

    fireEvent.click(screen.getByRole('button', { name: /refresh to apply the update/i }));

    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });
});
