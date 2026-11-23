#!/usr/bin/env node
/**
 * CI script: verifies that every spec file under the e2e directories is
 * matched by at least one Playwright project's testMatch pattern.
 *
 * Usage: node scripts/check-e2e-matrix.js
 * Exit code 1 when any spec file is not covered by the matrix.
 */

'use strict';

const path = require('path');
const { getUnmatchedSpecs } = require('./check-e2e-matrix-utils');

const ROOT = path.resolve(__dirname, '..');
const SPEC_DIRS = ['tests/e2e', 'src/test/e2e'];
const CONFIG_PATH = path.join(ROOT, 'playwright.config.js');

async function main() {
  const unmatched = await getUnmatchedSpecs({ root: ROOT, specDirs: SPEC_DIRS, configPath: CONFIG_PATH });

  if (unmatched.length === 0) {
    console.log('✅ All spec files are covered by the Playwright project matrix.');
    process.exit(0);
  }

  console.error('❌ The following spec files are not matched by any Playwright project:');
  unmatched.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}

main().catch((err) => {
  console.error('check-e2e-matrix failed:', err.message);
  process.exit(1);
});
