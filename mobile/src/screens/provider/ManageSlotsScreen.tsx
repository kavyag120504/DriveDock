import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert
} from 'react-native';
import { Colors } from '../../theme/colors';
import { RoleHeader } from '../../components/RoleHeader';
import { ProvidersAPI } from '../../api/endpoints';

export const ManageSlotsScreen = () => {
  const [profile, setProfile] = useState<any>(null);
  const [slots, setSlots] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

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

  const handleGenerateDaySlots = async () => {
    if (!profile) return;
    setIsCreating(true);

    const today = new Date().toISOString().split('T')[0];
    const newSlots = [
      { date: today, startTime: '09:00 AM', endTime: '10:00 AM' },
      { date: today, startTime: '10:30 AM', endTime: '11:30 AM' },
      { date: today, startTime: '01:00 PM', endTime: '02:00 PM' },
      { date: today, startTime: '02:30 PM', endTime: '03:30 PM' },
      { date: today, startTime: '04:00 PM', endTime: '05:00 PM' }
    ];

    try {
      await ProvidersAPI.createSlots(profile._id, newSlots);
      Alert.alert('Slots Created', '5 new inspection slots added for booking.');
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
        {/* Quick Action */}
        <View style={styles.actionCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.actionTitle}>Generate Daily Slots</Text>
            <Text style={styles.actionDesc}>
              Creates 5 standard inspection slots for atomic reservation.
            </Text>
          </View>
          <TouchableOpacity
            style={styles.genBtn}
            onPress={handleGenerateDaySlots}
            disabled={isCreating}
          >
            {isCreating ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.genBtnText}>+ Add Slots</Text>
            )}
          </TouchableOpacity>
        </View>

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
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 20
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.textPrimary
  },
  actionDesc: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2
  },
  genBtn: {
    backgroundColor: Colors.provider,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8
  },
  genBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12
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
