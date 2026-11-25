/**
 * Tests for scripts/check-e2e-matrix-utils.js (Issue #258)
 *
 * Verifies that getUnmatchedSpecs correctly identifies spec files that are
 * not covered by any Playwright project testMatch pattern.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { matchesGlob } from '../../../../scripts/check-e2e-matrix-utils.js';

// ---------------------------------------------------------------------------
// Unit tests for the glob-matching helper
// ---------------------------------------------------------------------------
describe('matchesGlob', () => {
  it('matches a double-star glob against a nested path', () => {
    expect(matchesGlob('src/test/e2e/theme.e2e.js', '**/*.e2e.js')).toBe(true);
  });

  it('matches a path directly against a testDir-prefixed pattern', () => {
    expect(matchesGlob('src/test/e2e/theme.e2e.js', 'src/test/e2e/**/*.e2e.js')).toBe(true);
  });

  it('does NOT match a spec file that uses .spec.js against a *.e2e.js pattern', () => {
    expect(matchesGlob('tests/e2e/auth-cache-isolation.spec.js', 'src/test/e2e/**/*.e2e.js')).toBe(false);
  });

  it('matches a .spec.js file against a **/*.spec.js pattern', () => {
    expect(matchesGlob('tests/e2e/auth-cache-isolation.spec.js', '**/*.spec.js')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Integration-style tests for getUnmatchedSpecs using a fixture filesystem
// ---------------------------------------------------------------------------
import { promises as fsp } from 'fs';
import os from 'os';
import path from 'path';
import { getUnmatchedSpecs } from '../../../../scripts/check-e2e-matrix-utils.js';

async function mkTmpDir() {
  return fsp.mkdtemp(path.join(os.tmpdir(), 'e2e-matrix-test-'));
}

async function writeFile(dir, relPath, content = '') {
  const full = path.join(dir, relPath);
  await fsp.mkdir(path.dirname(full), { recursive: true });
  await fsp.writeFile(full, content);
}

describe('getUnmatchedSpecs', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await mkTmpDir();
  });

  afterEach(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  it('reports no unmatched files when every spec is covered', async () => {
    // Create a minimal playwright config that covers *.e2e.js under src/test/e2e
    const configContent = `
export default {
  testDir: './src/test/e2e',
  testMatch: '**/*.e2e.js',
  projects: [{ name: 'chromium' }],
};
`;
    await writeFile(tmpDir, 'playwright.config.js', configContent);
    await writeFile(tmpDir, 'src/test/e2e/theme.e2e.js');

    const unmatched = await getUnmatchedSpecs({
      root: tmpDir,
      specDirs: ['src/test/e2e'],
      configPath: path.join(tmpDir, 'playwright.config.js'),
    });

    expect(unmatched).toHaveLength(0);
  });

  it('reports a spec file that no project matches', async () => {
    // Config only covers *.e2e.js; we add a *.spec.js fixture that is unmatched
    const configContent = `
export default {
  testDir: './src/test/e2e',
  testMatch: '**/*.e2e.js',
  projects: [{ name: 'chromium' }],
};
`;
    await writeFile(tmpDir, 'playwright.config.js', configContent);
    await writeFile(tmpDir, 'src/test/e2e/theme.e2e.js');
    // This fixture should be unmatched because the config uses *.e2e.js only
    await writeFile(tmpDir, 'tests/e2e/unmatched-fixture.spec.js');

    const unmatched = await getUnmatchedSpecs({
      root: tmpDir,
      specDirs: ['src/test/e2e', 'tests/e2e'],
      configPath: path.join(tmpDir, 'playwright.config.js'),
    });

    expect(unmatched.some((f) => f.includes('unmatched-fixture.spec.js'))).toBe(true);
    // The .e2e.js file should be matched
    expect(unmatched.some((f) => f.includes('theme.e2e.js'))).toBe(false);
  });
});
