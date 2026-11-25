'use strict';

const crypto = require('crypto');

describe('keyPair / publicKeyHex / sign', () => {
  afterEach(() => {
    delete process.env.NETWORK_SIGNING_SECRET;
    delete process.env.JWT_SECRET;
  });

  it('keyPair() throws when neither NETWORK_SIGNING_SECRET nor JWT_SECRET is set', () => {
    delete process.env.NETWORK_SIGNING_SECRET;
    delete process.env.JWT_SECRET;
    jest.resetModules();
    const mod = require('../routes/network');
    mod._resetKeyPair();
    expect(() => mod._keyPairFn()).toThrow(/NETWORK_SIGNING_SECRET or JWT_SECRET must be configured/);
  });

  it('publicKeyHex() returns 64 lowercase hex chars', () => {
    process.env.NETWORK_SIGNING_SECRET = 'test-network-secret-abc123';
    jest.resetModules();
    const mod = require('../routes/network');
    mod._resetKeyPair();
    const hex = mod._publicKeyHex();
    expect(hex).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(hex)).toBe(true);
  });

  it('publicKeyHex() is stable across calls', () => {
    process.env.NETWORK_SIGNING_SECRET = 'test-network-secret-abc123';
    jest.resetModules();
    const mod = require('../routes/network');
    mod._resetKeyPair();
    const hex1 = mod._publicKeyHex();
    const hex2 = mod._publicKeyHex();
    expect(hex1).toBe(hex2);
  });

  it('sign() produces a verifiable Ed25519 signature', () => {
    const secret = 'test-network-secret-abc123';
    process.env.NETWORK_SIGNING_SECRET = secret;
    jest.resetModules();
    const mod = require('../routes/network');
    mod._resetKeyPair();

    const message = 'GET https://example.com/api/products 1700000000000';
    const sigHex = mod._sign(message);
    const sigBuf = Buffer.from(sigHex, 'hex');

    const seedBuf = crypto.createHash('sha256').update(secret).digest();
    const pkcs8Header = Buffer.from('302e020100300506032b657004220420', 'hex');
    const pkcs8Der = Buffer.concat([pkcs8Header, seedBuf]);
    const privKey = crypto.createPrivateKey({ key: pkcs8Der, format: 'der', type: 'pkcs8' });
    const pubKey = crypto.createPublicKey(privKey);

    expect(crypto.verify(null, Buffer.from(message), pubKey, sigBuf)).toBe(true);
  });

  it('falls back to JWT_SECRET when NETWORK_SIGNING_SECRET is not set', () => {
    delete process.env.NETWORK_SIGNING_SECRET;
    process.env.JWT_SECRET = 'fallback-jwt-secret-xyz';
    jest.resetModules();
    const mod = require('../routes/network');
    mod._resetKeyPair();
    const hex = mod._publicKeyHex();
    expect(hex).toHaveLength(64);
  });
});

describe('isPrivateAddress', () => {
  let isPrivateAddress;

  beforeAll(() => {
    process.env.NETWORK_SIGNING_SECRET = 'test-secret';
    jest.resetModules();
    isPrivateAddress = require('../routes/network')._isPrivateAddress;
  });

  afterAll(() => {
    delete process.env.NETWORK_SIGNING_SECRET;
  });

  const privateAddresses = [
    ['127.0.0.1', 'IPv4 loopback'],
    ['10.1.2.3', 'RFC1918 10.x'],
    ['172.16.0.1', 'RFC1918 172.16.x'],
    ['192.168.1.1', 'RFC1918 192.168.x'],
    ['169.254.1.1', 'link-local'],
    ['100.64.0.1', 'CGNAT'],
    ['::1', 'IPv6 loopback'],
    ['fd00::1', 'IPv6 unique-local fd'],
    ['::ffff:127.0.0.1', 'IPv4-mapped loopback'],
  ];

  const publicAddresses = [
    ['8.8.8.8', 'Google DNS'],
    ['1.1.1.1', 'Cloudflare DNS'],
    ['2606:4700::1111', 'Cloudflare IPv6'],
  ];

  test.each(privateAddresses)('isPrivateAddress(%s) [%s] === true', (addr) => {
    expect(isPrivateAddress(addr)).toBe(true);
  });

  test.each(publicAddresses)('isPrivateAddress(%s) [%s] === false', (addr) => {
    expect(isPrivateAddress(addr)).toBe(false);
  });
});
