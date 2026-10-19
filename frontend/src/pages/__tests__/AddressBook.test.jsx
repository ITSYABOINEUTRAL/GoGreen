import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import AddressBook from '../AddressBook';

vi.mock('../../api/client', () => ({
  api: {
    getAddresses: vi.fn(),
    createAddress: vi.fn(),
    updateAddress: vi.fn(),
    deleteAddress: vi.fn(),
    setDefaultAddress: vi.fn(),
  },
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', role: 'buyer' } }),
}));

import { api } from '../../api/client';

const ADDRESS_1 = { id: 1, label: 'Home', street: '123 Main St', city: 'Lagos', country: 'NG', postal_code: '100001', is_default: 1 };
const ADDRESS_2 = { id: 2, label: 'Work', street: '456 Business Ave', city: 'Abuja', country: 'NG', postal_code: '', is_default: 0 };

function renderAddressBook() {
  return render(<AddressBook />);
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getAddresses.mockResolvedValue({ data: [], limit: 10 });
});

describe('AddressBook', () => {
  describe('default badge', () => {
    it('renders the Default badge only for the address marked is_default', async () => {
      api.getAddresses.mockResolvedValue({ data: [ADDRESS_1, ADDRESS_2], limit: 10 });
      renderAddressBook();

      const badges = await screen.findAllByText('Default');
      expect(badges).toHaveLength(1);
    });

    it('does not render any Default badge when no address is default', async () => {
      api.getAddresses.mockResolvedValue({
        data: [{ ...ADDRESS_1, is_default: 0 }],
        limit: 10,
      });
      renderAddressBook();

      await screen.findByText('Home');
      expect(screen.queryByText('Default')).toBeNull();
    });
  });

  describe('AddressFormModal – required field validation', () => {
    it('does not call the save handler when label is empty', async () => {
      renderAddressBook();

      fireEvent.click(await screen.findByRole('button', { name: /add address/i }));

      // Modal opened – clear the label field and submit
      const streetInput = screen.getByLabelText(/street address/i);
      const cityInput = screen.getByLabelText(/city/i);
      fireEvent.change(streetInput, { target: { value: '123 St' } });
      fireEvent.change(cityInput, { target: { value: 'City' } });

      fireEvent.click(screen.getByRole('button', { name: /^add address$/i }));

      // Native required blocks submission; createAddress should NOT be called
      expect(api.createAddress).not.toHaveBeenCalled();
    });

    it('calls createAddress with the expected object when all required fields are filled', async () => {
      api.createAddress.mockResolvedValue({});
      api.getAddresses
        .mockResolvedValueOnce({ data: [], limit: 10 })
        .mockResolvedValue({ data: [], limit: 10 });

      renderAddressBook();
      fireEvent.click(await screen.findByRole('button', { name: /add address/i }));

      fireEvent.change(screen.getByLabelText(/label/i), { target: { value: 'Office' } });
      fireEvent.change(screen.getByLabelText(/street address/i), { target: { value: '99 Tech Park' } });
      fireEvent.change(screen.getByLabelText(/city/i), { target: { value: 'Nairobi' } });
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'KE' } });

      fireEvent.submit(screen.getByRole('dialog').querySelector('form'));

      await waitFor(() => expect(api.createAddress).toHaveBeenCalledTimes(1));
      expect(api.createAddress).toHaveBeenCalledWith(
        expect.objectContaining({
          label: 'Office',
          street: '99 Tech Park',
          city: 'Nairobi',
          country: 'KE',
        })
      );
    });
  });

  describe('AddressFormModal – Escape key', () => {
    it('calls onCancel (closes modal) when Escape is pressed inside the modal', async () => {
      renderAddressBook();
      fireEvent.click(await screen.findByRole('button', { name: /add address/i }));

      expect(screen.getByRole('dialog')).toBeInTheDocument();

      fireEvent.keyDown(document, { key: 'Escape' });

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });
  });

  describe('delete action – confirmation', () => {
    it('shows a confirmation dialog before calling deleteAddress', async () => {
      api.getAddresses.mockResolvedValue({ data: [ADDRESS_1], limit: 10 });
      renderAddressBook();

      fireEvent.click(await screen.findByRole('button', { name: /delete/i }));

      // Confirmation dialog should appear
      expect(screen.getByText(/are you sure/i)).toBeInTheDocument();
      // deleteAddress should NOT have been called yet
      expect(api.deleteAddress).not.toHaveBeenCalled();
    });

    it('calls deleteAddress after the user confirms', async () => {
      api.getAddresses.mockResolvedValue({ data: [ADDRESS_1], limit: 10 });
      api.deleteAddress.mockResolvedValue({});
      renderAddressBook();

      fireEvent.click(await screen.findByRole('button', { name: /delete/i }));

      // Confirm the deletion
      fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));

      await waitFor(() => expect(api.deleteAddress).toHaveBeenCalledWith(ADDRESS_1.id));
    });
  });
});
