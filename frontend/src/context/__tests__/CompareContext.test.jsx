import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { CompareProvider, useCompare, parseStoredHistory } from '../CompareContext';

const HISTORY_KEY = 'comparison_history';

function Probe() {
  const { history } = useCompare();
  return <div data-testid="history">{JSON.stringify(history)}</div>;
}

describe('parseStoredHistory', () => {
  it('returns entries from a valid array', () => {
    const raw = JSON.stringify([{ productIds: ['a', 'b'], timestamp: 1 }]);
    expect(parseStoredHistory(raw)).toEqual([{ productIds: ['a', 'b'], timestamp: 1 }]);
  });

  it('returns null for "null"', () => {
    expect(parseStoredHistory('null')).toBeNull();
  });

  it('returns null for "{}"', () => {
    expect(parseStoredHistory('{}')).toBeNull();
  });

  it('drops malformed entries from an array', () => {
    const raw = JSON.stringify([
      { productIds: ['a'] },
      { productIds: 'not-an-array' },
      { timestamp: 1 },
      null,
    ]);
    expect(parseStoredHistory(raw)).toEqual([{ productIds: ['a'] }]);
  });

  it('returns null when JSON.parse throws', () => {
    expect(parseStoredHistory('{not json')).toBeNull();
  });
});

describe('CompareProvider history loading', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('loads a valid array into history', () => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify([{ productIds: ['a'], timestamp: 1 }]));
    render(
      <CompareProvider>
        <Probe />
      </CompareProvider>
    );
    expect(screen.getByTestId('history').textContent).toBe(
      JSON.stringify([{ productIds: ['a'], timestamp: 1 }])
    );
  });

  it('resets to [] and removes the key for "null"', () => {
    localStorage.setItem(HISTORY_KEY, 'null');
    render(
      <CompareProvider>
        <Probe />
      </CompareProvider>
    );
    expect(screen.getByTestId('history').textContent).toBe('[]');
    expect(localStorage.getItem(HISTORY_KEY)).toBeNull();
  });

  it('resets to [] and removes the key for "{}"', () => {
    localStorage.setItem(HISTORY_KEY, '{}');
    render(
      <CompareProvider>
        <Probe />
      </CompareProvider>
    );
    expect(screen.getByTestId('history').textContent).toBe('[]');
    expect(localStorage.getItem(HISTORY_KEY)).toBeNull();
  });

  it('drops malformed entries but keeps valid ones', () => {
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify([{ productIds: ['a'] }, { productIds: 'bad' }, null])
    );
    render(
      <CompareProvider>
        <Probe />
      </CompareProvider>
    );
    expect(screen.getByTestId('history').textContent).toBe(
      JSON.stringify([{ productIds: ['a'] }])
    );
  });

  it('resets to [] and removes the key when JSON.parse throws', () => {
    localStorage.setItem(HISTORY_KEY, '{not json');
    render(
      <CompareProvider>
        <Probe />
      </CompareProvider>
    );
    expect(screen.getByTestId('history').textContent).toBe('[]');
    expect(localStorage.getItem(HISTORY_KEY)).toBeNull();
  });
});
