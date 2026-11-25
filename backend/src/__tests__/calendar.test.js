/**
 * calendar.test.js — #262
 *
 * Unit tests for the expandEntry and mergeRanges helpers exported from
 * backend/src/routes/calendar.js.
 */

const { expandEntry, mergeRanges } = require('../routes/calendar');

// Helper: build a minimal entry with sensible defaults
function entry(overrides = {}) {
  return {
    available_from: '2024-03-01',
    available_until: null,
    recurrence: 'none',
    recurrence_end: null,
    delete_instance_date: null,
    ...overrides,
  };
}

describe('expandEntry — none recurrence', () => {
  it('returns a single range clipped to the requested month', () => {
    const result = expandEntry(
      entry({ available_from: '2024-03-05', available_until: '2024-03-20' }),
      2024, 3
    );
    expect(result).toEqual([{ from: '2024-03-05', until: '2024-03-20' }]);
  });

  it('clips a range that starts before and ends after the month', () => {
    const result = expandEntry(
      entry({ available_from: '2024-02-20', available_until: '2024-04-10' }),
      2024, 3
    );
    expect(result).toEqual([{ from: '2024-03-01', until: '2024-03-31' }]);
  });

  it('returns [] when available_from is after the month', () => {
    const result = expandEntry(
      entry({ available_from: '2024-04-01', available_until: '2024-04-10' }),
      2024, 3
    );
    expect(result).toEqual([]);
  });

  it('returns [] for an invalid available_from (malformed date)', () => {
    const result = expandEntry(entry({ available_from: '2024-13-45' }), 2024, 3);
    expect(result).toEqual([]);
  });

  it('does not throw for empty string available_from and returns []', () => {
    expect(() => expandEntry(entry({ available_from: '' }), 2024, 3)).not.toThrow();
    expect(expandEntry(entry({ available_from: '' }), 2024, 3)).toEqual([]);
  });
});

describe('expandEntry — weekly recurrence', () => {
  it('generates occurrences every 7 days within the month', () => {
    const result = expandEntry(
      entry({
        available_from: '2024-03-01',
        available_until: '2024-03-01',
        recurrence: 'weekly',
        recurrence_end: '2024-03-29',
      }),
      2024, 3
    );
    const froms = result.map(r => r.from);
    expect(froms).toContain('2024-03-01');
    expect(froms).toContain('2024-03-08');
    expect(froms).toContain('2024-03-15');
    expect(froms).toContain('2024-03-22');
    expect(froms).toContain('2024-03-29');
  });

  it('stops at recurrence_end', () => {
    const result = expandEntry(
      entry({
        available_from: '2024-03-01',
        available_until: null,
        recurrence: 'weekly',
        recurrence_end: '2024-03-10',
      }),
      2024, 3
    );
    const froms = result.map(r => r.from);
    expect(froms).toContain('2024-03-01');
    expect(froms).toContain('2024-03-08');
    expect(froms).not.toContain('2024-03-15');
  });
});

describe('expandEntry — biweekly recurrence', () => {
  it('generates occurrences every 14 days', () => {
    const result = expandEntry(
      entry({
        available_from: '2024-03-01',
        available_until: null,
        recurrence: 'biweekly',
        recurrence_end: null,
      }),
      2024, 3
    );
    const froms = result.map(r => r.from);
    expect(froms).toContain('2024-03-01');
    expect(froms).toContain('2024-03-15');
    expect(froms).toContain('2024-03-29');
    expect(froms).not.toContain('2024-03-08');
  });
});

describe('expandEntry — monthly recurrence', () => {
  it('returns one occurrence per matching month', () => {
    const result = expandEntry(
      entry({
        available_from: '2024-02-05',
        available_until: null,
        recurrence: 'monthly',
        recurrence_end: null,
      }),
      2024, 3
    );
    const froms = result.map(r => r.from);
    expect(froms).toContain('2024-03-05');
    expect(froms).toHaveLength(1);
  });
});

describe('expandEntry — delete_instance_date', () => {
  it('skips the deleted instance date and keeps other occurrences', () => {
    const result = expandEntry(
      entry({
        available_from: '2024-03-01',
        available_until: null,
        recurrence: 'weekly',
        recurrence_end: '2024-03-22',
        delete_instance_date: '2024-03-08',
      }),
      2024, 3
    );
    const froms = result.map(r => r.from);
    expect(froms).toContain('2024-03-01');
    expect(froms).not.toContain('2024-03-08');
    expect(froms).toContain('2024-03-15');
    expect(froms).toContain('2024-03-22');
  });
});

describe('mergeRanges', () => {
  it('returns [] for empty input', () => {
    expect(mergeRanges([])).toEqual([]);
  });

  it('leaves disjoint ranges separate', () => {
    const ranges = [
      { from: '2024-03-01', until: '2024-03-05' },
      { from: '2024-03-10', until: '2024-03-15' },
    ];
    expect(mergeRanges(ranges)).toEqual(ranges);
  });

  it('merges overlapping ranges', () => {
    const ranges = [
      { from: '2024-03-01', until: '2024-03-10' },
      { from: '2024-03-07', until: '2024-03-15' },
    ];
    expect(mergeRanges(ranges)).toEqual([{ from: '2024-03-01', until: '2024-03-15' }]);
  });

  it('merges adjacent ranges (touching boundary)', () => {
    const ranges = [
      { from: '2024-03-01', until: '2024-03-10' },
      { from: '2024-03-10', until: '2024-03-20' },
    ];
    expect(mergeRanges(ranges)).toEqual([{ from: '2024-03-01', until: '2024-03-20' }]);
  });

  it('merges multiple overlapping ranges into one', () => {
    const ranges = [
      { from: '2024-03-05', until: '2024-03-12' },
      { from: '2024-03-01', until: '2024-03-08' },
      { from: '2024-03-10', until: '2024-03-20' },
    ];
    expect(mergeRanges(ranges)).toEqual([{ from: '2024-03-01', until: '2024-03-20' }]);
  });

  it('does not add or remove items from the input array', () => {
    const ranges = [
      { from: '2024-03-05', until: '2024-03-10' },
      { from: '2024-03-01', until: '2024-03-07' },
    ];
    const originalLength = ranges.length;
    mergeRanges(ranges);
    expect(ranges.length).toBe(originalLength);
  });
});
