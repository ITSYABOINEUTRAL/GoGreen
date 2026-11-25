import React from 'react';
import { render } from '@testing-library/react';
import { test, expect } from 'vitest';
import { axe, flushAsync, expectNoA11yViolations } from '../a11y';

test('flushAsync resolves after pending microtasks and timers', async () => {
  let resolved = false;
  const pending = Promise.resolve().then(() => {
    resolved = true;
  });

  await flushAsync();
  await pending;

  expect(resolved).toBe(true);
});

test('expectNoA11yViolations resolves for an accessible container', async () => {
  const { container } = render(
    <label htmlFor="name">
      Name
      <input id="name" type="text" />
    </label>
  );

  await expect(expectNoA11yViolations(container)).resolves.toBeUndefined();
});

test('expectNoA11yViolations rejects for a container with a known violation', async () => {
  const { container } = render(<input type="text" />);

  await expect(expectNoA11yViolations(container)).rejects.toThrow();
});

// Reads the configured rules defensively, so an unexpected axe.configure() shape
// fails with a clear message instead of a TypeError.
function findConfiguredRule(id) {
  const config = axe.configure();
  const rules = Array.isArray(config?.rules) ? config.rules : [];
  return rules.find((rule) => rule.id === id);
}

test('the exported axe instance has the color-contrast rule disabled', () => {
  const colorContrast = findConfiguredRule('color-contrast');

  expect(colorContrast, 'axe.configure() should list color-contrast in rules').toBeDefined();
  expect(colorContrast.enabled).toBe(false);
});

test('expectNoA11yViolations rejection names the violated rule', async () => {
  const { container } = render(<input type="text" />);

  await expect(expectNoA11yViolations(container)).rejects.toThrow(/label/);
});
