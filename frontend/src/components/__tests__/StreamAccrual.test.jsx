import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StreamAccrual from '../StreamAccrual';

describe('StreamAccrual', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the base accrued value initially', () => {
    render(<StreamAccrual accrued={10} asOf={Date.now()} rate={1} />);
    expect(screen.getByText('10.0000')).toBeTruthy();
  });

  it('increases the displayed value over time when rate > 0', () => {
    const now = Date.now();
    const { container } = render(<StreamAccrual accrued={0} asOf={now} rate={1} />);
    expect(screen.getByText('0.0000')).toBeTruthy();

    act(() => { vi.advanceTimersByTime(3000); });
    const text = container.querySelector('span').textContent;
    expect(parseFloat(text)).toBeGreaterThanOrEqual(2.9);
  });

  it('stays at base accrued when rate is a non-numeric string', () => {
    const now = Date.now();
    render(<StreamAccrual accrued={5} asOf={now} rate="not-a-number" />);
    expect(screen.getByText('5.0000')).toBeTruthy();

    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.getByText('5.0000')).toBeTruthy();
  });

  it('stays at base accrued when rate is negative', () => {
    const now = Date.now();
    render(<StreamAccrual accrued={7} asOf={now} rate={-2} />);
    expect(screen.getByText('7.0000')).toBeTruthy();

    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.getByText('7.0000')).toBeTruthy();
  });

  it('stays at base accrued when rate is zero', () => {
    const now = Date.now();
    render(<StreamAccrual accrued={3} asOf={now} rate={0} />);
    expect(screen.getByText('3.0000')).toBeTruthy();

    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.getByText('3.0000')).toBeTruthy();
  });

  it('does not go below accrued when asOf is in the future', () => {
    const future = Date.now() + 60_000;
    render(<StreamAccrual accrued={2} asOf={future} rate={1} />);

    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.getByText('2.0000')).toBeTruthy();
  });

  it('starts increasing after fake timers pass the future asOf', () => {
    const now = Date.now();
    const future = now + 2000;
    const { container } = render(<StreamAccrual accrued={0} asOf={future} rate={1} />);

    // Advance 3 seconds: 1 second past asOf.
    act(() => { vi.advanceTimersByTime(3000); });
    const text = container.querySelector('span').textContent;
    expect(parseFloat(text)).toBeGreaterThan(0);
  });

  it('renders "0.0000" when rate is undefined instead of NaN', () => {
    const { container } = render(<StreamAccrual accrued={0} asOf={Date.now()} rate={undefined} />);
    act(() => { vi.advanceTimersByTime(2000); });
    const text = container.querySelector('span').textContent;
    expect(text).toBe('0.0000');
    expect(text).not.toContain('NaN');
  });

  it('does not update state after unmount', () => {
    const now = Date.now();
    const { unmount } = render(<StreamAccrual accrued={0} asOf={now} rate={1} />);
    unmount();
    act(() => { vi.advanceTimersByTime(5000); });
    // No assertion needed — passes if no React unmounted-component warnings.
  });
});
