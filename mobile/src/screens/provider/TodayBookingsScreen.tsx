import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { RefreshControl, StyleSheet, Text, View } from 'react-native';
import { BookingsAPI } from '../../api/endpoints';
import { RoleHeader } from '../../components/RoleHeader';
import { StatusPill } from '../../components/StatusPill';
import { Button, Notice, ScreenState } from '../../components/UI';
import { WorkspaceScreen } from '../../components/WorkspaceScreen';
import { useAuthStore } from '../../store/authStore';
import { useResponsiveLayout } from '../../theme/responsive';
import { Colors, Layout } from '../../theme/colors';

export const TodayBookingsScreen = ({ navigation }: any) => {
  const { stack } = useResponsiveLayout();
  const [loadError, setLoadError] = useState(false);
  const [bookings, setBookings] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchBookings = async () => {
    setLoadError(false);
    try {
      const res = await BookingsAPI.list();
      setBookings(res.data.data || []);
    } catch (err) {
      setLoadError(true);
      console.error('Fetch bookings error:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchBookings();
    }, [])
  );

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchBookings();
  };

  const stationName = useAuthStore((st) => st.user?.provider?.businessName);

  // Upcoming paid appointments first (soonest slot first), then unpaid ones, then history
  const slotKey = (b: any) => `${b.slotId?.date || ''} ${b.slotId?.startTime || ''}`;
  const upcoming = bookings
    .filter((b) => b.status === 'confirmed')
    .sort((a, b) => slotKey(a).localeCompare(slotKey(b)));
  const awaitingPayment = bookings.filter((b) => b.status === 'pending');
  const history = bookings.filter((b) => b.status === 'completed' || b.status === 'cancelled').slice(0, 15);
  const isNew = (b: any) => Date.now() - new Date(b.createdAt).getTime() < 24 * 60 * 60 * 1000;

  const renderBooking = (b: any) => {
    const isCompleted = b.status === 'completed';
    const isConfirmed = b.status === 'confirmed';

    return (
      <View key={b._id} style={[styles.bookingCard, isConfirmed && isNew(b) && styles.newCard]}>
        <View style={[styles.bTop, stack && { flexDirection: 'column', alignItems: 'stretch' }]}>
          <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 0 }}>
            <Text style={styles.bReg} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
              {b.vehicleId?.regNumber || 'Vehicle'}
            </Text>
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
            Service:{' '}
            <Text style={{ color: Colors.textPrimary, fontWeight: '700' }}>
              {b.documentType?.toUpperCase()}
            </Text>
          </Text>
          <Text style={styles.bDetailItem}>
            Slot:{' '}
            <Text style={{ color: Colors.textPrimary, fontWeight: '700' }}>
              {b.slotId?.startTime} - {b.slotId?.endTime}
            </Text>{' '}
            ({b.slotId?.date})
          </Text>
        </View>

        <View style={styles.bFooter}>
          {isCompleted ? (
            <Text style={styles.completedText}>Certificate Issued & Verified</Text>
          ) : isConfirmed ? (
            <Button
              label="Start inspection"
              icon="arrow-forward"
              color={Colors.provider}
              onPress={() => navigation.navigate('CompleteBooking', { booking: b })}
            />
          ) : b.status === 'pending' ? (
            <Text style={styles.mutedText}>
              Waiting for the customer's payment. The slot is released if unpaid for 30 minutes.
            </Text>
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
      <WorkspaceScreen
        header={
          <RoleHeader
            title="Inspection desk"
            subtitle={
              stationName
                ? `${stationName} · customer bookings`
                : 'Renewal appointments awaiting testing & certification'
            }
            onRefresh={onRefresh}
          />
        }
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={Colors.provider} />
        }
      >
        {/* Trust Notice */}
        <Notice title="From inspection to verified document">
          Complete the service and attach its certificate to verify the document in the owner's passport.
        </Notice>
        {loadError && (
          <Notice title="Couldn't refresh appointments" tone="error">
            Check your connection and try again. Any appointments shown are from your last successful refresh.
          </Notice>
        )}
        {!isLoading && !loadError && (
          <View style={[styles.summary, stack && { flexDirection: 'column', flexWrap: 'nowrap' }]}>
            <View style={[styles.summaryItem, { flex: stack ? 0 : 1 }]}>
              <Text style={styles.summaryValue}>{upcoming.length}</Text>
              <Text style={styles.summaryLabel}>Ready to inspect</Text>
            </View>
            <View style={[styles.summaryItem, { flex: stack ? 0 : 1 }]}>
              <Text style={styles.summaryValue}>{awaitingPayment.length}</Text>
              <Text style={styles.summaryLabel}>Awaiting payment</Text>
            </View>
          </View>
        )}

        {isLoading ? (
          <ScreenState title="Loading appointments" loading color={Colors.provider} />
        ) : loadError && bookings.length === 0 ? (
          <ScreenState
            title="Appointments unavailable"
            message="We couldn't load your inspection queue."
            action="Try again"
            onAction={onRefresh}
            color={Colors.provider}
          />
        ) : bookings.length === 0 ? (
          <ScreenState
            title="You're ready for bookings"
            message="Appointments will appear here when owners book a service at your centre. Open Bays & Slots to add availability."
            icon="calendar-outline"
            color={Colors.provider}
          />
        ) : (
          <>
            <Text style={styles.sectionHeader}>Ready for inspection ({upcoming.length})</Text>
            {upcoming.length === 0 ? (
              <Text style={styles.sectionEmpty}>No paid appointments waiting for inspection.</Text>
            ) : (
              upcoming.map(renderBooking)
            )}

            {awaitingPayment.length > 0 && (
              <>
                <Text style={styles.sectionHeader}>Awaiting customer payment ({awaitingPayment.length})</Text>
                {awaitingPayment.map(renderBooking)}
              </>
            )}

            {history.length > 0 && (
              <>
                <Text style={styles.sectionHeader}>Recent history</Text>
                {history.map(renderBooking)}
              </>
            )}
          </>
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
  summary: { flexDirection: 'row', gap: 12, marginBottom: 24, flexWrap: 'wrap' },
  summaryItem: { flex: 1, minWidth: 120, ...Layout.card },
  summaryValue: { color: Colors.provider, fontSize: 32, fontWeight: '700' },
  summaryLabel: { color: Colors.textSecondary, fontSize: 13, marginTop: 6 },
  sectionHeader: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 10,
  },
  bookingCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 14,
  },
  bTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  bReg: {
    fontSize: 18,
    fontWeight: '900',
    color: Colors.textPrimary,
  },
  bModel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  bDetails: {
    backgroundColor: Colors.surfaceLight,
    padding: 10,
    borderRadius: 8,
    gap: 4,
    marginBottom: 12,
  },
  bDetailItem: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  bFooter: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 10,
  },
  newCard: {
    borderColor: Colors.provider,
    borderWidth: 1.5,
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
    letterSpacing: 0.8,
  },
  mutedText: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  sectionEmpty: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 16,
  },
  completedText: {
    color: Colors.compliant,
    fontWeight: '800',
    fontSize: 13,
  },
});
