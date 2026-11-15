import { StyleSheet } from 'react-native';

/** Shared palette. Status always has a text label and icon as well as a color. */
export const Colors = {
  primary: '#245BD6',
  primaryDark: '#1944A6',
  primaryLight: '#EBF1FF',
  background: '#F3F6FA',
  surface: '#FFFFFF',
  surfaceAlt: '#F7F9FC',
  border: '#DCE3ED',
  divider: '#EAF0F6',
  borderHighlight: '#B8C8DD',
  textPrimary: '#142A43',
  textSecondary: '#4E627A',
  textMuted: '#63758A',
  textBlue: '#245BD6',
  compliant: '#167448',
  compliantBg: '#EDF8F1',
  compliantBorder: '#B9DFC8',
  nonCompliant: '#B8323D',
  nonCompliantBg: '#FFF1F2',
  nonCompliantBorder: '#F0C3C8',
  warning: '#8C570B',
  warningBg: '#FFF8E8',
  warningBorder: '#EED59B',
  owner: '#245BD6',
  provider: '#7040B5',
  officer: '#086985',
  government: '#915709',
  admin: '#AF2862',
  surfaceLight: '#F7F9FC',
};
export const Spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 };
export const BorderRadius = { sm: 8, md: 12, lg: 18, xl: 24, full: 9999 };
export const Shadow = {
  card: {
    shadowColor: '#142A43',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  elevated: {
    shadowColor: '#142A43',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 18,
    elevation: 4,
  },
};
export const Typography = StyleSheet.create({
  title: { fontSize: 28, lineHeight: 35, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.6 },
  heading: { fontSize: 20, lineHeight: 27, fontWeight: '700', color: Colors.textPrimary },
  body: { fontSize: 15, lineHeight: 23, color: Colors.textSecondary },
  label: { fontSize: 13, lineHeight: 19, fontWeight: '600', color: Colors.textSecondary },
  caption: { fontSize: 12, lineHeight: 18, color: Colors.textMuted },
});
export const Layout = StyleSheet.create({
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 20, paddingBottom: 48 },
  form: { width: '100%', maxWidth: 560, alignSelf: 'center', padding: 20, paddingBottom: 48 },
  card: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.lg,
    padding: 20,
  },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
    color: Colors.textPrimary,
  },
});
