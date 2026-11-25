'use strict';

/**
 * Fail when listed demo/test scripts reference backend/src or frontend/src
 * paths that do not exist on disk.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');

const SCRIPTS = [
  'backend/demo-implementation.js',
  'backend/demo-restock-simple.js',
  'backend/demo-restock-integration.js',
  'backend/test-new-endpoints.js',
];

const PATH_RE = /(?:require\(['"](\.\/src\/[^'"]+)['"]\)|(backend\/src\/[A-Za-z0-9_./-]+|frontend\/src\/[A-Za-z0-9_./-]+))/g;

const missing = [];

for (const rel of SCRIPTS) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    missing.push(`${rel} (script itself missing)`);
    continue;
  }
  const text = fs.readFileSync(abs, 'utf8');
  const seen = new Set();
  let m;
  while ((m = PATH_RE.exec(text)) !== null) {
    const requireRel = m[1];
    const rooted = m[2];
    let target;
    if (requireRel) {
      target = path.resolve(path.dirname(abs), requireRel);
      // require('./src/...') may omit .js
      if (!fs.existsSync(target) && !fs.existsSync(target + '.js')) {
        const key = path.relative(ROOT, target);
        if (!seen.has(key)) {
          seen.add(key);
          missing.push(`${rel} -> ${key}`);
        }
      }
    } else if (rooted) {
      target = path.join(ROOT, rooted);
      const candidates = [target, target.endsWith('.js') ? target : target + '.js'];
      if (!candidates.some((c) => fs.existsSync(c))) {
        if (!seen.has(rooted)) {
          seen.add(rooted);
          missing.push(`${rel} -> ${rooted}`);
        }
      }
    }
  }
}

if (missing.length) {
  console.error('Missing script references:');
  for (const line of missing) console.error('  ' + line);
  process.exit(1);
}

console.log('All checked script references resolve.');
