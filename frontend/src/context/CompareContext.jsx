import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const CompareContext = createContext(null);

const HISTORY_KEY = 'comparison_history';
const MAX_HISTORY = 10;

/**
 * Parse a raw localStorage value into a safe history array.
 * Returns only entries that are objects with an array `productIds`.
 * Returns null when the stored value is unusable (invalid JSON or not an array).
 */
export function parseStoredHistory(raw) {
  if (raw === null || raw === undefined) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  return parsed.filter(
    (entry) => entry && typeof entry === 'object' && Array.isArray(entry.productIds)
  );
}

export function CompareProvider({ children }) {
  const [compareList, setCompareList] = useState([]);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(HISTORY_KEY);
      if (stored === null) return;
      const parsed = parseStoredHistory(stored);
      if (parsed === null) {
        localStorage.removeItem(HISTORY_KEY);
        setHistory([]);
        return;
      }
      setHistory(parsed);
    } catch (err) {
      console.error('Failed to load comparison history:', err);
      try {
        localStorage.removeItem(HISTORY_KEY);
      } catch {
        // ignore storage errors
      }
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch (err) {
      console.error('Failed to persist comparison history:', err);
    }
  }, [history]);

  const addToCompare = useCallback((product) => {
    setCompareList((prev) => {
      if (prev.some((p) => p.id === product.id)) return prev;
      return [...prev, product];
    });
  }, []);

  const removeFromCompare = useCallback((productId) => {
    setCompareList((prev) => prev.filter((p) => p.id !== productId));
  }, []);

  const clearCompare = useCallback(() => {
    setCompareList([]);
  }, []);

  const isInCompare = useCallback(
    (productId) => compareList.some((p) => p.id === productId),
    [compareList]
  );

  const addToHistory = useCallback((productIds) => {
    if (!Array.isArray(productIds) || productIds.length === 0) return;
    setHistory((prev) => {
      const entry = { productIds, timestamp: Date.now() };
      const filtered = prev.filter(
        (h) => JSON.stringify(h.productIds) !== JSON.stringify(productIds)
      );
      return [entry, ...filtered].slice(0, MAX_HISTORY);
    });
  }, []);

  const removeProductsFromHistory = useCallback((productId) => {
    setHistory((prev) =>
      prev
        .map((entry) => ({
          ...entry,
          productIds: entry.productIds.filter((id) => id !== productId),
        }))
        .filter((entry) => entry.productIds.length > 0)
    );
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
  }, []);

  const value = {
    compareList,
    history,
    addToCompare,
    removeFromCompare,
    clearCompare,
    isInCompare,
    addToHistory,
    removeProductsFromHistory,
    clearHistory,
  };

  return <CompareContext.Provider value={value}>{children}</CompareContext.Provider>;
}

export function useCompare() {
  const context = useContext(CompareContext);
  if (!context) {
    throw new Error('useCompare must be used within a CompareProvider');
  }
  return context;
}

export default CompareContext;
