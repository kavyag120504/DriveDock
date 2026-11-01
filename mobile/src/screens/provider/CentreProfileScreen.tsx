import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import * as Location from 'expo-location';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Colors } from '../../theme/colors';
import { RoleHeader } from '../../components/RoleHeader';
import { ProvidersAPI } from '../../api/endpoints';
import { useAuthStore } from '../../store/authStore';

export const providerProfileKey = (userId?: string) => ['providerProfile', userId];

const SERVICES = [
  { key: 'puc', label: 'PUC' },
  { key: 'fitness', label: 'Fitness' },
  { key: 'insurance', label: 'Insurance' }
];

const MAX_BAYS = 50;

export const CentreProfileScreen = () => {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);
  const { data: profile, isLoading, refetch } = useQuery({
    queryKey: providerProfileKey(userId),
    queryFn: async () => (await ProvidersAPI.getProfile()).data.data
  });

  const [businessName, setBusinessName] = useState('');
  const [address, setAddress] = useState('');
  const [workingHours, setWorkingHours] = useState('');
  const [serviceTypes, setServiceTypes] = useState<string[]>([]);
  const [capacity, setCapacity] = useState(1);
  const [coords, setCoords] = useState<[number, number] | null>(null); // [lng, lat]
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);

  const isOnboarding = profile ? !profile.profileCompleted : false;

  useEffect(() => {
    if (!profile) return;
    setBusinessName(profile.businessName ?? '');
    setWorkingHours(profile.workingHours ?? '');
    setServiceTypes(profile.serviceTypes ?? []);
    setCapacity(profile.capacity ?? 1);
    if (profile.profileCompleted) {
      // Before onboarding, the stored location and address are signup placeholders, so start blank
      setAddress(profile.address ?? '');
      setCoords(profile.location?.coordinates ?? null);
    }
  }, [profile]);

  const toggleService = (key: string) =>
    setServiceTypes((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));

  const useCurrentLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location needed', 'Allow location access so owners can find your centre on the map.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCoords([pos.coords.longitude, pos.coords.latitude]);
    } catch {
      Alert.alert('Location unavailable', 'Could not read your location. Try again outdoors or check your device settings.');
    } finally {
      setLocating(false);
    }
  };

  const handleSave = async () => {
    if (businessName.trim().length < 2) return Alert.alert('Centre name', 'Enter your centre name.');
    if (address.trim().length < 5) return Alert.alert('Address', 'Enter the full street address of your centre.');
    if (!coords) return Alert.alert('Location', 'Tap "Use my current location" while you are at the centre.');
    if (serviceTypes.length === 0) return Alert.alert('Services', 'Select at least one service you offer.');
    if (!workingHours.trim()) return Alert.alert('Working hours', 'Enter your working hours.');

    setSaving(true);
    try {
      await ProvidersAPI.updateProfile({
        businessName: businessName.trim(),
        address: address.trim(),
        coordinates: coords,
        serviceTypes,
        workingHours: workingHours.trim(),
        capacity
      });
      await queryClient.invalidateQueries({ queryKey: providerProfileKey(userId) });
      if (!isOnboarding) Alert.alert('Saved', 'Your centre profile is updated. New slots will use this bay count.');
    } catch (err: any) {
      Alert.alert('Could not save', err.response?.data?.message || 'Please check your details and try again.');
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={Colors.provider} />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.hint}>Could not load your centre profile.</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <RoleHeader
        title={isOnboarding ? 'Set up your centre' : 'Centre profile'}
        subtitle={isOnboarding ? 'Owners will see these details when booking' : 'Details owners see when booking'}
      />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {isOnboarding && (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>
              Complete these details so an admin can review your centre. Until it is approved, owners cannot find or book it.
            </Text>
          </View>
        )}

        {!isOnboarding && profile.status !== 'approved' && (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>
              Status: {String(profile.status).toUpperCase()}. Owners can only find approved centres.
            </Text>
          </View>
        )}

        <Text style={styles.label}>Centre name</Text>
        <TextInput
          style={styles.input}
          value={businessName}
          onChangeText={setBusinessName}
          placeholder="e.g. Metro PUC & Fitness Testing"
          placeholderTextColor={Colors.textMuted}
        />

        <Text style={styles.label}>Full address</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={address}
          onChangeText={setAddress}
          placeholder="Shop no., street, locality, city, pincode"
          placeholderTextColor={Colors.textMuted}
          multiline
        />

        <Text style={styles.label}>Map location</Text>
        <TouchableOpacity style={styles.locBtn} onPress={useCurrentLocation} disabled={locating}>
          {locating ? (
            <ActivityIndicator color={Colors.provider} size="small" />
          ) : (
            <Text style={styles.locBtnText}>{coords ? 'Update from my current location' : 'Use my current location'}</Text>
          )}
        </TouchableOpacity>
        <Text style={styles.hint}>
          {coords
            ? `Pinned at ${coords[1].toFixed(5)}, ${coords[0].toFixed(5)}`
            : 'Stand at your centre and tap the button so owners nearby can find you.'}
        </Text>

        <Text style={styles.label}>Services you offer</Text>
        <View style={styles.chipRow}>
          {SERVICES.map((s) => {
            const active = serviceTypes.includes(s.key);
            return (
              <TouchableOpacity
                key={s.key}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => toggleService(s.key)}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{s.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.label}>Working hours</Text>
        <TextInput
          style={styles.input}
          value={workingHours}
          onChangeText={setWorkingHours}
          placeholder="09:00 AM - 07:00 PM"
          placeholderTextColor={Colors.textMuted}
        />

        <Text style={styles.label}>Service bays</Text>
        <View style={styles.stepperCard}>
          <TouchableOpacity
            style={[styles.stepBtn, capacity <= 1 && styles.stepBtnOff]}
            onPress={() => setCapacity((c) => Math.max(1, c - 1))}
            disabled={capacity <= 1}
          >
            <Text style={styles.stepBtnText}>−</Text>
          </TouchableOpacity>
          <View style={styles.stepValueBox}>
            <Text style={styles.stepValue}>{capacity}</Text>
            <Text style={styles.stepUnit}>{capacity === 1 ? 'vehicle at a time' : 'vehicles at a time'}</Text>
          </View>
          <TouchableOpacity
            style={[styles.stepBtn, capacity >= MAX_BAYS && styles.stepBtnOff]}
            onPress={() => setCapacity((c) => Math.min(MAX_BAYS, c + 1))}
            disabled={capacity >= MAX_BAYS}
          >
            <Text style={styles.stepBtnText}>+</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.hint}>
          How many vehicles your centre can service at the same time. Each time slot you open allows this many bookings.
          Slots you already created keep their own limit.
        </Text>

        <TouchableOpacity
          style={[styles.saveBtn, saving && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.saveBtnText}>{isOnboarding ? 'Submit centre for review' : 'Save changes'}</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 48 },
  notice: {
    backgroundColor: Colors.warningBg,
    borderColor: Colors.warningBorder,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16
  },
  noticeText: { fontSize: 12, color: Colors.warning, lineHeight: 17 },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: 6,
    marginTop: 14
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
  multiline: { minHeight: 70, textAlignVertical: 'top' },
  hint: { fontSize: 11, color: Colors.textSecondary, marginTop: 6, lineHeight: 16 },
  locBtn: {
    borderWidth: 1.5,
    borderColor: Colors.provider,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: Colors.surface
  },
  locBtnText: { color: Colors.provider, fontWeight: '800', fontSize: 13 },
  chipRow: { flexDirection: 'row', gap: 8 },
  chip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center'
  },
  chipActive: { backgroundColor: Colors.provider, borderColor: Colors.provider },
  chipText: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  chipTextActive: { color: '#FFFFFF' },
  stepperCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 10
  },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: Colors.provider,
    alignItems: 'center',
    justifyContent: 'center'
  },
  stepBtnOff: { opacity: 0.35 },
  stepBtnText: { color: '#FFFFFF', fontSize: 24, fontWeight: '800', lineHeight: 28 },
  stepValueBox: { alignItems: 'center' },
  stepValue: { fontSize: 28, fontWeight: '900', color: Colors.textPrimary },
  stepUnit: { fontSize: 11, color: Colors.textSecondary },
  saveBtn: {
    backgroundColor: Colors.provider,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 24
  },
  saveBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  retryBtn: {
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.provider
  },
  retryText: { color: Colors.provider, fontWeight: '700' }
});
