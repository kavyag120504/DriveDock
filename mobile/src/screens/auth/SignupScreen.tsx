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

export const SignupScreen = ({ navigation }: any) => {
  const [role, setRole] = useState<UserRole>('owner');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [city, setCity] = useState('Mumbai');

  const { signup, isLoading, error } = useAuthStore();

  const handleSignup = async () => {
    if (!name || !email || !phone || !password) return;
    try {
      await signup({
        name,
        email,
        phone,
        password,
        role,
        businessName: role === 'provider' ? businessName : undefined,
        address: { city, state: 'Maharashtra', pincode: '400001' }
      });
    } catch (err) {}
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
        <Text style={styles.backText}>← Back to Login</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Create Account</Text>
      <Text style={styles.subtitle}>Join DriveDock's tamper-proof compliance network</Text>

      {/* Role Picker */}
      <View style={styles.rolePicker}>
        <TouchableOpacity
          style={[styles.roleOption, role === 'owner' && styles.roleActive]}
          onPress={() => setRole('owner')}
        >
          <Text style={[styles.roleText, role === 'owner' && styles.roleTextActive]}>Vehicle Owner</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.roleOption, role === 'provider' && styles.roleActive]}
          onPress={() => setRole('provider')}
        >
          <Text style={[styles.roleText, role === 'provider' && styles.roleTextActive]}>Service Provider</Text>
        </TouchableOpacity>
      </View>

      {role === 'provider' && (
        <View style={styles.providerNotice}>
          <Text style={styles.noticeIcon}>ℹ️</Text>
          <Text style={styles.noticeText}>
            Trust Rule 3: Provider accounts require System Admin approval before appearing in search or certifying renewals.
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
          <Text style={styles.label}>Full Name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Rahul Sharma"
            placeholderTextColor={Colors.textMuted}
            value={name}
            onChangeText={setName}
          />
        </View>

        {role === 'provider' && (
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Business / Center Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Metro PUC & Fitness Testing"
              placeholderTextColor={Colors.textMuted}
              value={businessName}
              onChangeText={setBusinessName}
            />
          </View>
        )}

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Email Address</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. rahul@example.com"
            placeholderTextColor={Colors.textMuted}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Phone Number</Text>
          <TextInput
            style={styles.input}
            placeholder="+91 98765 43210"
            placeholderTextColor={Colors.textMuted}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>City / Region</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Mumbai"
            placeholderTextColor={Colors.textMuted}
            value={city}
            onChangeText={setCity}
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
          style={[styles.submitBtn, isLoading && styles.btnDisabled]}
          onPress={handleSignup}
          disabled={isLoading}
        >
          {isLoading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitBtnText}>Create Account</Text>}
        </TouchableOpacity>
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
  backBtn: {
    marginBottom: 16
  },
  backText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '700'
  },
  title: {
    fontSize: 26,
    fontWeight: '900',
    color: Colors.textPrimary
  },
  subtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 20,
    marginTop: 4
  },
  rolePicker: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 4,
    marginBottom: 16
  },
  roleOption: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8
  },
  roleActive: {
    backgroundColor: Colors.primary
  },
  roleText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary
  },
  roleTextActive: {
    color: '#FFFFFF'
  },
  providerNotice: {
    flexDirection: 'row',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.warning,
    padding: 10,
    gap: 8,
    marginBottom: 16
  },
  noticeIcon: {
    fontSize: 16
  },
  noticeText: {
    flex: 1,
    fontSize: 12,
    color: Colors.warning,
    lineHeight: 16
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
  form: {
    gap: 12
  },
  inputGroup: {
    marginBottom: 4
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: 6,
    textTransform: 'uppercase'
  },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Colors.textPrimary,
    fontSize: 14
  },
  submitBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12
  },
  btnDisabled: {
    opacity: 0.6
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15
  }
});
