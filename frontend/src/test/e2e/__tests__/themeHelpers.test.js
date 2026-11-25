import { describe, expect, it, vi } from 'vitest';
import {
  DATA_THEME_ATTRIBUTE,
  THEME_STORAGE_KEY,
  USER_STORAGE_KEY,
  getDataTheme,
  getStoredTheme,
  injectUser,
} from '../themeHelpers.js';

describe('theme E2E helpers', () => {
  it('exports the theme and storage contract', () => {
    expect(DATA_THEME_ATTRIBUTE).toBe('data-theme');
    expect(THEME_STORAGE_KEY).toBe('theme');
    expect(USER_STORAGE_KEY).toBe('user');
  });

  it('reads the data-theme attribute from a document-like object', () => {
    const doc = {
      documentElement: { getAttribute: vi.fn(() => 'dark') },
    };

    expect(getDataTheme(doc)).toBe('dark');
    expect(doc.documentElement.getAttribute).toHaveBeenCalledWith('data-theme');
  });

  it('reads the stored theme from a storage-like object', () => {
    const storage = new Map([['theme', 'light']]);
    const storageStub = {
      getItem: vi.fn((key) => storage.get(key) ?? null),
    };

    expect(getStoredTheme(storageStub)).toBe('light');
    expect(storageStub.getItem).toHaveBeenCalledWith('theme');
  });

  it('injects the documented default user payload', () => {
    const storage = new Map();
    const storageStub = {
      setItem: vi.fn((key, value) => storage.set(key, value)),
    };

    const user = injectUser(storageStub, 'consumer');

    expect(user).toEqual({
      id: 'test-user-id',
      name: 'Test User',
      email: 'test@example.com',
      role: 'consumer',
    });
    expect(JSON.parse(storage.get('user'))).toEqual(user);
  });

  it('applies user overrides while retaining the supplied role', () => {
    const storage = new Map();
    const storageStub = {
      setItem: vi.fn((key, value) => storage.set(key, value)),
    };

    const user = injectUser(storageStub, 'admin', { name: 'Ada' });

    expect(user).toEqual({
      id: 'test-user-id',
      name: 'Ada',
      email: 'test@example.com',
      role: 'admin',
    });
    expect(JSON.parse(storage.get('user'))).toEqual(user);
  });
});
