import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { useConfirm } from '../useConfirm';

describe('useConfirm', () => {
  it('confirm path: resolves true when the Confirm button is clicked', async () => {
    const user = userEvent.setup();
    const { result } = renderHook(() => useConfirm());
    let pending;
    act(() => { pending = result.current.confirm('Delete item?'); });

    // Render the returned confirmDialog element
    const { unmount } = render(result.current.confirmDialog);
    const confirmBtn = screen.getByRole('button', { name: /confirm/i });
    await user.click(confirmBtn);
    unmount();

    await expect(pending).resolves.toBe(true);
  });

  it('cancel path: resolves false when the Cancel button is clicked', async () => {
    const user = userEvent.setup();
    const { result } = renderHook(() => useConfirm());
    let pending;
    act(() => { pending = result.current.confirm('Delete item?'); });

    const { unmount } = render(result.current.confirmDialog);
    const cancelBtn = screen.getByRole('button', { name: /cancel/i });
    await user.click(cancelBtn);
    unmount();

    await expect(pending).resolves.toBe(false);
  });

  it('supersedes a pending request and confirms the active request', async () => {
    const user = userEvent.setup();
    const { result } = renderHook(() => useConfirm());
    let first;
    let second;
    act(() => {
      first = result.current.confirm('First');
      second = result.current.confirm('Second');
    });
    await expect(first).resolves.toBe(false);

    const { unmount } = render(result.current.confirmDialog);
    const confirmBtn = screen.getByRole('button', { name: /confirm/i });
    await user.click(confirmBtn);
    unmount();

    await expect(second).resolves.toBe(true);
  });

  it('resolves a pending request on unmount', async () => {
    const { result, unmount } = renderHook(() => useConfirm());
    let pending;
    act(() => { pending = result.current.confirm('Pending'); });
    unmount();
    await expect(pending).resolves.toBe(false);
  });
});
