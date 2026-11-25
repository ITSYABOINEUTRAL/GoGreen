import React from 'react';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { vi, test, expect, describe } from 'vitest';
import { axe } from 'jest-axe';
import AdminDashboard from '../AdminDashboard';

test('ban requires confirmation through the accessible dialog', async () => {
  const onBan = vi.fn();
  const users = [{ id: 1, name: 'John', isBanned: false }];
  const { container } = render(<AdminDashboard users={users} onBan={onBan} />);

  fireEvent.click(screen.getByRole('button', { name: 'Ban' }));
  let dialog = await screen.findByRole('alertdialog', { name: 'Ban John?' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  expect(onBan).not.toHaveBeenCalled();
  expect(screen.queryByRole('alertdialog')).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Ban' }));
  dialog = await screen.findByRole('alertdialog', { name: 'Ban John?' });
  expect(await axe(container)).toHaveNoViolations();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Ban' }));
  await vi.waitFor(() => expect(onBan).toHaveBeenCalledWith(users[0]));
});

describe('AdminDashboard async ban/unban handling', () => {
  test('button is disabled while onBan promise is pending', async () => {
    let resolveBan;
    const slowBan = vi.fn(
      () => new Promise((resolve) => { resolveBan = resolve; })
    );
    const users = [{ id: 1, name: 'Alice', isBanned: false }];
    render(<AdminDashboard users={users} onBan={slowBan} />);

    fireEvent.click(screen.getByRole('button', { name: 'Ban' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Ban Alice?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ban' }));

    // Button should be disabled while the promise is in flight
    await vi.waitFor(() =>
      expect(screen.getByRole('button', { name: 'Ban' })).toBeDisabled()
    );

    // Resolve the promise and button should be re-enabled
    await act(async () => { resolveBan(); });
    expect(screen.getByRole('button', { name: 'Ban' })).not.toBeDisabled();
  });

  test('shows error message and re-enables button when onBan rejects', async () => {
    const failingBan = vi.fn(() => Promise.reject(new Error('Server error')));
    const users = [{ id: 2, name: 'Bob', isBanned: false }];
    render(<AdminDashboard users={users} onBan={failingBan} />);

    fireEvent.click(screen.getByRole('button', { name: 'Ban' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Ban Bob?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ban' }));

    // Error message should appear
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Server error');

    // Button should be re-enabled after rejection
    expect(screen.getByRole('button', { name: 'Ban' })).not.toBeDisabled();
  });

  test('no error is rendered when onBan resolves successfully', async () => {
    const onBan = vi.fn(() => Promise.resolve());
    const users = [{ id: 3, name: 'Carol', isBanned: false }];
    render(<AdminDashboard users={users} onBan={onBan} />);

    fireEvent.click(screen.getByRole('button', { name: 'Ban' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Ban Carol?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ban' }));

    await vi.waitFor(() => expect(onBan).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Ban' })).not.toBeDisabled();
  });
});
