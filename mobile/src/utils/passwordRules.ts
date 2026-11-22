/** The same password rules the server enforces at signup and reset. Returns a message, or null when the password is fine. */
export const passwordProblem = (password: string): string | null => {
  if (password.length < 8) return 'Use at least 8 characters.';
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) return 'Use at least one letter and one number.';
  return null;
};

/** What the person typed to find their account: an email address, or a 10-digit mobile number (+91 and spaces are ignored). */
export type ResetIdentifier = { kind: 'email' | 'phone'; value: string } | null;

export const parseResetIdentifier = (raw: string): ResetIdentifier => {
  const text = raw.trim();
  if (!text) return null;
  if (text.includes('@')) return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(text) ? { kind: 'email', value: text.toLowerCase() } : null;
  const digits = text.replace(/\D/g, '').slice(-10);
  return digits.length === 10 && /^[6-9]/.test(digits) ? { kind: 'phone', value: digits } : null;
};
