import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';

// The i18n module runs i18n.init() on import and touches localStorage/document.
// jsdom provides document; stub localStorage defensively in case it is missing.
beforeAll(() => {
  if (typeof globalThis.localStorage === 'undefined') {
    const store = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
      clear: () => store.clear(),
    });
  }
});

import { getLocaleDirection, LOCALE_DIRECTIONS } from '../index';
import en from '../en.json';

describe('getLocaleDirection', () => {
  it('returns ltr for known LTR locales', () => {
    expect(getLocaleDirection('en')).toBe('ltr');
    expect(getLocaleDirection('sw')).toBe('ltr');
  });

  it('returns rtl for the RTL locale', () => {
    expect(getLocaleDirection('ar')).toBe('rtl');
  });

  it('defaults to ltr for unknown locales', () => {
    expect(getLocaleDirection('xx')).toBe('ltr');
  });
});

describe('LOCALE_DIRECTIONS', () => {
  it('contains the expected locale entries', () => {
    expect(LOCALE_DIRECTIONS).toMatchObject({
      en: 'ltr',
      sw: 'ltr',
      ar: 'rtl',
    });
  });
});

describe('init() language detection', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    localStorage.removeItem('lang');
  });

  it('uses a supported language stored in localStorage', async () => {
    localStorage.setItem('lang', 'sw');
    const { default: i18n } = await import('../index');

    expect(i18n.resolvedLanguage).toBe('sw');
    expect(document.documentElement.getAttribute('lang')).toBe('sw');
  });

  it('applies rtl direction when the stored language is ar', async () => {
    localStorage.setItem('lang', 'ar');
    await import('../index');

    expect(document.documentElement.getAttribute('dir')).toBe('rtl');
  });

  it('falls back to the default language when the stored language is unsupported', async () => {
    localStorage.setItem('lang', 'xx');
    const { default: i18n } = await import('../index');

    expect(i18n.t('nav.brand')).toBe(en.nav.brand);
    expect(getLocaleDirection('xx')).toBe('ltr');
  });
});
