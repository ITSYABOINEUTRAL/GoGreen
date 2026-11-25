'use strict';

const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const {
  verifyWebhookSignature,
  webhookMiddleware,
} = require('../services/webhookVerify');

function sign(secret, rawBody) {
  return (
    'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  );
}

function mountApp(getSecret) {
  const app = express();
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf.toString('utf8');
      },
    })
  );
  app.post('/hook', webhookMiddleware(getSecret), (_req, res) => {
    res.status(200).json({ ok: true });
  });
  return app;
}

describe('verifyWebhookSignature', () => {
  const secret = 'test-secret';
  const body = '{"hello":"world"}';

  it('accepts a valid signature', () => {
    expect(verifyWebhookSignature(secret, body, sign(secret, body))).toBe(true);
  });

  it('rejects a wrong secret', () => {
    expect(verifyWebhookSignature(secret, body, sign('other', body))).toBe(false);
  });

  it('rejects a header without sha256= prefix', () => {
    expect(verifyWebhookSignature(secret, body, 'deadbeef')).toBe(false);
  });

  it('rejects a length-mismatched signature without throwing', () => {
    expect(verifyWebhookSignature(secret, body, 'sha256=ab')).toBe(false);
  });
});

describe('webhookMiddleware', () => {
  const secret = 'hook-secret';
  const body = { event: 'ping' };
  const raw = JSON.stringify(body);

  it('returns 401 when signature header is missing', async () => {
    const app = mountApp(async () => secret);
    const res = await request(app).post('/hook').send(body);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('invalid_signature');
  });

  it('returns 400 replay_detected for a stale timestamp', async () => {
    const app = mountApp(async () => secret);
    const stale = Date.now() - 10 * 60 * 1000;
    const res = await request(app)
      .post('/hook')
      .set('x-webhook-signature', sign(secret, raw))
      .set('x-webhook-timestamp', String(stale))
      .send(body);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('replay_detected');
  });

  it('returns 400 replay_detected for a non-numeric timestamp', async () => {
    const app = mountApp(async () => secret);
    const res = await request(app)
      .post('/hook')
      .set('x-webhook-signature', sign(secret, raw))
      .set('x-webhook-timestamp', 'not-a-number')
      .send(body);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('replay_detected');
  });

  it('returns 500 when getSecret rejects', async () => {
    const app = mountApp(async () => {
      throw new Error('lookup failed');
    });
    const res = await request(app)
      .post('/hook')
      .set('x-webhook-signature', sign(secret, raw))
      .set('x-webhook-timestamp', String(Date.now()))
      .send(body);
    expect(res.status).toBe(500);
  });

  it('returns 401 when getSecret returns empty', async () => {
    const app = mountApp(async () => undefined);
    const res = await request(app)
      .post('/hook')
      .set('x-webhook-signature', sign(secret, raw))
      .set('x-webhook-timestamp', String(Date.now()))
      .send(body);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('invalid_signature');
  });

  it('calls next on a valid signature within the replay window', async () => {
    const app = mountApp(async () => secret);
    const res = await request(app)
      .post('/hook')
      .set('x-webhook-signature', sign(secret, raw))
      .set('x-webhook-timestamp', String(Date.now()))
      .send(body);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
