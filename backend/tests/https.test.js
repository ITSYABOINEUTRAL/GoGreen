const { enforceHttps, hsts } = require('../src/middleware/https');

function mockReqRes(proto, host = 'example.com', url = '/api/v1/health') {
  const req = {
    headers: { 'x-forwarded-proto': proto, host },
    protocol: proto,
    originalUrl: url,
  };
  const res = {
    redirected: null,
    headers: {},
    redirect(code, location) {
      this.redirected = { code, location };
    },
    setHeader(name, value) {
      this.headers[name] = value;
    },
  };
  const next = jest.fn();
  return { req, res, next };
}

describe('enforceHttps middleware', () => {
  const OLD_ENV = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = OLD_ENV;
  });

  it('skips redirect in development', () => {
    process.env.NODE_ENV = 'development';
    const { req, res, next } = mockReqRes('http');
    enforceHttps(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.redirected).toBeNull();
  });

  it('redirects HTTP to HTTPS in production', () => {
    process.env.NODE_ENV = 'production';
    const { req, res, next } = mockReqRes('http');
    enforceHttps(req, res, next);
    expect(res.redirected).toEqual({
      code: 301,
      location: 'https://example.com/api/v1/health',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next for HTTPS requests in production', () => {
    process.env.NODE_ENV = 'production';
    const { req, res, next } = mockReqRes('https');
    enforceHttps(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.redirected).toBeNull();
  });
});

describe('hsts middleware', () => {
  const OLD_ENV = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = OLD_ENV;
  });

  it('does not set HSTS header outside production', () => {
    process.env.NODE_ENV = 'development';
    const { req, res, next } = mockReqRes('https');
    hsts(req, res, next);
    expect(res.headers['Strict-Transport-Security']).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it('sets HSTS header in production', () => {
    process.env.NODE_ENV = 'production';
    const { req, res, next } = mockReqRes('https');
    hsts(req, res, next);
    expect(res.headers['Strict-Transport-Security']).toMatch(/max-age=31536000/);
    expect(res.headers['Strict-Transport-Security']).toMatch(/includeSubDomains/);
    expect(res.headers['Strict-Transport-Security']).toMatch(/preload/);
    expect(next).toHaveBeenCalled();
  });
});

describe('enforceHttps edge cases', () => {
  const OLD_ENV = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = OLD_ENV;
  });

  it('falls back to req.protocol when x-forwarded-proto is missing', () => {
    process.env.NODE_ENV = 'production';
    const req = {
      headers: { host: 'example.com' },
      protocol: 'http',
      hostname: 'example.com',
      originalUrl: '/api/v1/health',
    };
    const res = {
      redirected: null,
      redirect(code, location) {
        this.redirected = { code, location };
      },
    };
    const next = jest.fn();
    enforceHttps(req, res, next);
    expect(res.redirected).toEqual({
      code: 301,
      location: 'https://example.com/api/v1/health',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('keeps a non-default port in the Location header', () => {
    process.env.NODE_ENV = 'production';
    const req = {
      headers: { 'x-forwarded-proto': 'http', host: 'example.com:8080' },
      protocol: 'http',
      hostname: 'example.com',
      originalUrl: '/x',
    };
    const res = {
      redirected: null,
      redirect(code, location) {
        this.redirected = { code, location };
      },
    };
    const next = jest.fn();
    enforceHttps(req, res, next);
    expect(res.redirected.location).toBe('https://example.com:8080/x');
  });

  it('does not redirect an already-HTTPS request with a port', () => {
    process.env.NODE_ENV = 'production';
    const req = {
      headers: { 'x-forwarded-proto': 'https', host: 'example.com:8443' },
      protocol: 'https',
      hostname: 'example.com',
      originalUrl: '/x',
    };
    const res = { redirected: null, redirect() { this.redirected = true; } };
    const next = jest.fn();
    enforceHttps(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.redirected).toBeNull();
  });
});
