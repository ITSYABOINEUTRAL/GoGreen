'use strict';

const fs = require('fs');
const path = require('path');

describe('PM2 graceful shutdown alignment', () => {
  const eco = require('../../../ecosystem.config.js');
  const indexSrc = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');

  it('registers a SIGTERM handler that closes the HTTP server', () => {
    expect(indexSrc).toMatch(/process\.on\(\s*['"]SIGTERM['"]/);
    expect(indexSrc).toMatch(/server\.close/);
  });

  it('keeps CLOSE_TIMEOUT_MS below ecosystem kill_timeout', () => {
    const match = indexSrc.match(/CLOSE_TIMEOUT_MS\s*=\s*(\d+)/);
    expect(match).toBeTruthy();
    const closeTimeout = Number(match[1]);
    expect(eco.apps[0].kill_timeout).toBeGreaterThan(closeTimeout);
  });
});
