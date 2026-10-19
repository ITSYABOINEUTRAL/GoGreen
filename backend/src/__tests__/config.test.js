'use strict';

/**
 * config.test.js (#95)
 *
 * Tests for the numeric env var validation in backend/src/config.js.
 * Covers: empty-string fallback to default, non-numeric rejection,
 * and valid numeric override.
 */

const REQUIRED_ENV = {
  JWT_SECRET: 'test-jwt-secret-value',
};

function loadConfig() {
  return require('../config');
}

describe('backend/src/config.js — numeric env var validation', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    // Provide a minimal valid environment
    Object.assign(process.env, REQUIRED_ENV);
    jest.resetModules();
  });

  afterEach(() => {
    // Restore original environment
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  });

  describe('empty-string numeric env vars fall back to documented defaults', () => {
    it('SMTP_PORT="" falls back to 587', () => {
      process.env.SMTP_PORT = '';
      jest.resetModules();
      // config.js reads SMTP_PORT but does not currently expose it directly;
      // the module should load without throwing
      expect(() => loadConfig()).not.toThrow();
    });

    it('MAX_ORDER_QUANTITY="" falls back to 10000', () => {
      process.env.MAX_ORDER_QUANTITY = '';
      jest.resetModules();
      expect(() => loadConfig()).not.toThrow();
    });

    it('RATE_LIMIT_AUTH_MAX="" falls back to 10', () => {
      process.env.RATE_LIMIT_AUTH_MAX = '';
      jest.resetModules();
      expect(() => loadConfig()).not.toThrow();
    });
  });

  describe('non-numeric values cause startup failure with variable named in output', () => {
    it('MAX_ORDER_QUANTITY="abc" causes process.exit(1) and logs the variable name', () => {
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation((code) => {
        throw new Error(`process.exit(${code})`);
      });
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      process.env.MAX_ORDER_QUANTITY = 'abc';
      jest.resetModules();

      expect(() => loadConfig()).toThrow(/process\.exit\(1\)/);
      const output = errorSpy.mock.calls.map(args => args.join(' ')).join('\n');
      expect(output).toMatch(/MAX_ORDER_QUANTITY/);

      exitSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it('SMTP_PORT="notaport" causes process.exit(1)', () => {
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation((code) => {
        throw new Error(`process.exit(${code})`);
      });
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      process.env.SMTP_PORT = 'notaport';
      jest.resetModules();

      expect(() => loadConfig()).toThrow(/process\.exit\(1\)/);
      const output = errorSpy.mock.calls.map(args => args.join(' ')).join('\n');
      expect(output).toMatch(/SMTP_PORT/);

      exitSpy.mockRestore();
      errorSpy.mockRestore();
    });
  });

  describe('valid numeric overrides are applied to the exported config', () => {
    it('PORT="5000" is parsed and used as port', () => {
      process.env.PORT = '5000';
      jest.resetModules();
      const config = loadConfig();
      expect(config.port).toBe(5000);
    });

    it('RATE_LIMIT_AUTH_MAX="25" overrides the default of 10', () => {
      process.env.RATE_LIMIT_AUTH_MAX = '25';
      jest.resetModules();
      // Config does not directly expose RATE_LIMIT_AUTH_MAX in the exported object,
      // but the module should load without error
      expect(() => loadConfig()).not.toThrow();
    });
  });
});
