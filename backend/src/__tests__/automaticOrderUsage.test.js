'use strict';

const mockQuery = jest.fn();
const mockGetWaitlistCount = jest.fn();
const mockProcessWaitlistOnRestock = jest.fn();

jest.mock('../db/schema', () => ({ query: mockQuery }));
jest.mock('../services/WaitlistService', () =>
  jest.fn().mockImplementation(() => ({ getWaitlistCount: mockGetWaitlistCount }))
);
jest.mock('../services/AutomaticOrderProcessor', () =>
  jest.fn().mockImplementation(() => ({ processWaitlistOnRestock: mockProcessWaitlistOnRestock }))
);

const { exampleRestockWithWaitlistProcessing } = require('../examples/automatic-order-usage');

describe('exampleRestockWithWaitlistProcessing', () => {
  const productId = 42;
  const newQuantity = 5;
  const productRow = { id: productId, name: 'Organic Tomatoes', quantity: newQuantity };
  let logSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('issues the stock UPDATE with the given productId and quantity', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

    await exampleRestockWithWaitlistProcessing(productId, newQuantity);

    expect(mockQuery).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('UPDATE products'),
      [newQuantity, productId]
    );
  });

  it('returns early when the product is not found after the stock update', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

    await exampleRestockWithWaitlistProcessing(productId, newQuantity);

    expect(logSpy).toHaveBeenCalledWith('✗ Product not found');
    expect(mockGetWaitlistCount).not.toHaveBeenCalled();
    expect(mockProcessWaitlistOnRestock).not.toHaveBeenCalled();
  });

  it('returns early without calling the processor when the waitlist is empty', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [productRow] });
    mockGetWaitlistCount.mockResolvedValueOnce({ success: true, count: 0 });

    await exampleRestockWithWaitlistProcessing(productId, newQuantity);

    expect(mockGetWaitlistCount).toHaveBeenCalledWith(productId);
    expect(logSpy).toHaveBeenCalledWith('ℹ No waitlist entries to process');
    expect(mockProcessWaitlistOnRestock).not.toHaveBeenCalled();
  });

  it('logs processed and skipped counts on the success path', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [productRow] });
    mockGetWaitlistCount.mockResolvedValueOnce({ success: true, count: 3 });
    mockProcessWaitlistOnRestock.mockResolvedValueOnce({
      success: true,
      processed: 2,
      skipped: 1,
      remainingStock: 0,
      totalEntries: 3,
      errors: [],
    });

    await exampleRestockWithWaitlistProcessing(productId, newQuantity);

    expect(mockProcessWaitlistOnRestock).toHaveBeenCalledWith(productId, newQuantity);
    expect(logSpy).toHaveBeenCalledWith('  - Processed: 2 orders');
    expect(logSpy).toHaveBeenCalledWith('  - Skipped: 1 entries');
  });

  it('logs the error on the failure path when processing reports failure', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [productRow] });
    mockGetWaitlistCount.mockResolvedValueOnce({ success: true, count: 1 });
    mockProcessWaitlistOnRestock.mockResolvedValueOnce({ success: false, error: 'boom' });

    await exampleRestockWithWaitlistProcessing(productId, newQuantity);

    expect(logSpy).toHaveBeenCalledWith('✗ Waitlist processing failed: boom');
  });
});
