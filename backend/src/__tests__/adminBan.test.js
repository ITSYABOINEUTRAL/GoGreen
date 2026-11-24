/**
 * adminBan.test.js — #273
 *
 * Tests for POST /api/admin/users/:id/ban and DELETE /api/admin/users/:id/ban
 * in src/routes/adminBan.js.
 */

jest.mock('../db/schema');
jest.mock('../utils/auditLog', () => ({
  writeAuditLog: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../middleware/requireAdmin', () => (req, res, next) => {
  req.user = { id: 1 };
  next();
});

const db = require('../db/schema');
const { writeAuditLog } = require('../utils/auditLog');
const request = require('supertest');
const express = require('express');
const banRouter = require('../routes/adminBan');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', banRouter);
  return app;
}

const app = buildApp();

describe('POST /api/admin/users/:id/ban', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    writeAuditLog.mockResolvedValue(undefined);
  });

  it('returns 404 when user is not found', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post('/api/admin/users/99/ban').send({ reason: 'spam' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('User not found.');
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it('returns 400 when target user is an admin', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 2, role: 'admin', banned_at: null, ban_reason: null }] });

    const res = await request(app).post('/api/admin/users/2/ban').send({ reason: 'test' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Cannot ban an admin account.');
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it('returns 409 when user is already banned', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ id: 3, role: 'buyer', banned_at: new Date().toISOString(), ban_reason: 'spam' }],
    });

    const res = await request(app).post('/api/admin/users/3/ban').send({ reason: 'spam' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('User is already banned.');
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it('returns 200 and calls writeAuditLog with correct before/after on success', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 4, role: 'buyer', banned_at: null, ban_reason: null }] })
      .mockResolvedValueOnce({ rows: [] }); // UPDATE

    const res = await request(app).post('/api/admin/users/4/ban').send({ reason: 'violation' });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('4');

    expect(writeAuditLog).toHaveBeenCalledTimes(1);
    const call = writeAuditLog.mock.calls[0][0];
    expect(call.action).toBe('ban_user');
    expect(call.targetId).toBe('4');
    expect(call.before).toEqual({ banned_at: null, ban_reason: null });
    expect(call.after.ban_reason).toBe('violation');
    expect(call.after.banned_at).toBeTruthy();
  });

  it('returns 500 when db.query rejects', async () => {
    db.query.mockRejectedValueOnce(new Error('DB failure'));

    const res = await request(app).post('/api/admin/users/5/ban').send({});

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error.');
  });
});

describe('DELETE /api/admin/users/:id/ban', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    writeAuditLog.mockResolvedValue(undefined);
  });

  it('returns 404 when user is not found', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).delete('/api/admin/users/99/ban');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('User not found.');
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it('returns 409 when user is not banned', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 2, banned_at: null, ban_reason: null }] });

    const res = await request(app).delete('/api/admin/users/2/ban');

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('User is not banned.');
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it('returns 200 and calls writeAuditLog with correct before/after on success', async () => {
    const bannedAt = new Date().toISOString();
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 3, banned_at: bannedAt, ban_reason: 'spam' }] })
      .mockResolvedValueOnce({ rows: [] }); // UPDATE

    const res = await request(app).delete('/api/admin/users/3/ban');

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('3');

    expect(writeAuditLog).toHaveBeenCalledTimes(1);
    const call = writeAuditLog.mock.calls[0][0];
    expect(call.action).toBe('unban_user');
    expect(call.targetId).toBe('3');
    expect(call.before).toEqual({ banned_at: bannedAt, ban_reason: 'spam' });
    expect(call.after).toEqual({ banned_at: null, ban_reason: null });
  });

  it('returns 500 when db.query rejects', async () => {
    db.query.mockRejectedValueOnce(new Error('DB failure'));

    const res = await request(app).delete('/api/admin/users/5/ban');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error.');
  });
});
