import { describe, it, expect } from 'vitest';
import {
  validatePassword,
  isValidEmail,
  validateLogin,
  validateRegister,
  validateProduct,
  PASSWORD_MIN_LENGTH,
} from '../validation';

describe('validatePassword', () => {
  it('returns no issues for a strong password', () => {
    expect(validatePassword('StrongPass1!')).toEqual([]);
  });

  it('reports error for password shorter than minimum length', () => {
    const issues = validatePassword('Ab1!');
    expect(issues.some(i => i.includes('characters'))).toBe(true);
  });

  it('reports error for missing uppercase letter', () => {
    const issues = validatePassword('alllower1!');
    expect(issues.some(i => i.includes('uppercase'))).toBe(true);
  });

  it('reports error for missing lowercase letter', () => {
    const issues = validatePassword('ALLUPPER1!');
    expect(issues.some(i => i.includes('lowercase'))).toBe(true);
  });

  it('reports error for missing digit', () => {
    const issues = validatePassword('NoDigitHere!');
    expect(issues.some(i => i.includes('number'))).toBe(true);
  });

  it.each([
    'password', 'password1', 'Password1', 'Password1!',
    '12345678', '123456789', 'qwerty123', 'iloveyou',
    'admin123', 'letmein1', 'welcome1', 'monkey123',
  ])('rejects weak password: %s', (pw) => {
    const issues = validatePassword(pw);
    expect(issues.some(i => i.includes('commonly'))).toBe(true);
  });

  it('PASSWORD_MIN_LENGTH is 8', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
  });
});

describe('isValidEmail', () => {
  it.each([
    'user@example.com',
    'user+tag@example.com',
    'user@sub.example.com',
    'firstname.lastname@example.org',
    'user@example.co.uk',
  ])('accepts valid email: %s', (email) => {
    expect(isValidEmail(email)).toBe(true);
  });

  it.each([
    ['consecutive dots', 'a..b@x.com'],
    ['trailing dot in local', 'a.@x.com'],
    ['missing local part', '@x.com'],
    ['missing TLD', 'a@x'],
    ['missing @', 'userexample.com'],
  ])('rejects invalid email: %s', (_label, email) => {
    expect(isValidEmail(email)).toBe(false);
  });
});

describe('validateLogin', () => {
  it('returns no errors for valid credentials', () => {
    expect(validateLogin({ email: 'user@example.com', password: 'secret' })).toEqual({});
  });

  it('returns email error for empty email', () => {
    const errors = validateLogin({ email: '', password: 'secret' });
    expect(errors.email).toBeTruthy();
  });

  it('returns email error for invalid email', () => {
    const errors = validateLogin({ email: 'not-an-email', password: 'secret' });
    expect(errors.email).toBeTruthy();
  });

  it('returns password error for empty password', () => {
    const errors = validateLogin({ email: 'user@example.com', password: '' });
    expect(errors.password).toBeTruthy();
  });
});

describe('validateRegister', () => {
  it('returns no errors for valid input', () => {
    expect(validateRegister({ name: 'Alice', email: 'alice@example.com', password: 'StrongPass1' })).toEqual({});
  });

  it('returns name error for empty name', () => {
    const errors = validateRegister({ name: '', email: 'a@b.com', password: 'StrongPass1' });
    expect(errors.name).toBeTruthy();
  });

  it('returns password error for weak password', () => {
    const errors = validateRegister({ name: 'Alice', email: 'a@b.com', password: 'password1' });
    expect(errors.password).toBeTruthy();
  });
});

describe('validateProduct', () => {
  const base = { name: 'Apple', price: '1.5', quantity: '10' };

  it('returns no errors for valid product', () => {
    expect(validateProduct(base)).toEqual({});
  });

  it('rejects price of 0', () => {
    const errors = validateProduct({ ...base, price: '0' });
    expect(errors.price).toBeTruthy();
  });

  it('rejects price above 1,000,000', () => {
    const errors = validateProduct({ ...base, price: '1000001' });
    expect(errors.price).toBeTruthy();
  });

  it('rejects price with more than 7 decimal places', () => {
    const errors = validateProduct({ ...base, price: '1.12345678' });
    expect(errors.price).toBeTruthy();
  });

  it('rejects quantity of 0', () => {
    const errors = validateProduct({ ...base, quantity: '0' });
    expect(errors.quantity).toBeTruthy();
  });

  it('returns nutrition errors for negative nutrition value', () => {
    const errors = validateProduct({ ...base, nutrition: { calories: -1 } });
    expect(errors.nutrition).toBeTruthy();
    expect(errors.nutrition.calories).toBeTruthy();
  });
});
