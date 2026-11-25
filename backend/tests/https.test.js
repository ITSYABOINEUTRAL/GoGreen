/**
 * Tests for the HTTPS enforcement and HSTS middleware.
 */

const { enforceHttps, hsts } = require('../src/middleware/https');

function makeReq(overrides = {}) {
  return {
    headers: { host: 'example.com' },
    protocol: 'http',
    originalUrl: '/some/path?x=1',
    ...overrides,
  };
}

function makeRes() {
  return {
    redirect: jest.fn(),
    setHeader: jest.fn(),
  };
}

describe('https middleware', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalEnv;
    }
  });

  describe('enforceHttps', () => {
    it('short-circuits in non-production (calls next, no redirect)', () => {
      process.env.NODE_ENV = 'test';
      const req = makeReq({ headers: { host: 'example.com', 'x-forwarded-proto': 'http' } });
      const res = makeRes();
      const next = jest.fn();

      enforceHttps(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.redirect).not.toHaveBeenCalled();
    });

    it('redirects to https when x-forwarded-proto is http', () => {
      process.env.NODE_ENV = 'production';
      const req = makeReq({ headers: { host: 'example.com', 'x-forwarded-proto': 'http' } });
      const res = makeRes();
      const next = jest.fn();

      enforceHttps(req, res, next);

      expect(res.redirect).toHaveBeenCalledWith(301, 'https://example.com/some/path?x=1');
      expect(next).not.toHaveBeenCalled();
    });

    it('redirects to https when req.protocol is http and no header is present', () => {
      process.env.NODE_ENV = 'production';
      const req = makeReq({ protocol: 'http' });
      const res = makeRes();
      const next = jest.fn();

      enforceHttps(req, res, next);

      expect(res.redirect).toHaveBeenCalledWith(301, 'https://example.com/some/path?x=1');
      expect(next).not.toHaveBeenCalled();
    });

    it('passes through when x-forwarded-proto is https', () => {
      process.env.NODE_ENV = 'production';
      const req = makeReq({ headers: { host: 'example.com', 'x-forwarded-proto': 'https' } });
      const res = makeRes();
      const next = jest.fn();

      enforceHttps(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.redirect).not.toHaveBeenCalled();
    });
  });

  describe('hsts', () => {
    it('sets the exact HSTS header in production', () => {
      process.env.NODE_ENV = 'production';
      const req = makeReq();
      const res = makeRes();
      const next = jest.fn();

      hsts(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains; preload'
      );
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('does not set the header in non-production', () => {
      process.env.NODE_ENV = 'test';
      const req = makeReq();
      const res = makeRes();
      const next = jest.fn();

      hsts(req, res, next);

      expect(res.setHeader).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);
    });
  });
});
