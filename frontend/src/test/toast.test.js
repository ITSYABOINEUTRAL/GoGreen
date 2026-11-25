import { beforeEach, describe, expect, it } from 'vitest';
import { showToast } from '../utils/toast';

describe('showToast', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('closes idempotently and removes an empty container', () => {
    const close = showToast('Saved');
    expect(() => { close(); close(); }).not.toThrow();
    expect(document.getElementById('toast-notifications')).toBeNull();
    expect(document.getElementById('toast-animations')).toBeNull();
  });

  it('reinjects one animation style after the last toast closes', () => {
    const closeFirst = showToast('First');
    expect(document.querySelectorAll('#toast-animations')).toHaveLength(1);
    closeFirst();
    expect(document.getElementById('toast-animations')).toBeNull();

    showToast('Second');
    expect(document.querySelectorAll('#toast-animations')).toHaveLength(1);
  });
});
