'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../migrations');

/** Known pre-existing gaps — do not add new entries lightly. */
const ALLOWLIST = new Set([
  '020_contract_invocations_index.sql',
]);

function findMissing(migrationsDir = ROOT, allowlist = ALLOWLIST) {
  if (!fs.existsSync(migrationsDir)) return [];
  const files = fs.readdirSync(migrationsDir);
  const migrations = files.filter(
    (f) => /^\d+_.+\.sql$/.test(f) && !f.endsWith('.undo.sql') && !f.includes('.undo.'),
  );
  const missing = [];
  for (const f of migrations.sort()) {
    if (allowlist.has(f)) continue;
    const undo = f.replace(/\.sql$/, '.undo.sql');
    if (!files.includes(undo)) missing.push(f);
  }
  return missing;
}

function main() {
  const missing = findMissing();
  if (missing.length) {
    console.error('Migrations missing .undo.sql counterparts:');
    for (const f of missing) console.error('  ' + f);
    process.exit(1);
  }
  console.log('All non-allowlisted migrations have .undo.sql files.');
}

if (require.main === module) main();

module.exports = { findMissing, ALLOWLIST };
