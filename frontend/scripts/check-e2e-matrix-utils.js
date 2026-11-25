'use strict';

/**
 * Pure helper for check-e2e-matrix.js — importable in tests without side-effects.
 */

const fs = require('fs');
const path = require('path');

/**
 * Returns whether `filePath` matches a minimatch-style glob pattern.
 * We support the two patterns used by Playwright: `**\/*.e2e.js` and
 * `**\/*.spec.js`.  For full minimatch support the caller may pass its own
 * `matchFn`; the built-in handles the patterns actually used in this project.
 *
 * @param {string} filePath  - forward-slash relative path
 * @param {string} pattern   - glob pattern (may start with **)
 * @returns {boolean}
 */
function matchesGlob(filePath, pattern) {
  // Normalise separators
  const fp = filePath.replace(/\\/g, '/');
  const pat = pattern.replace(/\\/g, '/');

  // Convert glob to regex
  const escaped = pat
    .replace(/[.+^${}()|[\]\\]/g, (c) => (c === '*' ? c : `\\${c}`))
    .replace(/\*\*\//g, '(?:.+/)?')
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*');

  return new RegExp(`^${escaped}$`).test(fp);
}

/**
 * Glob all files under a directory recursively and return relative paths
 * (forward-slash separated) of files matching `pattern`.
 *
 * @param {string} dir      - absolute directory
 * @param {string} [match]  - optional suffix filter, e.g. '.js'
 * @returns {string[]}
 */
function walkDir(dir, match) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  function walk(current, rel) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(path.join(current, entry.name), relPath);
      } else if (!match || entry.name.endsWith(match)) {
        results.push(relPath);
      }
    }
  }

  walk(dir, '');
  return results;
}

/**
 * Returns the list of spec files (relative to `root`) that are not covered by
 * any project in the Playwright config.
 *
 * @param {{ root: string, specDirs: string[], configPath: string }} opts
 * @returns {Promise<string[]>}
 */
async function getUnmatchedSpecs({ root, specDirs, configPath }) {
  // Dynamically import the ESM playwright config to read projects + testMatch
  let playwrightConfig;
  try {
    // The config uses ESM `export default` — dynamic import works in Node ≥ 12
    const mod = await import(`file://${configPath}`);
    playwrightConfig = mod.default;
  } catch {
    // Fallback: attempt to read the testMatch directly from text if import fails
    playwrightConfig = null;
  }

  // Collect testMatch patterns from all projects
  const patterns = [];

  if (playwrightConfig) {
    const globalMatch = playwrightConfig.testMatch;
    const globalDir   = playwrightConfig.testDir;

    for (const project of (playwrightConfig.projects || [])) {
      const pm = project.testMatch || globalMatch || '**/*.spec.{js,ts}';
      const pd = project.testDir   || globalDir   || '.';
      const matchers = Array.isArray(pm) ? pm : [pm];
      for (const m of matchers) {
        // Prefix with the testDir to make pattern relative to root
        const prefix = pd.replace(/^\.\//, '').replace(/\\/g, '/');
        patterns.push(`${prefix}/${m}`);
      }
    }

    // If no per-project testMatch, also add the global one with globalDir
    if (patterns.length === 0 && globalMatch && globalDir) {
      const prefix = globalDir.replace(/^\.\//, '').replace(/\\/g, '/');
      const matchers = Array.isArray(globalMatch) ? globalMatch : [globalMatch];
      for (const m of matchers) {
        patterns.push(`${prefix}/${m}`);
      }
    }
  }

  // Collect all JS spec files from the declared directories
  const allSpecs = [];
  for (const dir of specDirs) {
    const absDir = path.join(root, dir);
    const files = walkDir(absDir, '.js');
    for (const f of files) {
      allSpecs.push(`${dir}/${f}`);
    }
  }

  // Find specs not covered by any pattern
  const unmatched = allSpecs.filter((spec) => {
    return !patterns.some((pat) => matchesGlob(spec, pat));
  });

  return unmatched;
}

module.exports = { getUnmatchedSpecs, matchesGlob, walkDir };
