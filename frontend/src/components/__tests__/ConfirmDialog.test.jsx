import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ConfirmDialog from '../ConfirmDialog';

function setup(props = {}) {
  const defaults = {
    open: true,
    title: 'Delete item',
    description: 'Are you sure?',
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  };
  return render(<ConfirmDialog {...defaults} {...props} />);
}

describe('ConfirmDialog – role and initial focus', () => {
  it('renders with alertdialog role', () => {
    setup();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('moves focus to the Cancel button on open', () => {
    setup();
    expect(document.activeElement).toBe(screen.getByText('Cancel'));
  });
});

describe('ConfirmDialog – keyboard interactions', () => {
  it('calls onCancel when Escape is pressed', () => {
    const onCancel = vi.fn();
    setup({ onCancel });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('wraps Tab from the last focusable element back to the first', async () => {
    setup();
    const user = userEvent.setup({ delay: null });
    const cancelBtn = screen.getByText('Cancel');
    const confirmBtn = screen.getByText('Confirm');

    cancelBtn.focus();
    await user.tab();
    expect(document.activeElement).toBe(confirmBtn);

    await user.tab();
    expect(document.activeElement).toBe(cancelBtn);
  });

  it('wraps Shift+Tab from the first focusable element to the last', async () => {
    setup();
    const user = userEvent.setup({ delay: null });
    const cancelBtn = screen.getByText('Cancel');
    const confirmBtn = screen.getByText('Confirm');

    cancelBtn.focus();
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(confirmBtn);
  });
});

describe('ConfirmDialog – backdrop click', () => {
  it('calls onCancel when the overlay backdrop is clicked', () => {
    const onCancel = vi.fn();
    setup({ onCancel });
    const overlay = screen.getByRole('alertdialog').parentElement;
    fireEvent.mouseDown(overlay);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('ConfirmDialog – confirm callback', () => {
  it('calls onConfirm when the Confirm button is clicked', () => {
    const onConfirm = vi.fn();
    setup({ onConfirm });
    fireEvent.click(screen.getByText('Confirm'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe('ConfirmDialog – destructive styling', () => {
  it('renders Confirm with destructive background when destructive=true', () => {
    setup({ destructive: true });
    expect(screen.getByText('Confirm')).toHaveStyle({ background: '#b42318' });
  });
});

describe('ConfirmDialog – focus restore on close', () => {
  it('restores focus to the previously focused element when unmounted', () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Open dialog';
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { unmount } = setup();
    expect(document.activeElement).toBe(screen.getByText('Cancel'));

    unmount();
    expect(document.activeElement).toBe(trigger);
    document.body.removeChild(trigger);
  });
});
