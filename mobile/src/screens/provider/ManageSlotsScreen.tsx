import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput
} from 'react-native';
import { Colors } from '../../theme/colors';
import { RoleHeader } from '../../components/RoleHeader';
import { ProvidersAPI } from '../../api/endpoints';

const TIME_TEMPLATES = [
  { label: 'Morning (9-12)', slots: [
    { startTime: '09:00 AM', endTime: '10:00 AM' },
    { startTime: '10:30 AM', endTime: '11:30 AM' },
  ]},
  { label: 'Afternoon (12-5)', slots: [
    { startTime: '01:00 PM', endTime: '02:00 PM' },
    { startTime: '02:30 PM', endTime: '03:30 PM' },
    { startTime: '04:00 PM', endTime: '05:00 PM' },
  ]},
  { label: 'Full Day', slots: [
    { startTime: '09:00 AM', endTime: '10:00 AM' },
    { startTime: '10:30 AM', endTime: '11:30 AM' },
    { startTime: '01:00 PM', endTime: '02:00 PM' },
    { startTime: '02:30 PM', endTime: '03:30 PM' },
    { startTime: '04:00 PM', endTime: '05:00 PM' },
  ]},
];

const todayDate = () => new Date().toISOString().split('T')[0];

export const ManageSlotsScreen = () => {
  const [profile, setProfile] = useState<any>(null);
  const [slots, setSlots] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [slotDate, setSlotDate] = useState(todayDate());
  const [selectedTemplate, setSelectedTemplate] = useState(2); // Full Day default

  const fetchProfileAndSlots = async () => {
    try {
      const pRes = await ProvidersAPI.getProfile();
      const pData = pRes.data.data;
      setProfile(pData);

      if (pData) {
        const sRes = await ProvidersAPI.getSlots(pData._id);
        setSlots(sRes.data.data || []);
      }
    } catch (err) {
      console.error('Fetch slots error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProfileAndSlots();
  }, []);

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
    const newSlots = template.slots.map(s => ({ date: slotDate, ...s }));

    try {
      await ProvidersAPI.createSlots(profile._id, newSlots);
      Alert.alert('Slots Created', `${newSlots.length} slots added for ${slotDate}.`);
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
      <RoleHeader
        title="Inspection Slots"
        subtitle="Manage testing bays & appointment capacity"
        onRefresh={fetchProfileAndSlots}
      />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Slot creation form */}
        {!showForm ? (
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowForm(true)}>
            <Text style={styles.addBtnText}>+ Add Inspection Slots</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>New Slots</Text>

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
            <View style={styles.templateRow}>
              {TIME_TEMPLATES.map((t, i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.templateBtn, selectedTemplate === i && styles.templateBtnActive]}
                  onPress={() => setSelectedTemplate(i)}
                >
                  <Text style={[styles.templateBtnText, selectedTemplate === i && styles.templateBtnTextActive]}>
                    {t.label}
                  </Text>
                  <Text style={[styles.templateCount, selectedTemplate === i && styles.templateBtnTextActive]}>
                    {t.slots.length} slots
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.formActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowForm(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.genBtn, isCreating && { opacity: 0.6 }]}
                onPress={handleCreateSlots}
                disabled={isCreating}
              >
                {isCreating ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.genBtnText}>Create {TIME_TEMPLATES[selectedTemplate].slots.length} Slots</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        <Text style={styles.sectionHeader}>ALL SLOTS ({slots.length})</Text>

        {isLoading ? (
          <ActivityIndicator size="large" color={Colors.provider} style={{ marginTop: 30 }} />
        ) : slots.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No Slots Configured</Text>
            <Text style={styles.emptyDesc}>Tap "+ Add Slots" to open booking capacity for owners.</Text>
          </View>
        ) : (
          slots.map((s) => (
            <View key={s._id} style={styles.slotRow}>
              <View>
                <Text style={styles.slotTime}>{s.startTime} - {s.endTime}</Text>
                <Text style={styles.slotDate}>{s.date}</Text>
              </View>

              <View
                style={[
                  styles.slotBadge,
                  { backgroundColor: s.isBooked ? Colors.nonCompliantBg : Colors.compliantBg }
                ]}
              >
                <Text
                  style={[
                    styles.slotBadgeText,
                    { color: s.isBooked ? Colors.nonCompliant : Colors.compliant }
                  ]}
                >
                  {s.isBooked ? 'CLAIMED' : 'AVAILABLE'}
                </Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background
  },
  scroll: {
    flex: 1
  },
  content: {
    padding: 16,
    paddingBottom: 40
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
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  formInput: {
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
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
    paddingVertical: 10,
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
    paddingVertical: 10,
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
    marginBottom: 10
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
    marginBottom: 10
  },
  slotTime: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.textPrimary
  },
  slotDate: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2
  },
  slotBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6
  },
  slotBadgeText: {
    fontSize: 11,
    fontWeight: '800'
  },
  emptyCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 32,
    alignItems: 'center',
    marginTop: 20
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.textPrimary
  },
  emptyDesc: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 4
  }
});
