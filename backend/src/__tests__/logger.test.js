const path = require('path');

const LOGGER_PATH = require.resolve('../logger');

function loadLogger({ production }) {
  jest.resetModules();
  jest.doMock('../config', () => ({ isProduction: production }));
  return require('../logger');
}

describe('logger', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('../config');
    jest.restoreAllMocks();
  });

  it('creates the logs directory before File transports in production', () => {
    const mkdirSync = jest.spyOn(require('fs'), 'mkdirSync').mockImplementation(() => undefined);

    loadLogger({ production: true });

    expect(mkdirSync).toHaveBeenCalledWith(
      path.join(process.cwd(), 'logs'),
      { recursive: true }
    );
  });

  it('does not create the logs directory outside production', () => {
    const mkdirSync = jest.spyOn(require('fs'), 'mkdirSync').mockImplementation(() => undefined);

    loadLogger({ production: false });

    expect(mkdirSync).not.toHaveBeenCalled();
  });

  it('handles a simulated transport error without throwing', () => {
    jest.spyOn(require('fs'), 'mkdirSync').mockImplementation(() => undefined);
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const logger = loadLogger({ production: true });

    const fileTransports = logger.transports.filter(
      (transport) => transport.constructor.name === 'File'
    );
    expect(fileTransports.length).toBeGreaterThan(0);

    const simulatedError = new Error('simulated transport failure');
    fileTransports.forEach((transport) => {
      expect(() => transport.emit('error', simulatedError)).not.toThrow();
    });

    expect(consoleError).toHaveBeenCalled();
  });
});
