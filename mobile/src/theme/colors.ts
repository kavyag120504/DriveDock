// ============================================================
// DriveDock Design System — Blue & White Professional Theme
// Inspired by: DRIVE dark/DOCK blue brand + clean card UI
// ============================================================

export const Colors = {
  // Brand
  primary: '#1755E8',         // Vivid brand blue (DOCK blue from template)
  primaryDark: '#1040C1',     // Hover / pressed state
  primaryLight: '#EBF0FD',    // Tinted background for blue elements

  // Backgrounds
  background: '#EAECF0',      // Light warm-gray page background (template exact)
  surface: '#FFFFFF',         // White card surface
  surfaceAlt: '#F7F8FA',      // Slightly off-white for nested sections

  // Borders
  border: '#DDE1E9',          // Subtle gray border
  divider: '#EAECF0',         // Section dividers

  // Text
  textPrimary: '#111827',     // Near black (template headings)
  textSecondary: '#4B5563',   // Gray body text
  textMuted: '#9CA3AF',       // Labels, meta text
  textBlue: '#1755E8',        // Branded text (e.g., "DriveDock proves they are genuine")

  // Status — Compliance
  compliant: '#16A34A',
  compliantBg: '#F0FDF4',
  compliantBorder: '#BBF7D0',

  nonCompliant: '#DC2626',
  nonCompliantBg: '#FEF2F2',
  nonCompliantBorder: '#FECACA',

  warning: '#D97706',
  warningBg: '#FFFBEB',
  warningBorder: '#FDE68A',

  // Role accent (subtle, single hue shifts)
  owner: '#1755E8',
  provider: '#6D28D9',
  officer: '#0369A1',
  government: '#B45309',
  admin: '#BE185D',

  // Backward-compatible aliases (keep old screens compiling)
  surfaceLight: '#F7F8FA',
  borderHighlight: '#C5CCE0',
  nonCompliantBg: '#FEF2F2',
  nonCompliantBorder: '#FECACA',
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const BorderRadius = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 20,
  full: 9999,
};

export const Shadow = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  elevated: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 12,
    elevation: 5,
  },
};

