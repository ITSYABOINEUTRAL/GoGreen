'use strict';

const { SPA_ENDPOINTS } = require('../openapi/spaPaths');

describe('SPA_ENDPOINTS map', () => {
  it('has only [method, path, operationId] tuples with a lowercase method and a leading-slash path', () => {
    for (const entry of SPA_ENDPOINTS) {
      expect(entry).toHaveLength(3);

      const [method, path, operationId] = entry;
      expect(method).toMatch(/^[a-z]+$/);
      expect(path.startsWith('/')).toBe(true);
      expect(typeof operationId).toBe('string');
      expect(operationId.length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate (method, path) pairs', () => {
    const seen = new Set();
    const duplicates = [];
    for (const [method, path] of SPA_ENDPOINTS) {
      const key = `${method} ${path}`;
      if (seen.has(key)) duplicates.push(key);
      seen.add(key);
    }

    expect(duplicates).toEqual([]);
  });

  it('has no duplicate operationIds', () => {
    const seen = new Set();
    const duplicates = [];
    for (const [, , operationId] of SPA_ENDPOINTS) {
      if (seen.has(operationId)) duplicates.push(operationId);
      seen.add(operationId);
    }

    expect(duplicates).toEqual([]);
  });
});
