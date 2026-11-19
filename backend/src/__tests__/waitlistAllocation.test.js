'use strict';

const { allocateWaitlistStock } = require('../examples/waitlist-usage');

describe('allocateWaitlistStock (FIFO restock allocation)', () => {
  const entries = [
    { buyer_id: 1, quantity: 2 },
    { buyer_id: 2, quantity: 5 },
    { buyer_id: 3, quantity: 1 },
  ];

  it('allocates every entry in FIFO order when stock covers them all', () => {
    const { allocations, remainingStock } = allocateWaitlistStock(entries, 10);

    expect(allocations).toEqual([
      { buyer_id: 1, quantity: 2 },
      { buyer_id: 2, quantity: 5 },
      { buyer_id: 3, quantity: 1 },
    ]);
    expect(remainingStock).toBe(2);
  });

  it('stops at the first entry that cannot be fully satisfied and skips the rest', () => {
    // Entry 3 would fit in the 4 units left, but FIFO stops at entry 2.
    const { allocations, remainingStock } = allocateWaitlistStock(entries, 6);

    expect(allocations).toEqual([{ buyer_id: 1, quantity: 2 }]);
    expect(remainingStock).toBe(4);
  });

  it('allocates an entry that uses exactly the remaining stock', () => {
    const { allocations, remainingStock } = allocateWaitlistStock(entries, 2);

    expect(allocations).toEqual([{ buyer_id: 1, quantity: 2 }]);
    expect(remainingStock).toBe(0);
  });

  it('returns the documented shape for an empty waitlist', () => {
    expect(allocateWaitlistStock([], 5)).toEqual({ allocations: [], remainingStock: 5 });
  });

  it('returns no allocations when stock is zero', () => {
    expect(allocateWaitlistStock(entries, 0)).toEqual({ allocations: [], remainingStock: 0 });
  });
});
