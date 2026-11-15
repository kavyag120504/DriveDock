import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { DemoAPI } from '../../api/endpoints';
import { Button, Field, FormScreen, Notice } from '../../components/UI';
import { useAuthStore, UserRole } from '../../store/authStore';
import { BorderRadius, Colors, Shadow } from '../../theme/colors';

const DEMO_ROLES: {
  role: UserRole;
  label: string;
  desc: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}[] = [
  {
    role: 'owner',
    label: 'Vehicle Owner',
    desc: 'Vehicles, verified docs, rotating QR, renewals',
    icon: 'car-outline',
    color: Colors.owner,
  },
  {
    role: 'provider',
    label: 'Approved Provider',
    desc: 'PUC / Fitness center - issue verified certificates',
    icon: 'construct-outline',
    color: Colors.provider,
  },
  {
    role: 'officer',
    label: 'Traffic Police Officer',
    desc: 'Scan rotating QR - tamper-proof green / red result',
    icon: 'shield-checkmark-outline',
    color: Colors.officer,
  },
  {
    role: 'government',
    label: 'Government / RTO',
    desc: 'Regional compliance analytics, charts and trends',
    icon: 'bar-chart-outline',
    color: Colors.government,
  },
  {
    role: 'admin',
    label: 'System Administrator',
    desc: 'Approve pending providers - gatekeeping checks',
    icon: 'settings-outline',
    color: Colors.admin,
  },
];

