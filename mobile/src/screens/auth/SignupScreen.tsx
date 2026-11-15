import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Button, Field, FormScreen, PageHeading } from '../../components/UI';
import { useAuthStore, UserRole } from '../../store/authStore';
import { Colors } from '../../theme/colors';

export const SignupScreen = ({ navigation }: any) => {
  const [submitted, setSubmitted] = useState(false);
  const [role, setRole] = useState<UserRole>('owner');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [city, setCity] = useState('Mumbai');

  const { signup, isLoading, error } = useAuthStore();

  const handleSignup = async () => {
    setSubmitted(true);
    if (!name || !email || !phone || !password) return;
    try {
      await signup({
        name,
        email,
        phone,
        password,
        role,
        businessName: role === 'provider' ? businessName : undefined,
        address: { city, state: 'Maharashtra', pincode: '400001' },
      });
    } catch (err) {}
  };

  return (
    <FormScreen>
      <PageHeading
        title="Create your account"
        subtitle="A simpler way to manage your vehicle documents and services."
        onBack={() => navigation.goBack()}
        backLabel="Sign in"
      />

      {/* Role Picker */}
      <View style={styles.rolePicker}>
        <TouchableOpacity
          accessibilityRole="button"
          style={[styles.roleOption, role === 'owner' && styles.roleActive]}
          accessibilityState={{ selected: role === 'owner' }}
          onPress={() => setRole('owner')}
        >
          <Text style={[styles.roleText, role === 'owner' && styles.roleTextActive]}>Vehicle Owner</Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          style={[styles.roleOption, role === 'provider' && styles.roleActive]}
          accessibilityState={{ selected: role === 'provider' }}
          onPress={() => setRole('provider')}
        >
          <Text style={[styles.roleText, role === 'provider' && styles.roleTextActive]}>
            Service Provider
          </Text>
        </TouchableOpacity>
      </View>

      {role === 'provider' && (
        <View style={styles.providerNotice}>
          <Text style={styles.noticeText}>
            Your centre needs administrator approval before owners can find it or book a service. You can set
            up your centre after creating an account.
          </Text>
        </View>
      )}

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <View style={styles.form}>
        <View style={styles.inputGroup}>
          <Field
            label="Full Name"
            error={submitted && !name ? 'Enter your full name.' : undefined}
            placeholder="e.g. Rahul Sharma"
            placeholderTextColor={Colors.textMuted}
            value={name}
            onChangeText={setName}
          />
        </View>

        {role === 'provider' && (
          <View style={styles.inputGroup}>
            <Field
              label="Business / Center Name"
              placeholder="e.g. Metro PUC & Fitness Testing"
              placeholderTextColor={Colors.textMuted}
              value={businessName}
              onChangeText={setBusinessName}
            />
          </View>
        )}

        <View style={styles.inputGroup}>
          <Field
            label="Email Address"
            error={submitted && !email ? 'Enter your email address.' : undefined}
            placeholder="e.g. rahul@example.com"
            placeholderTextColor={Colors.textMuted}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
        </View>

        <View style={styles.inputGroup}>
          <Field
            label="Phone Number"
            error={submitted && !phone ? 'Enter your phone number.' : undefined}
            placeholder="+91 98765 43210"
            placeholderTextColor={Colors.textMuted}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
        </View>

        <View style={styles.inputGroup}>
          <Field
            label="City / Region"
            placeholder="e.g. Mumbai"
            placeholderTextColor={Colors.textMuted}
            value={city}
            onChangeText={setCity}
          />
        </View>

        <View style={styles.inputGroup}>
          <Field
            label="Password"
            error={submitted && !password ? 'Enter a password.' : undefined}
            placeholder="••••••••"
            placeholderTextColor={Colors.textMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
        </View>

        <Button label="Create account" onPress={handleSignup} loading={isLoading} icon="arrow-forward" />
      </View>
    </FormScreen>
  );
};

const styles = StyleSheet.create({
  rolePicker: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 4,
    marginBottom: 16,
  },
  roleOption: {
    flex: 1,
    minHeight: 48,
    justifyContent: 'center',
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
  },
  roleActive: {
    backgroundColor: Colors.primary,
  },
  roleText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  roleTextActive: {
    color: '#FFFFFF',
  },
  providerNotice: {
    flexDirection: 'row',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.warning,
    padding: 10,
    gap: 8,
    marginBottom: 16,
  },
  noticeText: {
    flex: 1,
    fontSize: 12,
    color: Colors.warning,
    lineHeight: 16,
  },
  errorBox: {
    backgroundColor: Colors.nonCompliantBg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.nonCompliant,
    padding: 10,
    marginBottom: 16,
  },
  errorText: {
    color: Colors.nonCompliant,
    fontSize: 12,
    fontWeight: '600',
  },
  form: {
    gap: 12,
  },
  inputGroup: {
    marginBottom: 4,
  },
});
