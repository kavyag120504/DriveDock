import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert
} from 'react-native';
import { Colors } from '../../theme/colors';
import { AdminAPI } from '../../api/endpoints';

const ROLES = [
  { value: 'officer', label: 'Traffic Officer' },
  { value: 'government', label: 'Government Official' }
];

export const CreateStaffScreen = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'officer' | 'government'>('officer');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const reset = () => {
    setName('');
    setEmail('');
    setPhone('');
    setPassword('');
    setRole('officer');
  };

  const handleCreate = async () => {
    if (!name.trim() || !email.trim() || !phone.trim() || !password.trim()) {
      Alert.alert('Required', 'All fields are required');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Weak Password', 'Password must be at least 8 characters');
      return;
    }
    if (!/(?=.*[a-zA-Z])(?=.*\d)/.test(password)) {
      Alert.alert('Weak Password', 'Password must contain at least one letter and one number');
      return;
    }

    setIsSubmitting(true);
    try {
      await AdminAPI.createStaffUser({ name: name.trim(), email: email.trim(), phone: phone.trim(), password, role });
      Alert.alert(
        'Account Created',
        `${ROLES.find((r) => r.value === role)?.label} account for ${name.trim()} created successfully.`,
        [{ text: 'Create Another', onPress: reset }]
      );
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to create account');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Create Staff Account</Text>
      <Text style={styles.subtitle}>
        Create officer or government accounts. These roles cannot self-register.
      </Text>

      {/* Role Picker */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Role</Text>
        <View style={styles.roleRow}>
          {ROLES.map((r) => (
            <TouchableOpacity
              key={r.value}
              style={[styles.roleBtn, role === r.value && styles.roleBtnActive]}
              onPress={() => setRole(r.value as 'officer' | 'government')}
            >
              <Text style={[styles.roleBtnText, role === r.value && styles.roleBtnTextActive]}>
                {r.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Full Name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g. Ravi Kumar"
          placeholderTextColor={Colors.textMuted}
          autoCapitalize="words"
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="e.g. officer@drivedock.com"
          placeholderTextColor={Colors.textMuted}
          keyboardType="email-address"
          autoCapitalize="none"
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Phone</Text>
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          placeholder="+91XXXXXXXXXX"
          placeholderTextColor={Colors.textMuted}
          keyboardType="phone-pad"
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Temporary Password</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="Min 8 chars, letters + numbers"
          placeholderTextColor={Colors.textMuted}
          secureTextEntry
        />
      </View>

      <TouchableOpacity
        style={[styles.submitBtn, isSubmitting && styles.btnDisabled]}
        onPress={handleCreate}
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.submitBtnText}>Create Account</Text>
        )}
      </TouchableOpacity>
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
    paddingTop: 52,
    paddingBottom: 60
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: Colors.textPrimary,
    marginBottom: 4
  },
  subtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 28,
    lineHeight: 18
  },
  inputGroup: {
    marginBottom: 16
  },
  label: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: 6
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
  roleRow: {
    flexDirection: 'row',
    gap: 10
  },
  roleBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface
  },
  roleBtnActive: {
    borderColor: Colors.admin,
    backgroundColor: 'rgba(139,92,246,0.1)'
  },
  roleBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary
  },
  roleBtnTextActive: {
    color: Colors.admin
  },
  submitBtn: {
    backgroundColor: Colors.admin,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8
  },
  btnDisabled: {
    opacity: 0.6
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 15
  }
});
