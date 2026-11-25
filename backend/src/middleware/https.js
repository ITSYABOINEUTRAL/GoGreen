/**
 * HTTPS enforcement middleware.
 *
 * - In production: redirects plain HTTP requests to HTTPS.
 * - Adds HSTS header so browsers remember to always use HTTPS.
 * - Skipped entirely in development/test to avoid breaking local workflows.
 */

const HSTS_MAX_AGE = 31536000; // 1 year in seconds

function buildHttpsLocation(req) {
  // Prefer hostname + port so a raw Host header with a port stays well-formed.
  const hostname = req.hostname || (req.headers.host || '').split(':')[0] || 'localhost';
  const hostHeader = req.headers.host || hostname;
  const hasPort = /:\d+$/.test(hostHeader);
  const port = hasPort ? hostHeader.slice(hostHeader.lastIndexOf(':') + 1) : (req.port || null);
  const host = port && String(port) !== '443' ? `${hostname}:${port}` : hostname;
  return `https://${host}${req.originalUrl || ''}`;
}

function enforceHttps(req, res, next) {
  if (process.env.NODE_ENV !== 'production') return next();

  // Trust X-Forwarded-Proto set by reverse proxies (Nginx, Heroku, etc.)
  const proto = req.headers['x-forwarded-proto'] || req.protocol;

  if (proto !== 'https') {
    return res.redirect(301, buildHttpsLocation(req));
  }

  next();
}

function hsts(req, res, next) {
  if (process.env.NODE_ENV !== 'production') return next();

  res.setHeader('Strict-Transport-Security', `max-age=${HSTS_MAX_AGE}; includeSubDomains; preload`);

  next();
}

module.exports = { enforceHttps, hsts, buildHttpsLocation };
