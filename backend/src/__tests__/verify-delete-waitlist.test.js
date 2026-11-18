'use strict';

const express = require('express');

jest.mock('../db/schema', () => ({ query: jest.fn(), ready: Promise.resolve() }));
jest.mock('../cache', () => ({ delByPattern: jest.fn(), get: jest.fn(), set: jest.fn() }));
jest.mock('../middleware/auth', () => (req, _res, next) => {
  req.user = { id: 1, role: 'buyer' };
  next();
});
jest.mock('../services/WaitlistService', () =>
  jest.fn().mockImplementation(() => ({ leaveWaitlist: jest.fn().mockResolvedValue({ success: true, message: 'ok' }) })),
);
jest.mock('../services/AutomaticOrderProcessor', () => jest.fn());
jest.mock('../utils/mailer', () => ({ sendBackInStockEmail: jest.fn() }));
jest.mock('../utils/stockUpdates', () => ({ stockClients: new Map(), broadcastStockUpdate: jest.fn() }));

const productsRouter = require('../routes/products');

function collectRoutes(router, acc = []) {
  for (const layer of router.stack || []) {
    if (layer.route && layer.route.path) {
      acc.push({ path: layer.route.path, methods: layer.route.methods });
    } else if (layer.name === 'router' && layer.handle) {
      collectRoutes(layer.handle, acc);
    }
  }
  return acc;
}

describe('DELETE /:id/waitlist route', () => {
  it('is registered on the products router without regexp parsing', () => {
    const routes = collectRoutes(productsRouter);
    const del = routes.find((r) => r.methods.delete && String(r.path).includes('waitlist'));
    expect(del).toBeTruthy();
    expect(del.path).toMatch(/waitlist/);
  });
});
