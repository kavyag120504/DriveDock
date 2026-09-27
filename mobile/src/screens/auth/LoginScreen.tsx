import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Shadow, BorderRadius } from '../../theme/colors';
import { useAuthStore, UserRole } from '../../store/authStore';

const DEMO_ROLES: { role: UserRole; label: string; desc: string; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
  { role: 'owner',      label: 'Vehicle Owner',           desc: 'Vehicles, verified docs, rotating QR, renewals',      icon: 'car-outline',           color: Colors.owner },
  { role: 'provider',   label: 'Approved Provider',       desc: 'PUC / Fitness center — issue verified certificates',   icon: 'construct-outline',     color: Colors.provider },
  { role: 'officer',    label: 'Traffic Police Officer',  desc: 'Scan rotating QR — tamper-proof green / red result',  icon: 'shield-checkmark-outline', color: Colors.officer },
  { role: 'government', label: 'Government / RTO',        desc: 'Regional compliance analytics, charts and trends',    icon: 'bar-chart-outline',     color: Colors.government },
  { role: 'admin',      label: 'System Administrator',    desc: 'Approve pending providers — gatekeeping checks',      icon: 'settings-outline',      color: Colors.admin },
];

export const LoginScreen = ({ navigation }: any) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, quickDemoLogin, isLoading, error, clearError } = useAuthStore();

  const handleLogin = async () => {
    if (!email || !password) return;
    try { await login(email, password); } catch (err) {}
  };

  const handleDemo = async (role: UserRole) => {
    clearError();
    await quickDemoLogin(role);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Brand Header */}
      <View style={styles.brandHeader}>
        <Text style={styles.kicker}>FINAL YEAR PROJECT · PITCH DEMO</Text>
        <View style={styles.logoRow}>
          <Text style={styles.logoDrive}>DRIVE</Text>
          <Text style={styles.logoDock}>DOCK</Text>
        </View>
        <Text style={styles.tagline}>
          Other apps store your vehicle papers.{'\n'}
          <Text style={styles.taglineBlue}>DriveDock proves they are genuine.</Text>
        </Text>
        <Text style={styles.explainer}>
          One Vehicle Passport for RC, PUC, Insurance & Fitness. Providers certify genuine documents. Police scan a rotating QR that cannot be copied.
        </Text>
      </View>

      {/* Login Card */}
      <View style={[styles.card, Shadow.card]}>
        <Text style={styles.cardTitle}>Sign In</Text>

        {error && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={14} color={Colors.nonCompliant} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Email Address</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. owner@drivedock.com"
            placeholderTextColor={Colors.textMuted}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            placeholderTextColor={Colors.textMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
        </View>

        <TouchableOpacity
          style={[styles.primaryBtn, isLoading && styles.btnDisabled]}
          onPress={handleLogin}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryBtnText}>Authenticate</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('Signup')} style={styles.signupLink}>
          <Text style={styles.signupText}>
            Don't have an account?{' '}
            <Text style={{ color: Colors.primary, fontWeight: '700' }}>Register here</Text>
          </Text>
        </TouchableOpacity>
      </View>

      {/* 1-Tap Demo Section */}
      <View style={[styles.demoSection, Shadow.card]}>
        <View style={styles.demoHeader}>
          <View style={styles.demoBadge}>
            <Ionicons name="flash" size={11} color={Colors.primary} />
            <Text style={styles.demoBadgeText}>1-TAP DEMO</Text>
          </View>
          <Text style={styles.demoTitle}>ROLE SWITCHER FOR EVALUATION</Text>
          <Text style={styles.demoSubtitle}>Tap any role to instantly log in with a real backend JWT session:</Text>
        </View>

        <View style={styles.demoGrid}>
          {DEMO_ROLES.map(({ role, label, desc, icon, color }) => (
            <TouchableOpacity
              key={role}
              style={[styles.demoCard, { borderLeftColor: color }]}
              onPress={() => handleDemo(role)}
            >
              <View style={[styles.demoIconWrap, { backgroundColor: color + '15' }]}>
                <Ionicons name={icon} size={20} color={color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.demoCardTitle}>{label}</Text>
                <Text style={styles.demoCardDesc}>{desc}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 20, paddingTop: 52, paddingBottom: 60 },

  // Brand
  brandHeader: { marginBottom: 28 },
  kicker: { fontSize: 10, fontWeight: '800', letterSpacing: 2, color: Colors.textMuted, marginBottom: 8 },
  logoRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 12 },
  logoDrive: { fontSize: 40, fontWeight: '900', letterSpacing: 1, color: Colors.textPrimary },
  logoDock: { fontSize: 40, fontWeight: '900', letterSpacing: 1, color: Colors.primary },
  tagline: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary, lineHeight: 24, marginBottom: 8 },
  taglineBlue: { color: Colors.primary, fontWeight: '800' },
  explainer: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20 },

  // Login card
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 20,
    marginBottom: 24,
  },
  cardTitle: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary, marginBottom: 16 },
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.nonCompliantBg,
    borderRadius: 8, borderWidth: 1, borderColor: Colors.nonCompliantBorder,
    padding: 10, marginBottom: 14,
  },
  errorText: { color: Colors.nonCompliant, fontSize: 12, fontWeight: '600', flex: 1 },
  inputGroup: { marginBottom: 14 },
  label: {
    fontSize: 11, fontWeight: '700', color: Colors.textSecondary,
    marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  input: {
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: 14, paddingVertical: 12,
    color: Colors.textPrimary, fontSize: 14,
  },
  primaryBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: 14,
    alignItems: 'center', marginTop: 6,
  },
  btnDisabled: { opacity: 0.6 },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15, letterSpacing: 0.5 },
  signupLink: { alignItems: 'center', marginTop: 14 },
  signupText: { color: Colors.textSecondary, fontSize: 13 },

  // Demo section
  demoSection: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border,
    padding: 16,
  },
  demoHeader: { marginBottom: 16 },
  demoBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.primaryLight,
    alignSelf: 'flex-start',
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 4, marginBottom: 8,
  },
  demoBadgeText: { fontSize: 10, fontWeight: '800', color: Colors.primary, letterSpacing: 0.5 },
  demoTitle: { fontSize: 13, fontWeight: '900', color: Colors.textPrimary, letterSpacing: 0.3, marginBottom: 4 },
  demoSubtitle: { fontSize: 12, color: Colors.textSecondary },
  demoGrid: { gap: 8 },
  demoCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border,
    borderLeftWidth: 3,
    padding: 12,
  },
  demoIconWrap: {
    width: 40, height: 40, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  demoCardTitle: { fontSize: 13, fontWeight: '800', color: Colors.textPrimary, marginBottom: 2 },
  demoCardDesc: { fontSize: 11, color: Colors.textSecondary, lineHeight: 15 },
});