export const LoginScreen = ({ navigation }: any) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const { login, quickDemoLogin, isLoading, error, clearError } = useAuthStore();

  const handleLogin = async () => {
    setSubmitted(true);
    if (isLoading || !email || !password) return;
    try {
      await login(email, password);
    } catch (err) {}
  };

  // Demo only: the provider button lets you pick which station to log in as, so a booking
  // made at any station can be shown on that station's screen
  const [stations, setStations] = useState<any[] | null>(null);
  const [isLoadingStations, setIsLoadingStations] = useState(false);

  const handleDemo = async (role: UserRole) => {
    clearError();
    if (role === 'provider') {
      if (stations) {
        setStations(null); // tap again to collapse
        return;
      }
      setIsLoadingStations(true);
      try {
        const res = await DemoAPI.stations();
        const list = res.data.data || [];
        if (list.length > 1) {
          setStations(list);
          return;
        }
      } catch {
        // Demo endpoint off (DEMO_MODE not set): fall back to the default provider account
      } finally {
        setIsLoadingStations(false);
      }
    }
    try {
      await quickDemoLogin(role);
    } catch {
      /* The auth store displays the error. */
    }
  };

  return (
    <FormScreen>
      <View style={styles.brandHeader}>
        <View style={styles.logoRow}>
          <View style={styles.brandIcon}>
            <Ionicons name="layers-outline" size={28} color="#FFFFFF" />
          </View>
          <Text style={styles.logoDrive}>
            Drive<Text style={styles.logoDock}>Dock</Text>
          </Text>
        </View>
        <Text style={styles.kicker}>YOUR VEHICLE. ONE PASSPORT.</Text>
        <Text style={styles.tagline}>Keep every journey{'\n'}one step ahead.</Text>
        <Text style={styles.explainer}>
          Your vehicle documents, renewals and verification, together in one place.
        </Text>
      </View>

      <View style={[styles.card, Shadow.card]}>
        <Text accessibilityRole="header" style={styles.cardTitle}>
          Welcome back
        </Text>
        <Text style={styles.cardSubtitle}>Sign in to your DriveDock workspace.</Text>
        {error && (
          <Notice title="Couldn't sign in" tone="error">
            {error}
          </Notice>
        )}
        <Field
          label="Email address"
          placeholder="you@example.com"
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            clearError();
          }}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          autoComplete="email"
          textContentType="username"
          returnKeyType="next"
          error={submitted && !email ? 'Enter your email address.' : undefined}
        />
        <Field
          label="Password"
          placeholder="Enter your password"
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            clearError();
          }}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={handleLogin}
          error={submitted && !password ? 'Enter your password.' : undefined}
        />
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
          onPress={() => setShowPassword(!showPassword)}
          style={styles.passwordToggle}
        >
          <Ionicons
            name={showPassword ? 'eye-off-outline' : 'eye-outline'}
            size={18}
            color={Colors.primary}
          />
          <Text style={styles.passwordToggleText}>{showPassword ? 'Hide password' : 'Show password'}</Text>
        </TouchableOpacity>
        <Button label="Sign in" icon="arrow-forward" onPress={handleLogin} loading={isLoading} />
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => {
            clearError();
            navigation.navigate('Signup');
          }}
          style={styles.signupLink}
        >
          <Text style={styles.signupText}>
            New to DriveDock?{' '}
            <Text style={{ color: Colors.primary, fontWeight: '700' }}>Create an account</Text>
          </Text>
        </TouchableOpacity>
      </View>
      <View style={styles.securityNote}>
        <Ionicons name="shield-checkmark-outline" size={18} color={Colors.primary} />
        <Text style={styles.securityText}>Owner, service provider and officer access</Text>
      </View>

      {/* 1-Tap Demo Section - only visible in development builds */}
      {__DEV__ && (
        <View style={[styles.demoSection, Shadow.card]}>
          <View style={styles.demoHeader}>
            <View style={styles.demoBadge}>
              <Ionicons name="flash" size={11} color={Colors.primary} />
              <Text style={styles.demoBadgeText}>1-TAP DEMO</Text>
            </View>
            <Text style={styles.demoTitle}>ROLE SWITCHER FOR EVALUATION</Text>
            <Text style={styles.demoSubtitle}>
              Tap any role to instantly log in with a real backend JWT session:
            </Text>
          </View>

          <View style={styles.demoGrid}>
            {DEMO_ROLES.map(({ role, label, desc, icon, color }) => (
              <React.Fragment key={role}>
                <TouchableOpacity
                  accessibilityRole="button"
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
                  {role === 'provider' && isLoadingStations ? (
                    <ActivityIndicator size="small" color={color} />
                  ) : (
                    <Ionicons
                      name={role === 'provider' && stations ? 'chevron-down' : 'chevron-forward'}
                      size={16}
                      color={Colors.textMuted}
                    />
                  )}
                </TouchableOpacity>

                {role === 'provider' && stations && (
                  <View style={styles.stationList}>
                    <Text style={styles.stationListTitle}>LOG IN AS STATION</Text>
                    {stations.map((st) => (
                      <TouchableOpacity
                        accessibilityRole="button"
                        key={st.providerId}
                        style={styles.stationRow}
                        onPress={() => {
                          if (st.email) quickDemoLogin('provider', st.email).catch(() => {});
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.stationName}>{st.businessName}</Text>
                          <Text style={styles.stationAddr} numberOfLines={1}>
                            {st.address}
                          </Text>
                        </View>
                        {st.status !== 'approved' && (
                          <Text style={styles.stationPending}>{String(st.status).toUpperCase()}</Text>
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </React.Fragment>
            ))}
          </View>
        </View>
      )}
    </FormScreen>
  );
};

const styles = StyleSheet.create({
  // Brand
  brandHeader: { marginBottom: 28, paddingTop: 12 },
  brandIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardSubtitle: { fontSize: 14, color: Colors.textSecondary, lineHeight: 21, marginBottom: 24 },
  passwordToggle: {
    minHeight: 44,
    flexDirection: 'row',
    gap: 7,
    alignItems: 'center',
    alignSelf: 'flex-end',
    marginTop: -10,
    marginBottom: 10,
  },
  passwordToggleText: { fontSize: 13, fontWeight: '600', color: Colors.primary },
  securityNote: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 28,
  },
  securityText: { fontSize: 12, color: Colors.textSecondary, flexShrink: 1 },
  kicker: { fontSize: 11, fontWeight: '800', letterSpacing: 2, color: Colors.textMuted, marginBottom: 8 },
  logoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  logoDrive: { fontSize: 32, fontWeight: '800', letterSpacing: -1, color: Colors.textPrimary },
  logoDock: { fontSize: 32, fontWeight: '800', letterSpacing: -1, color: Colors.primary },
  tagline: {
    fontSize: 33,
    fontWeight: '800',
    letterSpacing: -0.8,
    color: Colors.textPrimary,
    lineHeight: 40,
    marginBottom: 12,
  },
  explainer: { fontSize: 15, color: Colors.textSecondary, lineHeight: 23 },

  // Login card
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 20,
    marginBottom: 24,
  },
  cardTitle: { fontSize: 23, fontWeight: '700', color: Colors.textPrimary, marginBottom: 6 },
  signupLink: { alignItems: 'center', justifyContent: 'center', minHeight: 48, marginTop: 10 },
  signupText: { color: Colors.textSecondary, fontSize: 13 },

  // Demo section
  demoSection: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
  },
  demoHeader: { marginBottom: 16 },
  demoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primaryLight,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    marginBottom: 8,
  },
  demoBadgeText: { fontSize: 10, fontWeight: '800', color: Colors.primary, letterSpacing: 0.5 },
  demoTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: Colors.textPrimary,
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  demoSubtitle: { fontSize: 12, color: Colors.textSecondary },
  demoGrid: { gap: 8 },
  demoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 3,
    padding: 12,
  },
  demoIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  demoCardTitle: { fontSize: 13, fontWeight: '800', color: Colors.textPrimary, marginBottom: 2 },
  stationList: {
    marginLeft: 12,
    paddingLeft: 12,
    borderLeftWidth: 2,
    borderLeftColor: Colors.provider + '40',
    gap: 6,
  },
  stationListTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.provider,
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  stationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  stationName: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  stationAddr: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  stationPending: { fontSize: 9, fontWeight: '800', color: Colors.warning, letterSpacing: 0.6 },
  demoCardDesc: { fontSize: 11, color: Colors.textSecondary, lineHeight: 15 },
});
