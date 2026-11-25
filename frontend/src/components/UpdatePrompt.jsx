import React, { useEffect, useRef, useState } from 'react';

const bannerStyle = {
  position: 'fixed',
  bottom: 0,
  left: 0,
  right: 0,
  background: '#2d6a4f',
  color: '#fff',
  padding: '12px 20px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  zIndex: 9999,
};

const btnBase = {
  border: 'none',
  borderRadius: '4px',
  padding: '6px 14px',
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: '0.875rem',
};

/**
 * Post SKIP_WAITING to the waiting service worker, then reload the page.
 * Extracted so tests can inject a fake navigator.serviceWorker.
 */
export function requestSkipWaiting(sw, reload = () => window.location.reload()) {
  sw.postMessage({ type: 'SKIP_WAITING' });
  reload();
}

export default function UpdatePrompt() {
  const [show, setShow] = useState(false);
  const registrationRef = useRef(null);
  const installingRef = useRef(null);

  useEffect(() => {
    function handleMessage(event) {
      if (event.data && event.data.type === 'SW_UPDATED') {
        setShow(true);
      }
    }

    navigator.serviceWorker?.addEventListener('message', handleMessage);
    return () => {
      navigator.serviceWorker?.removeEventListener('message', handleMessage);
    };
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;

    let cancelled = false;

    function handleUpdateFound() {
      const installing = registrationRef.current?.installing;
      if (!installing) return;

      // Remove any previous statechange listener before attaching a new one.
      if (installingRef.current) {
        installingRef.current.removeEventListener('statechange', handleStateChange);
      }
      installingRef.current = installing;
      installing.addEventListener('statechange', handleStateChange);
    }

    function handleStateChange() {
      if (
        installingRef.current?.state === 'installed' &&
        navigator.serviceWorker.controller
      ) {
        setShow(true);
      }
    }

    function handleControllerChange() {
      setShow(true);
    }

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    navigator.serviceWorker.ready
      .then((registration) => {
        if (cancelled) return;
        registrationRef.current = registration;

        if (registration.waiting && navigator.serviceWorker.controller) {
          setShow(true);
        }

        registration.addEventListener('updatefound', handleUpdateFound);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);

      if (registrationRef.current) {
        registrationRef.current.removeEventListener('updatefound', handleUpdateFound);
      }
      if (installingRef.current) {
        installingRef.current.removeEventListener('statechange', handleStateChange);
      }
    };
  }, []);

  function handleRefresh() {
    if (navigator.serviceWorker?.controller) {
      requestSkipWaiting(navigator.serviceWorker.controller);
    } else {
      window.location.reload();
    }
  }

  function handleDismiss() {
    setShow(false);
  }

  if (!show) return null;

  return (
    <div style={bannerStyle} role="alert" aria-live="polite">
      <span>🔄 A new version is available — click to refresh</span>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={handleRefresh}
          style={{ ...btnBase, background: '#fff', color: '#2d6a4f' }}
          aria-label="Refresh to apply the update"
        >
          Refresh
        </button>
        <button
          onClick={handleDismiss}
          style={{ ...btnBase, background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.6)' }}
          aria-label="Dismiss update notification"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
