import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ProvidersAPI } from '../../api/endpoints';
import { RoleHeader } from '../../components/RoleHeader';
import { Notice, ScreenState } from '../../components/UI';
import { WorkspaceScreen } from '../../components/WorkspaceScreen';
import { Colors } from '../../theme/colors';
import { useResponsiveLayout } from '../../theme/responsive';

// A PUC test plus handover fits in 25 minutes, so slots run back to back in 25-minute steps.
const SLOT_MINUTES = 25;

const label12h = (minutes: number) => {
  const h24 = Math.floor(minutes / 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${String(h12).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
};

/** Back-to-back slots inside a window, e.g. 9:00–12:00 gives 9:00–9:25 … 11:30–11:55. */
const slotsBetween = (fromHour: number, toHour: number) => {
  const slots: { startTime: string; endTime: string }[] = [];
  for (let t = fromHour * 60; t + SLOT_MINUTES <= toHour * 60; t += SLOT_MINUTES) {
    slots.push({ startTime: label12h(t), endTime: label12h(t + SLOT_MINUTES) });
  }
  return slots;
};

const TIME_TEMPLATES = [
  { label: 'Morning (9-12)', slots: slotsBetween(9, 12) },
  { label: 'Afternoon (1-5)', slots: slotsBetween(13, 17) },
  { label: 'Full Day', slots: [...slotsBetween(9, 12), ...slotsBetween(13, 17)] },
];

// Local calendar date (toISOString is UTC, which is still "yesterday" in India until 5:30 am)
const todayDate = () => new Date().toLocaleDateString('en-CA');

export const ManageSlotsScreen = () => {
  const { stackFields } = useResponsiveLayout();
  const [loadError, setLoadError] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [slots, setSlots] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [slotDate, setSlotDate] = useState(todayDate());
  const [selectedTemplate, setSelectedTemplate] = useState(2); // Full Day default

  const fetchProfileAndSlots = async () => {
    setLoadError(false);
    try {
      const pRes = await ProvidersAPI.getProfile();
      const pData = pRes.data.data;
      setProfile(pData);

      if (pData) {
        const sRes = await ProvidersAPI.getSlots(pData._id);
        setSlots(sRes.data.data || []);
      }
    } catch (err) {
      setLoadError(true);
      console.error('Fetch slots error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Reload on every visit so a capacity change made in the Centre tab shows up here
  useFocusEffect(
    useCallback(() => {
      fetchProfileAndSlots();
    }, [])
  );

  const handleCreateSlots = async () => {
    if (!profile) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(slotDate)) {
      Alert.alert('Invalid Date', 'Enter date in YYYY-MM-DD format (e.g. 2025-06-15)');
      return;
    }
    if (new Date(slotDate) < new Date(new Date().toDateString())) {
      Alert.alert('Invalid Date', 'Cannot create slots for a past date');
      return;
    }

    setIsCreating(true);
    const template = TIME_TEMPLATES[selectedTemplate];
    const newSlots = template.slots.map((s) => ({ date: slotDate, ...s }));

    try {
      const res = await ProvidersAPI.createSlots(profile._id, newSlots);
      Alert.alert('Slots Created', `${res.data.message} (${slotDate}).`);
      setShowForm(false);
      fetchProfileAndSlots();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to create slots');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <View style={styles.container}>
      <WorkspaceScreen
        header={
          <RoleHeader
            title="Inspection Slots"
            subtitle="Manage testing bays & appointment capacity"
            onRefresh={fetchProfileAndSlots}
          />
        }
      >
        {loadError && (
          <Notice title="Couldn't refresh availability" tone="error">
            Check your connection and try again. Previously loaded slots may be out of date.
          </Notice>
        )}
        {/* Slot creation form */}
        {!showForm ? (
          <TouchableOpacity
            accessibilityRole="button"
            style={styles.addBtn}
            onPress={() => setShowForm(true)}
          >
            <Text style={styles.addBtnText}>+ Add Inspection Slots</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>New Slots</Text>
            <Text style={styles.bayNote}>
              Each slot takes up to {profile?.capacity ?? 1} booking
              {(profile?.capacity ?? 1) === 1 ? '' : 's'} at the same time (your centre's service bays).
              Change this in the Centre tab.
            </Text>

            <Text style={styles.formLabel}>Date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.formInput}
              value={slotDate}
              onChangeText={setSlotDate}
              placeholder="e.g. 2025-06-15"
              placeholderTextColor={Colors.textMuted}
              keyboardType="numbers-and-punctuation"
            />

            <Text style={styles.formLabel}>Time Template</Text>
            <View
              style={[styles.templateRow, stackFields && { flexDirection: 'column', alignItems: 'stretch' }]}
            >
              {TIME_TEMPLATES.map((t, i) => (
                <TouchableOpacity
                  accessibilityRole="button"
                  key={i}
                  style={[
                    styles.templateBtn,
                    { flex: stackFields ? 0 : 1 },
                    selectedTemplate === i && styles.templateBtnActive,
                  ]}
                  onPress={() => setSelectedTemplate(i)}
                >
                  <Text
                    style={[styles.templateBtnText, selectedTemplate === i && styles.templateBtnTextActive]}
                  >
                    {t.label}
                  </Text>
                  <Text
                    style={[styles.templateCount, selectedTemplate === i && styles.templateBtnTextActive]}
                  >
                    {t.slots.length} × {SLOT_MINUTES}-min slots
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.formActions}>
              <TouchableOpacity
                accessibilityRole="button"
                style={styles.cancelBtn}
                onPress={() => setShowForm(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                style={[styles.genBtn, isCreating && { opacity: 0.6 }]}
                onPress={handleCreateSlots}
                disabled={isCreating}
              >
                {isCreating ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.genBtnText}>
                    Create {TIME_TEMPLATES[selectedTemplate].slots.length} Slots
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        <Text style={styles.sectionHeader}>ALL SLOTS ({slots.length})</Text>

        {isLoading ? (
          <ScreenState title="Loading availability" loading color={Colors.provider} />
        ) : loadError && slots.length === 0 ? (
          <ScreenState
            title="Availability unavailable"
            action="Try again"
            onAction={fetchProfileAndSlots}
            color={Colors.provider}
          />
        ) : slots.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No Slots Configured</Text>
            <Text style={styles.emptyDesc}>Tap "+ Add Slots" to open booking capacity for owners.</Text>
          </View>
        ) : (
          slots.map((s) => {
            const capacity = s.capacity ?? 1;
            const booked = s.bookedCount ?? (s.isBooked ? 1 : 0);
            return (
              <View
                key={s._id}
                style={[styles.slotRow, stackFields && { flexDirection: 'column', alignItems: 'stretch' }]}
              >
                <View>
                  <Text style={styles.slotTime}>
                    {s.startTime} - {s.endTime}
                  </Text>
                  <Text style={styles.slotDate}>{s.date}</Text>
                </View>

                <View style={styles.slotRight}>
                  <Text style={styles.slotCount}>
                    {booked}/{capacity} bays booked
                  </Text>
                  <View
                    style={[
                      styles.slotBadge,
                      { backgroundColor: s.isBooked ? Colors.nonCompliantBg : Colors.compliantBg },
                    ]}
                  >
                    <Text
                      style={[
                        styles.slotBadgeText,
                        { color: s.isBooked ? Colors.nonCompliant : Colors.compliant },
                      ]}
                    >
                      {s.isBooked ? 'FULL' : 'AVAILABLE'}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </WorkspaceScreen>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  addBtn: {
    backgroundColor: Colors.provider,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 20,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  formCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 20,
  },
  formTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: 14,
  },
  formLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: 6,
  },
  formInput: {
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    minHeight: 48,
    justifyContent: 'center',
    paddingVertical: 12,
    color: Colors.textPrimary,
    fontSize: 14,
    marginBottom: 14,
  },
  templateRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  templateBtn: {
    flex: 1,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: 8,
    alignItems: 'center',
  },
  templateBtnActive: {
    backgroundColor: Colors.provider,
    borderColor: Colors.provider,
  },
  templateBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  templateCount: {
    fontSize: 9,
    color: Colors.textMuted,
    marginTop: 2,
  },
  templateBtnTextActive: {
    color: '#FFFFFF',
  },
  formActions: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    minHeight: 48,
    justifyContent: 'center',
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cancelBtnText: {
    color: Colors.textSecondary,
    fontWeight: '700',
    fontSize: 13,
  },
  genBtn: {
    flex: 2,
    backgroundColor: Colors.provider,
    paddingHorizontal: 14,
    minHeight: 48,
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  genBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.textMuted,
    letterSpacing: 1,
    marginBottom: 10,
  },
  slotRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    marginBottom: 10,
  },
  slotTime: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  slotDate: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  bayNote: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 17,
    marginBottom: 14,
  },
  slotRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  slotCount: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  slotBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  slotBadgeText: {
    fontSize: 13,
    fontWeight: '800',
  },
  emptyCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 32,
    alignItems: 'center',
    marginTop: 20,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  emptyDesc: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 4,
  },
});
