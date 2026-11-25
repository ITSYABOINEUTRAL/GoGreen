import { beforeEach, describe, expect, it } from 'vitest';

describe('i18n direction handler', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('dir');
    document.documentElement.removeAttribute('lang');
  });

  it('sets dir="rtl" and persists lang=ar when language changes to ar', async () => {
    const { default: i18n } = await import('../index.js');
    await i18n.changeLanguage('ar');
    expect(document.documentElement.getAttribute('dir')).toBe('rtl');
    expect(localStorage.getItem('lang')).toBe('ar');
  });

  it('sets dir="ltr" when language changes to en', async () => {
    const { default: i18n } = await import('../index.js');
    await i18n.changeLanguage('en');
    expect(document.documentElement.getAttribute('dir')).toBe('ltr');
  });

  it('sets dir="ltr" for an unknown locale code', async () => {
    const { default: i18n } = await import('../index.js');
    await i18n.changeLanguage('xx');
    expect(document.documentElement.getAttribute('dir')).toBe('ltr');
  });
});
