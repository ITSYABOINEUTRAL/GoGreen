const fs = require('fs');
const path = require('path');

const modelsDir = path.join(__dirname, '../models');
const barrel = require('../models');

describe('models barrel', () => {
  const modelFiles = fs
    .readdirSync(modelsDir)
    .filter((file) => file.endsWith('.js') && file !== 'index.js');

  it('has at least one model file', () => {
    expect(modelFiles.length).toBeGreaterThan(0);
  });

  modelFiles.forEach((file) => {
    const name = path.basename(file, '.js');

    it(`exports ${name} from the barrel`, () => {
      expect(barrel[name]).toBeDefined();
      expect(typeof barrel[name]).toBe('function');
    });
  });

  it('exports WaitlistEntry as a constructor', () => {
    expect(barrel.WaitlistEntry).toBeDefined();
    expect(typeof barrel.WaitlistEntry).toBe('function');
  });
});
