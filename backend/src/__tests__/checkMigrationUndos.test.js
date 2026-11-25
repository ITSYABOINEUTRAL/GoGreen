'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { findMissing } = require('../../scripts/check-migration-undos');

describe('check-migration-undos', () => {
  it('passes when paired and fails when unpaired (outside allowlist)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'undo-check-'));
    try {
      fs.writeFileSync(path.join(dir, '001_ok.sql'), '--');
      fs.writeFileSync(path.join(dir, '001_ok.undo.sql'), '--');
      fs.writeFileSync(path.join(dir, '002_gap.sql'), '--');
      expect(findMissing(dir, new Set())).toEqual(['002_gap.sql']);
      expect(findMissing(dir, new Set(['002_gap.sql']))).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });
});
