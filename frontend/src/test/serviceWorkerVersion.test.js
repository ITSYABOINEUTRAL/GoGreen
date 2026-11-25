import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { serviceWorkerVersion } from '../../vite.config.js';

describe('serviceWorkerVersion plugin', () => {
  let dir;
  let prevCwd;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sw-stamp-'));
    mkdirSync(join(dir, 'dist'));
    prevCwd = process.cwd();
    process.chdir(dir);
  });

  afterEach(() => {
    process.chdir(prevCwd);
    rmSync(dir, { recursive: true, force: true });
  });

  it('throws when dist/sw.js is missing', () => {
    const plugin = serviceWorkerVersion();
    expect(() => plugin.closeBundle()).toThrow(/missing dist\/sw\.js/);
  });

  it('throws when version placeholder is absent', () => {
    writeFileSync(join(dir, 'dist/sw.js'), 'const APP_VERSION = "nope";');
    const plugin = serviceWorkerVersion();
    expect(() => plugin.closeBundle()).toThrow(/placeholder not found/);
  });

  it('stamps the version placeholder', () => {
    writeFileSync(
      join(dir, 'dist/sw.js'),
      "const APP_VERSION = self.__APP_VERSION__ || '1.0.0';\n",
    );
    const plugin = serviceWorkerVersion();
    plugin.closeBundle();
    const out = readFileSync(join(dir, 'dist/sw.js'), 'utf8');
    expect(out).not.toMatch(/self\.__APP_VERSION__/);
    expect(out.length).toBeGreaterThan(0);
  });
});
