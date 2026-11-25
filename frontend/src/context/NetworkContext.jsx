import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../api/client';

const NetworkContext = createContext({
  network: null,
  loading: false,
  error: null,
  explorerUrl: () => null,
  refresh: () => {},
});

export function NetworkProvider({ children }) {
  const [network, setNetwork] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchNetwork = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.getNetwork()
      .then(res => {
        if (!cancelled) {
          setNetwork(res.network);
          setLoading(false);
        }
      })
      .catch(e => {
        if (!cancelled) {
          setError(e);
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const cancel = fetchNetwork();
    return cancel;
  }, [fetchNetwork]);

  const explorerUrl = (type, id) => {
    if (network === null) return null;
    return `https://stellar.expert/explorer/${network === 'mainnet' ? 'public' : 'testnet'}/${type}/${encodeURIComponent(id)}`;
  };

  return (
    <NetworkContext.Provider value={{ network, loading, error, explorerUrl, refresh: fetchNetwork }}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  return useContext(NetworkContext);
}
