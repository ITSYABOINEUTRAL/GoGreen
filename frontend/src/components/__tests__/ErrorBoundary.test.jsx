import React from 'react';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ErrorBoundary, { isChunkLoadError } from '../ErrorBoundary';

vi.mock('../../utils/sentry', () => ({ captureException: vi.fn() }));

function ThrowingChild({ shouldThrow, message }) {
  if (shouldThrow) {
    throw new Error(message || 'Test error');
  }
  return <div>Children rendered</div>;
}

describe('isChunkLoadError', () => {
  it('returns true for "Failed to fetch dynamically imported module"', () => {
    expect(isChunkLoadError('Failed to fetch dynamically imported module: /app.js')).toBe(true);
  });

  it('returns true for ChunkLoadError', () => {
    expect(isChunkLoadError('ChunkLoadError: Loading chunk 5 failed.')).toBe(true);
  });

  it('returns true for "Loading chunk N failed"', () => {
    expect(isChunkLoadError('Loading chunk 42 failed')).toBe(true);
  });

  it('returns false for an ordinary error message', () => {
    expect(isChunkLoadError('Cannot read properties of undefined')).toBe(false);
  });

  it('returns false for null/undefined', () => {
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
  });
});

describe('ErrorBoundary', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <div>Hello world</div>
      </ErrorBoundary>
    );
    expect(screen.getByText('Hello world')).toBeTruthy();
  });

  it('renders the chunk-load refresh UI when a chunk-load error is thrown', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow message="Failed to fetch dynamically imported module: chunk.js" />
      </ErrorBoundary>
    );
    expect(screen.getByText('A New Version Is Available')).toBeTruthy();
    expect(screen.getByRole('button', { name: /refresh/i })).toBeTruthy();
  });

  it('renders the generic retry UI when a non-chunk error is thrown', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow message="Something went wrong in my code" />
      </ErrorBoundary>
    );
    expect(screen.getByText('Oops! Something Went Wrong')).toBeTruthy();
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy();
  });

  it('clears the error state and re-renders children when "Try again" is clicked', () => {
    // Use a wrapper component with mutable state so we can control shouldThrow
    // without React re-rendering the boundary with shouldThrow=true again after retry.
    let setShouldThrow;
    function ControlledWrapper() {
      const [shouldThrow, setThrow] = React.useState(true);
      setShouldThrow = setThrow;
      return (
        <ErrorBoundary>
          <ThrowingChild shouldThrow={shouldThrow} message="Recoverable error" />
        </ErrorBoundary>
      );
    }

    render(<ControlledWrapper />);
    expect(screen.getByText('Oops! Something Went Wrong')).toBeTruthy();

    // Stop throwing before clicking retry so the reset re-render succeeds.
    act(() => { setShouldThrow(false); });
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(screen.getByText('Children rendered')).toBeTruthy();
  });

  it('calls fetch with the configured URL when VITE_ERROR_REPORTING_URL is set', async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true }));
    global.fetch = fetchMock;
    vi.stubEnv('VITE_ERROR_REPORTING_URL', 'https://example.test/errors');

    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow message="Reported error" />
      </ErrorBoundary>
    );

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.test/errors',
      expect.objectContaining({ method: 'POST' })
    );

    vi.unstubAllEnvs();
    delete global.fetch;
  });

  it('does not throw when fetch rejects', async () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error('network failure')));
    global.fetch = fetchMock;
    vi.stubEnv('VITE_ERROR_REPORTING_URL', 'https://example.test/errors');

    expect(() => {
      render(
        <ErrorBoundary>
          <ThrowingChild shouldThrow message="Error that triggers failing fetch" />
        </ErrorBoundary>
      );
    }).not.toThrow();

    await new Promise(resolve => setTimeout(resolve, 50));

    vi.unstubAllEnvs();
    delete global.fetch;
  });

  it('does not call fetch when VITE_ERROR_REPORTING_URL is not set', async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;
    vi.stubEnv('VITE_ERROR_REPORTING_URL', '');

    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow message="Unreported error" />
      </ErrorBoundary>
    );

    await new Promise(resolve => setTimeout(resolve, 0));
    expect(fetchMock).not.toHaveBeenCalled();

    vi.unstubAllEnvs();
    delete global.fetch;
  });
});
