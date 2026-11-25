import { useEffect, useState } from 'react';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function getPrefersReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

export default function PageLoader() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(getPrefersReducedMotion);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY);
    const handleChange = (event) => setPrefersReducedMotion(event.matches);

    setPrefersReducedMotion(mediaQuery.matches);

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  return (
    <div className="page-loader" role="status" aria-label="Loading page">
      <style>{`
        @keyframes page-loader-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .page-loader__spinner {
          animation: page-loader-spin 1s linear infinite;
        }
        .page-loader__spinner--static {
          animation: none;
        }
      `}</style>
      <div
        className={`page-loader__spinner${prefersReducedMotion ? ' page-loader__spinner--static' : ''}`}
        data-testid="page-loader-spinner"
      />
    </div>
  );
}
