// @vitest-environment jsdom
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoadingProvider, useLoading } from '../LoadingContext';

const SHOW_DELAY_MS = 300;
const MIN_DISPLAY_MS = 300;

function LoadingProbe() {
  const { loading, startLoading, stopLoading } = useLoading();
  return (
    <div>
      <span data-testid="loading">{loading ? 'on' : 'off'}</span>
      <button type="button" data-testid="start" onClick={startLoading}>
        start
      </button>
      <button type="button" data-testid="stop" onClick={stopLoading}>
        stop
      </button>
    </div>
  );
}

function renderWithProvider() {
  return render(
    <LoadingProvider>
      <LoadingProbe />
    </LoadingProvider>
  );
}

describe('LoadingProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps loading false when work finishes before the show delay', () => {
    renderWithProvider();
    act(() => {
      screen.getByTestId('start').click();
      screen.getByTestId('stop').click();
    });
    act(() => {
      vi.advanceTimersByTime(SHOW_DELAY_MS + MIN_DISPLAY_MS);
    });
    expect(screen.getByTestId('loading').textContent).toBe('off');
  });

  it('shows loading after the delay and enforces the minimum display window', () => {
    renderWithProvider();
    act(() => {
      screen.getByTestId('start').click();
    });
    act(() => {
      vi.advanceTimersByTime(SHOW_DELAY_MS);
    });
    expect(screen.getByTestId('loading').textContent).toBe('on');

    act(() => {
      screen.getByTestId('stop').click();
    });
    expect(screen.getByTestId('loading').textContent).toBe('on');

    act(() => {
      vi.advanceTimersByTime(MIN_DISPLAY_MS - 1);
    });
    expect(screen.getByTestId('loading').textContent).toBe('on');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByTestId('loading').textContent).toBe('off');
  });

  it('keeps loading true until every overlapping caller has stopped', () => {
    renderWithProvider();
    act(() => {
      screen.getByTestId('start').click();
      screen.getByTestId('start').click();
    });
    act(() => {
      vi.advanceTimersByTime(SHOW_DELAY_MS);
    });
    expect(screen.getByTestId('loading').textContent).toBe('on');

    act(() => {
      screen.getByTestId('stop').click();
    });
    expect(screen.getByTestId('loading').textContent).toBe('on');

    act(() => {
      screen.getByTestId('stop').click();
    });
    expect(screen.getByTestId('loading').textContent).toBe('on');

    act(() => {
      vi.advanceTimersByTime(MIN_DISPLAY_MS);
    });
    expect(screen.getByTestId('loading').textContent).toBe('off');
  });

  it('throws when useLoading is used outside LoadingProvider', () => {
    function Orphan() {
      useLoading();
      return null;
    }
    expect(() => render(<Orphan />)).toThrow(
      'useLoading must be used within LoadingProvider'
    );
  });
});