import { render, screen } from '@testing-library/react';
import PageLoader from '../PageLoader';

function mockMatchMedia(matches) {
  const listeners = new Set();

  const mediaQueryList = {
    matches,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addEventListener: (event, listener) => {
      if (event === 'change') listeners.add(listener);
    },
    removeEventListener: (event, listener) => {
      if (event === 'change') listeners.delete(listener);
    },
    addListener: (listener) => listeners.add(listener),
    removeListener: (listener) => listeners.delete(listener),
    dispatchEvent: () => true,
  };

  window.matchMedia = jest.fn().mockImplementation(() => mediaQueryList);

  return mediaQueryList;
}

describe('PageLoader', () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    jest.restoreAllMocks();
  });

  it('renders an animated spinner by default', () => {
    mockMatchMedia(false);

    render(<PageLoader />);

    const spinner = screen.getByTestId('page-loader-spinner');
    expect(spinner.className).toContain('page-loader__spinner');
    expect(spinner.className).not.toContain('page-loader__spinner--static');
  });

  it('renders a static spinner when reduced motion is requested', () => {
    mockMatchMedia(true);

    render(<PageLoader />);

    const spinner = screen.getByTestId('page-loader-spinner');
    expect(spinner.className).toContain('page-loader__spinner--static');
  });

  it('exposes role and aria-label in both motion modes', () => {
    mockMatchMedia(false);
    const { unmount } = render(<PageLoader />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Loading page');
    unmount();

    mockMatchMedia(true);
    render(<PageLoader />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Loading page');
  });
});
