import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe } from 'jest-axe';
import StarRating from '../StarRating';

describe('StarRating', () => {
  it('renders a radiogroup with one radio per star when interactive', () => {
    render(<StarRating value={3} onChange={() => {}} />);
    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(5);
    expect(radios[2]).toHaveAttribute('aria-checked', 'true');
    expect(radios[0]).toHaveAttribute('aria-checked', 'false');
  });

  it('calls onChange on click', () => {
    const onChange = vi.fn();
    render(<StarRating value={1} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('4 stars'));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('supports arrow keys, Home, End, Enter and Space', () => {
    const onChange = vi.fn();
    render(<StarRating value={3} onChange={onChange} />);
    const current = screen.getByLabelText('3 stars');
    fireEvent.keyDown(current, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith(4);
    fireEvent.keyDown(current, { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenLastCalledWith(2);
    fireEvent.keyDown(current, { key: 'Home' });
    expect(onChange).toHaveBeenLastCalledWith(1);
    fireEvent.keyDown(current, { key: 'End' });
    expect(onChange).toHaveBeenLastCalledWith(5);
    fireEvent.keyDown(current, { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith(3);
    fireEvent.keyDown(current, { key: ' ' });
    expect(onChange).toHaveBeenLastCalledWith(3);
  });

  it('exposes an accessible label when read-only', () => {
    render(<StarRating value={4.5} />);
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'Rated 4.5 out of 5');
  });

  it('has no axe violations when interactive', async () => {
    const { container } = render(<StarRating value={3} onChange={() => {}} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
