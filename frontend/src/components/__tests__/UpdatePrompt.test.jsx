import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import UpdatePrompt, { requestSkipWaiting } from '../UpdatePrompt';

describe('UpdatePrompt', () => {
  const originalLocation = window.location;
  let serviceWorker;
  let reloadSpy;
  let registrationMock;

  beforeEach(() => {
    serviceWorker = new EventTarget();
    serviceWorker.controller = null;
    registrationMock = {
      waiting: null,
      installing: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    serviceWorker.ready = Promise.resolve(registrationMock);
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
    vi.restoreAllMocks();
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

  it('removes the message listener on unmount', () => {
    const addSpy = vi.spyOn(serviceWorker, 'addEventListener');
    const removeSpy = vi.spyOn(serviceWorker, 'removeEventListener');

    const { unmount } = render(<UpdatePrompt />);
    unmount();

    // Every addEventListener call should have a matching removeEventListener.
    const addedTypes = addSpy.mock.calls.map((c) => c[0]);
    const removedTypes = removeSpy.mock.calls.map((c) => c[0]);
    for (const type of addedTypes) {
      expect(removedTypes).toContain(type);
    }
  });

  it('removes the controllerchange listener on unmount', async () => {
    const controllerChangeSpy = vi.spyOn(serviceWorker, 'removeEventListener');

    const { unmount } = render(<UpdatePrompt />);
    // Let the ready promise settle.
    await act(async () => {});
    unmount();

    expect(controllerChangeSpy).toHaveBeenCalledWith('controllerchange', expect.any(Function));
  });

  it('removes the updatefound listener on unmount', async () => {
    const { unmount } = render(<UpdatePrompt />);
    await act(async () => {});
    unmount();

    expect(registrationMock.removeEventListener).toHaveBeenCalledWith(
      'updatefound',
      expect.any(Function)
    );
  });
});

describe('requestSkipWaiting', () => {
  it('posts SKIP_WAITING to the sw and calls reload', () => {
    const sw = { postMessage: vi.fn() };
    const reload = vi.fn();
    requestSkipWaiting(sw, reload);
    expect(sw.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
