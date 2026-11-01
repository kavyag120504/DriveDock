import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl
} from 'react-native';
import { Colors } from '../../theme/colors';
import { RoleHeader } from '../../components/RoleHeader';
import { StatusPill } from '../../components/StatusPill';
import { BookingsAPI } from '../../api/endpoints';
import { useAuthStore } from '../../store/authStore';

export const TodayBookingsScreen = ({ navigation }: any) => {
  const [bookings, setBookings] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchBookings = async () => {
    try {
      const res = await BookingsAPI.list();
      setBookings(res.data.data || []);
    } catch (err) {
      console.error('Fetch bookings error:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, []);

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchBookings();
  };

  const stationName = useAuthStore((st) => st.user?.provider?.businessName);

  // Upcoming paid appointments first (soonest slot first), then unpaid ones, then history
  const slotKey = (b: any) => `${b.slotId?.date || ''} ${b.slotId?.startTime || ''}`;
  const upcoming = bookings.filter((b) => b.status === 'confirmed').sort((a, b) => slotKey(a).localeCompare(slotKey(b)));
  const awaitingPayment = bookings.filter((b) => b.status === 'pending');
  const history = bookings.filter((b) => b.status === 'completed' || b.status === 'cancelled').slice(0, 15);
  const isNew = (b: any) => Date.now() - new Date(b.createdAt).getTime() < 24 * 60 * 60 * 1000;

  const renderBooking = (b: any) => {
    const isCompleted = b.status === 'completed';
    const isConfirmed = b.status === 'confirmed';

    return (
      <View key={b._id} style={[styles.bookingCard, isConfirmed && isNew(b) && styles.newCard]}>
        <View style={styles.bTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.bReg}>{b.vehicleId?.regNumber || 'Vehicle'}</Text>
            <Text style={styles.bModel}>
              {b.vehicleId?.make} {b.vehicleId?.model} · Owner: {b.ownerId?.name}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            {isNew(b) && b.status !== 'cancelled' && <Text style={styles.newBadge}>NEW</Text>}
            <StatusPill
              label={isConfirmed ? 'PAID' : b.status === 'pending' ? 'UNPAID' : b.status.toUpperCase()}
              type={isCompleted ? 'compliant' : isConfirmed ? 'pending' : 'warning'}
            />
          </View>
        </View>

        <View style={styles.bDetails}>
          <Text style={styles.bDetailItem}>
            Service: <Text style={{ color: Colors.textPrimary, fontWeight: '700' }}>{b.documentType?.toUpperCase()}</Text>
          </Text>
          <Text style={styles.bDetailItem}>
            Slot: <Text style={{ color: Colors.textPrimary, fontWeight: '700' }}>{b.slotId?.startTime} - {b.slotId?.endTime}</Text> ({b.slotId?.date})
          </Text>
        </View>

        <View style={styles.bFooter}>
          {isCompleted ? (
            <Text style={styles.completedText}>Certificate Issued & Verified</Text>
          ) : isConfirmed ? (
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => navigation.navigate('CompleteBooking', { booking: b })}
            >
              <Text style={styles.actionBtnText}>Certify & Complete Inspection →</Text>
            </TouchableOpacity>
          ) : b.status === 'pending' ? (
            <Text style={styles.mutedText}>Waiting for the customer's payment. The slot is released if unpaid for 30 minutes.</Text>
          ) : (
            <Text style={styles.mutedText}>
              {b.cancellationReason === 'payment_timeout' ? 'Cancelled: not paid in time' : 'Cancelled'}
            </Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <RoleHeader
        title="Inspection Orders"
        subtitle={stationName ? `${stationName} · customer bookings` : 'Renewal appointments awaiting testing & certification'}
        onRefresh={onRefresh}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={Colors.provider} />}
      >
        {/* Trust Notice */}
        <View style={styles.trustBanner}>
          <Text style={styles.trustText}>
            <Text style={{ fontWeight: '800', color: Colors.textPrimary }}>Trust Rule 1 Enforcer:</Text> Completing an appointment issues a tamper-proof certificate and marks the vehicle's passport as <Text style={{ color: Colors.compliant, fontWeight: '800' }}>VERIFIED GENUINE</Text>.
          </Text>
        </View>

        {isLoading ? (
          <ActivityIndicator size="large" color={Colors.provider} style={{ marginTop: 30 }} />
        ) : bookings.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No Appointments Yet</Text>
            <Text style={styles.emptyDesc}>When vehicle owners book renewal slots at your station, they will appear here.</Text>
          </View>
        ) : (
          <>
            <Text style={styles.sectionHeader}>UPCOMING APPOINTMENTS ({upcoming.length})</Text>
            {upcoming.length === 0 ? (
              <Text style={styles.sectionEmpty}>No paid appointments waiting for inspection.</Text>
            ) : (
              upcoming.map(renderBooking)
            )}

            {awaitingPayment.length > 0 && (
              <>
                <Text style={styles.sectionHeader}>AWAITING CUSTOMER PAYMENT ({awaitingPayment.length})</Text>
                {awaitingPayment.map(renderBooking)}
              </>
            )}

            {history.length > 0 && (
              <>
                <Text style={styles.sectionHeader}>RECENT HISTORY</Text>
                {history.map(renderBooking)}
              </>
            )}
          </>
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
  trustBanner: {
    flexDirection: 'row',
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.25)',
    padding: 12,
    gap: 8,
    marginBottom: 20
  },
  trustIcon: {
    fontSize: 16
  },
  trustText: {
    flex: 1,
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 16
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.textMuted,
    letterSpacing: 1,
    marginBottom: 10
  },
  emptyCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    marginTop: 20
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: 8
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: 4
  },
  emptyDesc: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center'
  },
  bookingCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 14
  },
  bTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12
  },
  bReg: {
    fontSize: 18,
    fontWeight: '900',
    color: Colors.textPrimary
  },
  bModel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2
  },
  bDetails: {
    backgroundColor: Colors.surfaceLight,
    padding: 10,
    borderRadius: 8,
    gap: 4,
    marginBottom: 12
  },
  bDetailItem: {
    fontSize: 12,
    color: Colors.textSecondary
  },
  bFooter: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 10
  },
  newCard: {
    borderColor: Colors.provider,
    borderWidth: 1.5
  },
  newBadge: {
    fontSize: 9,
    fontWeight: '900',
    color: '#fff',
    backgroundColor: Colors.provider,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
    letterSpacing: 0.8
  },
  mutedText: {
    fontSize: 12,
    color: Colors.textSecondary
  },
  sectionEmpty: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 16
  },
  completedText: {
    color: Colors.compliant,
    fontWeight: '800',
    fontSize: 13
  },
  actionBtn: {
    backgroundColor: Colors.provider,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center'
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13
  }
});
