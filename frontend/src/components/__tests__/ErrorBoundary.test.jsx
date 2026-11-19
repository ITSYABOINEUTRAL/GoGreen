import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Sentry utility before importing ErrorBoundary to avoid uninstalled @sentry/react in Vitest
vi.mock('../../utils/sentry', () => ({
  captureException: vi.fn(),
  initSentry: vi.fn(),
}));

import ErrorBoundary, { isChunkLoadError } from '../ErrorBoundary';

function Bomb({ error }) {
  throw error || new Error('generic error');
}

describe('isChunkLoadError', () => {
  it('returns true for known chunk-load errors', () => {
    expect(isChunkLoadError('Failed to fetch dynamically imported module')).toBe(true);
    expect(isChunkLoadError('ChunkLoadError: Loading chunk failed')).toBe(true);
    expect(isChunkLoadError('ChunkLoadError')).toBe(true);
    expect(isChunkLoadError('Loading chunk 5 failed')).toBe(true);
    expect(isChunkLoadError('error loading dynamically imported module')).toBe(true);
    expect(isChunkLoadError('Importing a module script failed')).toBe(true);
  });

  it('returns false for ordinary application errors and falsy values', () => {
    expect(isChunkLoadError('TypeError: Cannot read properties of undefined')).toBe(false);
    expect(isChunkLoadError('NetworkError: Failed to fetch API')).toBe(false);
    expect(isChunkLoadError('')).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
  });
});

describe('ErrorBoundary rendering and actions', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    // Suppress expected React error logging during intentional error boundaries
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('renders children when no error is thrown', () => {
    render(
      <ErrorBoundary>
        <div data-testid="child-content">Healthy Child Component</div>
      </ErrorBoundary>
    );

    expect(screen.getByTestId('child-content')).toHaveTextContent('Healthy Child Component');
    expect(screen.queryByText(/Something Went Wrong/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/A New Version Is Available/i)).not.toBeInTheDocument();
  });

  it('renders "A New Version Is Available" refresh UI on chunk-load error', () => {
    render(
      <ErrorBoundary>
        <Bomb error={new Error('Failed to fetch dynamically imported module')} />
      </ErrorBoundary>
    );

    expect(screen.getByText('A New Version Is Available')).toBeInTheDocument();
    expect(
      screen.getByText(
        /This page has been updated since you loaded it. Please refresh to get the latest version./i
      )
    ).toBeInTheDocument();
    const refreshButton = screen.getByRole('button', { name: /Refresh/i });
    expect(refreshButton).toBeInTheDocument();
    expect(refreshButton).toHaveAttribute('aria-label', 'Refresh to apply the update');
  });

  it('renders generic "Oops! Something Went Wrong" UI with "Try again" button on ordinary error', () => {
    render(
      <ErrorBoundary>
        <Bomb error={new Error('Database query timed out')} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Oops! Something Went Wrong')).toBeInTheDocument();
    expect(screen.getByText('Database query timed out')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Try again/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reload Page/i })).toBeInTheDocument();
  });

  it('clears error state and successfully re-renders children when "Try again" is clicked', () => {
    let shouldThrow = true;
    function RecoverableChild({ shouldThrow: throwFlag }) {
      if (throwFlag) {
        throw new Error('Temporary failure');
      }
      return <div>Recovered content successfully displayed</div>;
    }

    const { rerender } = render(
      <ErrorBoundary>
        <RecoverableChild shouldThrow={shouldThrow} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Oops! Something Went Wrong')).toBeInTheDocument();
    expect(screen.queryByText('Recovered content successfully displayed')).not.toBeInTheDocument();

    // Condition causing error is resolved
    shouldThrow = false;
    rerender(
      <ErrorBoundary>
        <RecoverableChild shouldThrow={shouldThrow} />
      </ErrorBoundary>
    );

    // Click retry
    fireEvent.click(screen.getByRole('button', { name: /Try again/i }));

    expect(screen.getByText('Recovered content successfully displayed')).toBeInTheDocument();
    expect(screen.queryByText('Oops! Something Went Wrong')).not.toBeInTheDocument();
  });
});

describe('ErrorBoundary backend reporting', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('calls fetch with error details when VITE_ERROR_REPORTING_URL is configured', () => {
    vi.stubEnv('VITE_ERROR_REPORTING_URL', 'https://example.test/api/client-errors');
    global.fetch = vi.fn().mockResolvedValue({ ok: true });

    render(
      <ErrorBoundary>
        <Bomb error={new Error('Critical UI crash')} />
      </ErrorBoundary>
    );

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.test/api/client-errors',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const callBody = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(callBody).toMatchObject({
      message: 'Critical UI crash',
      url: expect.any(String),
      userAgent: expect.any(String),
      timestamp: expect.any(String),
    });
  });

  it('does not call fetch when VITE_ERROR_REPORTING_URL is empty or unset', () => {
    vi.stubEnv('VITE_ERROR_REPORTING_URL', '');
    global.fetch = vi.fn();

    render(
      <ErrorBoundary>
        <Bomb error={new Error('Silent crash')} />
      </ErrorBoundary>
    );

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('handles and catches rejected fetch without causing unhandled rejection or crashing componentDidCatch', async () => {
    vi.stubEnv('VITE_ERROR_REPORTING_URL', 'https://example.test/api/client-errors');
    global.fetch = vi.fn().mockRejectedValue(new Error('Network offline'));

    render(
      <ErrorBoundary>
        <Bomb error={new Error('Handled crash')} />
      </ErrorBoundary>
    );

    expect(global.fetch).toHaveBeenCalledTimes(1);
    // Error boundary continues to render fallback gracefully
    expect(screen.getByText('Oops! Something Went Wrong')).toBeInTheDocument();
  });
});

describe('ErrorBoundary development details', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('renders development details section when import.meta.env.DEV is true', () => {
    vi.stubEnv('DEV', true);

    render(
      <ErrorBoundary>
        <Bomb error={new Error('Debug this trace')} />
      </ErrorBoundary>
    );

    const summary = screen.getByText('Error Details (Development Only)');
    expect(summary).toBeInTheDocument();
    const details = summary.closest('details');
    expect(details).toBeInTheDocument();
    expect(details.querySelector('pre')).toHaveTextContent('Debug this trace');
  });

  it('does not render development details section when import.meta.env.DEV is false', () => {
    vi.stubEnv('DEV', false);

    render(
      <ErrorBoundary>
        <Bomb error={new Error('Hidden in prod')} />
      </ErrorBoundary>
    );

    expect(screen.queryByText('Error Details (Development Only)')).not.toBeInTheDocument();
  });
});
