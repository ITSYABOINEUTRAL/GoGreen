'use strict';

const fs = require('fs');
const path = require('path');

describe('ecosystem.config.js', () => {
  const config = require('../../../ecosystem.config.js');
  const app = config.apps[0];

  it('points PM2 at an existing backend entry relative to cwd', () => {
    const entry = path.resolve(__dirname, '../../..', app.cwd, app.script);
    expect(fs.existsSync(entry)).toBe(true);
  });

  it('keeps exec_mode and instances consistent', () => {
    if (app.exec_mode === 'fork') {
      expect(app.instances).toBe(1);
    } else if (app.exec_mode === 'cluster') {
      expect(app.instances === 'max' || Number(app.instances) > 1).toBe(true);
    }
  });

  it('defines non-empty log file paths', () => {
    expect(typeof app.out_file).toBe('string');
    expect(app.out_file.length).toBeGreaterThan(0);
    expect(typeof app.error_file).toBe('string');
    expect(app.error_file.length).toBeGreaterThan(0);
  });
});
