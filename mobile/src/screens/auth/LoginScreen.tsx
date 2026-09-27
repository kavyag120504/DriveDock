import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator
} from 'react-native';
import { Colors } from '../../theme/colors';
import { useAuthStore, UserRole } from '../../store/authStore';

export const LoginScreen = ({ navigation }: any) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, quickDemoLogin, isLoading, error, clearError } = useAuthStore();

  const handleLogin = async () => {
    if (!email || !password) return;
    try {
      await login(email, password);
    } catch (err) {}
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
        <Text style={styles.logoTitle}>DRIVEDOCK</Text>
        <Text style={styles.tagline}>
          Other apps store your vehicle papers.{'\n'}
          <Text style={styles.taglineHighlight}>DriveDock proves they are genuine.</Text>
        </Text>
        <Text style={styles.explainer}>
          One Vehicle Passport for RC, PUC, Insurance & Fitness. Providers certify genuine documents. Police scan a rotating QR that cannot be copied.
        </Text>
      </View>

      {/* Login Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Sign In</Text>

        {error && (
          <View style={styles.errorBox}>
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

        <TouchableOpacity
          onPress={() => navigation.navigate('Signup')}
          style={styles.signupLink}
        >
          <Text style={styles.signupText}>
            Don't have an account? <Text style={{ color: Colors.primary, fontWeight: '700' }}>Register here</Text>
          </Text>
        </TouchableOpacity>
      </View>

      {/* 1-Tap Demo Switcher (Crucial for Viva Evaluation) */}
      <View style={styles.demoSection}>
        <View style={styles.demoSectionHeader}>
          <Text style={styles.demoTitle}>⚡ 1-TAP DEMO ROLES FOR EVALUATION</Text>
          <Text style={styles.demoSubtitle}>Tap any role to immediately test real backend JWT session:</Text>
        </View>

        <View style={styles.demoGrid}>
          <TouchableOpacity
            style={[styles.demoCard, { borderColor: Colors.owner }]}
            onPress={() => handleDemo('owner')}
          >
            <Text style={styles.demoIcon}>🚗</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.demoCardTitle}>Vehicle Owner</Text>
              <Text style={styles.demoCardDesc}>Vehicles, verified docs, rotating QR, renewals</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.demoCard, { borderColor: Colors.provider }]}
            onPress={() => handleDemo('provider')}
          >
            <Text style={styles.demoIcon}>🔧</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.demoCardTitle}>Approved Provider</Text>
              <Text style={styles.demoCardDesc}>PUC / Fitness center, issue verified certificates</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.demoCard, { borderColor: Colors.officer }]}
            onPress={() => handleDemo('officer')}
          >
            <Text style={styles.demoIcon}>👮</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.demoCardTitle}>Traffic Police Officer</Text>
              <Text style={styles.demoCardDesc}>Scan rotating QR, tamper-proof green/red check</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.demoCard, { borderColor: Colors.government }]}
            onPress={() => handleDemo('government')}
          >
            <Text style={styles.demoIcon}>🏛️</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.demoCardTitle}>Government / RTO</Text>
              <Text style={styles.demoCardDesc}>Regional compliance analytics, charts, trends</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.demoCard, { borderColor: Colors.admin }]}
            onPress={() => handleDemo('admin')}
          >
            <Text style={styles.demoIcon}>🛡️</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.demoCardTitle}>System Administrator</Text>
              <Text style={styles.demoCardDesc}>Approve pending providers, gatekeeping checks</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background
  },
  content: {
    padding: 20,
    paddingTop: 48,
    paddingBottom: 60
  },
  brandHeader: {
    marginBottom: 24
  },
  kicker: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    color: Colors.textMuted,
    marginBottom: 6
  },
  logoTitle: {
    fontSize: 38,
    fontWeight: '900',
    letterSpacing: 2,
    color: Colors.textPrimary,
    marginBottom: 8
  },
  tagline: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    lineHeight: 24,
    marginBottom: 8
  },
  taglineHighlight: {
    color: Colors.primary
  },
  explainer: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 20,
    marginBottom: 28
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: 16
  },
  errorBox: {
    backgroundColor: Colors.nonCompliantBg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.nonCompliant,
    padding: 10,
    marginBottom: 16
  },
  errorText: {
    color: Colors.nonCompliant,
    fontSize: 12,
    fontWeight: '600'
  },
  inputGroup: {
    marginBottom: 14
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  input: {
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Colors.textPrimary,
    fontSize: 14
  },
  primaryBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8
  },
  btnDisabled: {
    opacity: 0.6
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
    letterSpacing: 0.5
  },
  signupLink: {
    alignItems: 'center',
    marginTop: 14
  },
  signupText: {
    color: Colors.textSecondary,
    fontSize: 13
  },
  demoSection: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.borderHighlight,
    padding: 16
  },
  demoSectionHeader: {
    marginBottom: 14
  },
  demoTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    color: Colors.primary,
    marginBottom: 2
  },
  demoSubtitle: {
    fontSize: 12,
    color: Colors.textSecondary
  },
  demoGrid: {
    gap: 10
  },
  demoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceLight,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    gap: 12
  },
  demoIcon: {
    fontSize: 24
  },
  demoCardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.textPrimary
  },
  demoCardDesc: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1
  }
});
