import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const initMock = vi.fn();
const captureExceptionMock = vi.fn();

vi.mock('@sentry/react', () => ({
  init: initMock,
  captureException: captureExceptionMock,
}));

describe('sentry utils', () => {
  beforeEach(() => {
    vi.resetModules();
    initMock.mockReset();
    captureExceptionMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('does nothing when VITE_SENTRY_DSN is empty', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', '');
    const { initSentry } = await import('../sentry');

    await initSentry();

    expect(initMock).not.toHaveBeenCalled();
  });

  it('swallows a rejected @sentry/react import', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://example@sentry.io/1');
    vi.doMock('@sentry/react', () => {
      throw new Error('import failed');
    });

    const { initSentry } = await import('../sentry');

    await expect(initSentry()).resolves.toBeUndefined();
    expect(initMock).not.toHaveBeenCalled();

    vi.doUnmock('@sentry/react');
  });

  it('calls Sentry.init with dsn, environment and tracesSampleRate after a successful import', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://example@sentry.io/1');
    vi.stubEnv('VITE_SENTRY_ENVIRONMENT', 'test');

    const { initSentry } = await import('../sentry');

    await initSentry();

    expect(initMock).toHaveBeenCalledTimes(1);
    expect(initMock).toHaveBeenCalledWith({
      dsn: 'https://example@sentry.io/1',
      environment: 'test',
      tracesSampleRate: 0.1,
    });
  });

  it('captureException is a no-op before init', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', '');
    const { captureException } = await import('../sentry');

    expect(() => captureException(new Error('boom'), { extra: 1 })).not.toThrow();
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  it('captureException forwards error and extra after init', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://example@sentry.io/1');
    const { initSentry, captureException } = await import('../sentry');

    await initSentry();

    const error = new Error('boom');
    const extra = { userId: 42 };
    captureException(error, extra);

    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
    expect(captureExceptionMock).toHaveBeenCalledWith(error, extra);
  });
});
