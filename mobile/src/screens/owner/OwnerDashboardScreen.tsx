import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { RemindersAPI, VehiclesAPI } from '../../api/endpoints';
import { RoleHeader } from '../../components/RoleHeader';
import { RotatingQRModal } from '../../components/RotatingQRModal';
import { StatusPill } from '../../components/StatusPill';
import { Button, Notice, ScreenState } from '../../components/UI';
import { WorkspaceScreen } from '../../components/WorkspaceScreen';
import { TwinAPI } from '../../features/twin/api';
import { BorderRadius, Colors, Shadow } from '../../theme/colors';
import { useResponsiveLayout } from '../../theme/responsive';

export const OwnerDashboardScreen = ({ navigation }: any) => {
  const { compact, stack } = useResponsiveLayout();
  const [loadError, setLoadError] = useState(false);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [reminders, setReminders] = useState<any[]>([]);
  // Ownership transfers waiting for a decision (two-party approval)
  const [transfers, setTransfers] = useState<any[]>([]);
  const [paperwork, setPaperwork] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [activeVehicle, setActiveVehicle] = useState<{ id: string; regNumber: string } | null>(null);

  const fetchData = async () => {
    setLoadError(false);
    try {
      const [vRes, rRes, tRes] = await Promise.all([
        VehiclesAPI.list(),
        RemindersAPI.list(),
        TwinAPI.listTransfers(),
      ]);
      setVehicles(vRes.data.data || []);
      setReminders(rRes.data.data || []);
      setTransfers((tRes.data.data || []).filter((t: any) => t.status === 'requested'));
      // Approved transfers that still have paperwork steps open for me
      setPaperwork((tRes.data.data || []).filter((t: any) => t.status === 'accepted' && t.openTasks > 0));
    } catch (err) {
      setLoadError(true);
      console.error('Fetch error:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);
  // Reload when returning to this screen (e.g. after a transfer moved a vehicle in or out)
  useEffect(() => navigation.addListener('focus', fetchData), [navigation]);
  const onRefresh = () => {
    setIsRefreshing(true);
    fetchData();
  };
  const handleOpenQR = (id: string, regNumber: string) => {
    setActiveVehicle({ id, regNumber });
    setQrModalVisible(true);
  };

  // Show each document once, and only while it needs attention: a reminder for it is due and
  // the document is expired or expires within 30 days (renewed documents drop off the list)
  const now = Date.now();
  const attention: any[] = Object.values(
    reminders
      .filter(
        (r) =>
          r.documentId?.expiryDate &&
          new Date(r.scheduledFor).getTime() <= now &&
          new Date(r.documentId.expiryDate).getTime() - now <= 30 * 24 * 60 * 60 * 1000
      )
      .reduce((byDoc: Record<string, any>, r) => {
        const key = String(r.documentId._id);
        if (!byDoc[key] || r.thresholdDays < byDoc[key].thresholdDays) byDoc[key] = r;
        return byDoc;
      }, {})
  );

  return (
    <View style={styles.container}>
      <WorkspaceScreen
        header={
          <RoleHeader
            title="Vehicle passport"
            subtitle={compact ? undefined : 'Your vehicles, documents and next steps.'}
            onRefresh={onRefresh}
          />
        }
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
      >
        {loadError && (
          <Notice title="Couldn't refresh your passport" tone="error">
            Check your connection and try again. Any vehicles shown below are from your last successful
            refresh.
          </Notice>
        )}
        {!isLoading && !loadError && (
          <View style={[styles.overview, compact && { padding: 16 }]}>
            <View style={styles.flexContent}>
              <Text style={styles.overviewLabel}>YOUR GARAGE</Text>
              <Text
                style={styles.overviewValue}
              >{`${vehicles.length} ${vehicles.length === 1 ? 'vehicle' : 'vehicles'}`}</Text>
            </View>
            {!stack && (
              <View style={styles.overviewIcon}>
                <Ionicons name="car-sport-outline" size={32} color="#FFFFFF" />
              </View>
            )}
          </View>
        )}
        {/* Ownership requests: waiting for my approval (seller) or for the seller's (buyer) */}
        {transfers.map((t) => (
          <View key={t._id} style={[styles.transferBanner, stack && styles.stack]}>
            <Ionicons name="swap-horizontal" size={18} color={Colors.primary} />
            <View style={styles.flexContent}>
              <Text style={styles.transferTitle}>
                {t.role === 'seller' ? 'OWNERSHIP REQUEST' : 'WAITING FOR SELLER APPROVAL'}
              </Text>
              <Text style={styles.transferText}>
                {t.role === 'seller'
                  ? `${t.buyerName || 'A buyer'} wants to take ownership of ${t.vehicle?.regNumber || 'your vehicle'}`
                  : `${t.vehicle?.make || ''} ${t.vehicle?.model || ''} (${t.vehicle?.regNumber || ''}) moves to your passport once the seller approves`}
              </Text>
            </View>
            {t.role === 'seller' && (
              <TouchableOpacity
                accessibilityRole="button"
                style={styles.transferBtn}
                onPress={() => navigation.navigate('VehicleTwin', { vehicleId: t.vehicleId })}
              >
                <Text style={styles.transferBtnText}>Review</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}

        {/* Paperwork still to do after an approved transfer */}
        {paperwork.map((t) => (
          <View key={'pw-' + t._id} style={[styles.transferBanner, stack && styles.stack]}>
            <Ionicons name="document-text-outline" size={18} color={Colors.primary} />
            <View style={styles.flexContent}>
              <Text style={styles.transferTitle}>TRANSFER PAPERWORK</Text>
              <Text style={styles.transferText}>
                {t.openTasks} task{t.openTasks === 1 ? '' : 's'} left for{' '}
                {t.vehicle?.regNumber || 'your vehicle'}
                {t.nextDue
                  ? ', next due ' +
                    new Date(t.nextDue).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                  : ''}
              </Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              style={styles.transferBtn}
              onPress={() => navigation.navigate('TransferChecklist', { transferId: t._id })}
            >
              <Text style={styles.transferBtnText}>Open</Text>
            </TouchableOpacity>
          </View>
        ))}

        {/* Compliance Alert Banner */}
        {attention.length > 0 && (
          <View style={[styles.alertBanner, stack && styles.stack]}>
            <View style={styles.alertIconWrap}>
              <Ionicons name="alert-circle" size={18} color={Colors.warning} />
            </View>
            <View style={styles.flexContent}>
              <Text style={styles.alertTitle}>Documents need attention</Text>
              <Text style={styles.alertCount}>
                {attention.length} document{attention.length > 1 ? 's' : ''} require attention
              </Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              style={{ minHeight: 44, justifyContent: 'center' }}
              onPress={() => navigation.navigate('BookSlot')}
            >
              <Text style={styles.alertAction}>Renewals</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Reminder detail items */}
        {attention.map((rem, idx) => (
          <View key={idx} style={[styles.reminderRow, stack && styles.stack]}>
            <View style={styles.reminderDot} />
            <View style={styles.flexContent}>
              <Text style={styles.reminderReg}>
                {rem.vehicleId?.regNumber || 'Vehicle'} · {rem.vehicleId?.model}
              </Text>
              <Text style={styles.reminderMsg}>{rem.message}</Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              style={styles.renewBtn}
              onPress={() => navigation.navigate('BookSlot', { vehicleId: rem.vehicleId?._id })}
            >
              <Text style={styles.renewBtnText}>Renew</Text>
            </TouchableOpacity>
          </View>
        ))}

        {/* Section header */}
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionLabel}>Your vehicles</Text>
            <Text style={styles.sectionCount}>{vehicles.length} registered</Text>
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Add vehicle"
            style={styles.addBtn}
            onPress={() => navigation.navigate('AddVehicle')}
          >
            <Ionicons name="add" size={16} color={Colors.primary} />
            <Text style={styles.addBtnText}>Add</Text>
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <ScreenState
            title="Loading your passport"
            message="Getting your vehicles and renewal reminders."
            loading
          />
        ) : loadError && vehicles.length === 0 ? (
          <ScreenState
            title="Your passport is unavailable"
            message="We couldn't load your vehicles. Please try again."
            action="Try again"
            onAction={onRefresh}
          />
        ) : vehicles.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="car-outline" size={36} color={Colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>No Vehicles Registered</Text>
            <Text style={styles.emptyDesc}>
              Add your vehicle to track certified documents and generate tamper-proof QR codes.
            </Text>
            <TouchableOpacity
              accessibilityRole="button"
              style={styles.emptyBtn}
              onPress={() => navigation.navigate('AddVehicle')}
            >
              <Ionicons name="add-circle-outline" size={16} color="#fff" />
              <Text style={styles.emptyBtnText}>Register First Vehicle</Text>
            </TouchableOpacity>
          </View>
        ) : (
          vehicles.map((v) => {
            const isCompliant = v.isCompliant;
            return (
              <View key={v._id} style={[styles.vehicleCard, Shadow.card]}>
                {/* Card top stripe */}
                <View
                  style={[
                    styles.cardStripe,
                    { backgroundColor: isCompliant ? Colors.compliant : Colors.nonCompliant },
                  ]}
                />

                <View style={styles.cardBody}>
                  {/* Header row */}
                  <View style={[styles.cardTop, stack && styles.stack]}>
                    <View style={styles.flexContent}>
                      <View style={styles.regRow}>
                        <Text
                          style={styles.regText}
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          minimumFontScale={0.65}
                        >
                          {v.regNumber}
                        </Text>
                        <View style={styles.fuelBadge}>
                          <Text style={styles.fuelText}>{v.fuelType?.toUpperCase()}</Text>
                        </View>
                      </View>
                      <Text style={styles.modelText}>
                        {v.make} {v.model} · {v.year}
                      </Text>
                    </View>
                    <StatusPill
                      label={isCompliant ? 'Compliant' : 'Needs attention'}
                      type={isCompliant ? 'compliant' : 'nonCompliant'}
                    />
                  </View>

                  <View style={[styles.statsRow, stack && styles.stack]}>
                    <View style={[styles.stat, stack && styles.statCompact]}>
                      <Text style={styles.statLbl}>Verified documents</Text>
                      <Text style={styles.statVal}>
                        {v.verifiedCount} / {v.documentCount || 5}
                      </Text>
                    </View>
                    <View style={[styles.stat, stack && styles.statCompact]}>
                      <Text style={styles.statLbl}>Challans</Text>
                      <Text
                        style={[
                          styles.statVal,
                          { color: v.pendingChallans > 0 ? Colors.nonCompliant : Colors.compliant },
                        ]}
                      >
                        {v.pendingChallans || 0}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.regionRow}>
                    <Text style={styles.statLbl}>Region</Text>
                    <Text style={styles.regionValue}>{v.region?.district || 'Not set'}</Text>
                  </View>

                  <View style={[styles.actionsRow, stack && styles.stack]}>
                    <Button
                      label={stack ? 'Show QR code' : 'Show QR'}
                      icon="qr-code-outline"
                      onPress={() => handleOpenQR(v._id, v.regNumber)}
                      style={stack ? styles.fullWidth : styles.actionButton}
                    />
                    <Button
                      label="Documents"
                      icon="document-text-outline"
                      variant="secondary"
                      onPress={() => navigation.navigate('VehicleDetail', { vehicleId: v._id })}
                      style={stack ? styles.fullWidth : styles.actionButton}
                    />
                  </View>
                </View>
              </View>
            );
          })
        )}
      </WorkspaceScreen>

      {activeVehicle && (
        <RotatingQRModal
          visible={qrModalVisible}
          vehicleId={activeVehicle.id}
          regNumber={activeVehicle.regNumber}
          onClose={() => setQrModalVisible(false)}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  transferBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.primaryLight,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  transferTitle: { fontSize: 10, fontWeight: '800', color: Colors.primary, letterSpacing: 0.8 },
  transferText: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary, marginTop: 2 },
  transferBtn: {
    minHeight: 44,
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  transferBtnText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  container: { flex: 1, backgroundColor: Colors.background },
  flexContent: { flexGrow: 1, flexShrink: 1, minWidth: 0 },
  stack: { flexDirection: 'column', flexWrap: 'nowrap', alignItems: 'stretch' },
  statCompact: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  regionRow: { marginBottom: 16, gap: 4 },
  regionValue: { fontSize: 14, lineHeight: 21, fontWeight: '600', color: Colors.textPrimary },
  actionButton: { flex: 1 },
  fullWidth: { width: '100%' },
  overview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: Colors.textPrimary,
    borderRadius: BorderRadius.lg,
    padding: 24,
    marginBottom: 8,
  },
  overviewLabel: { color: '#BCCDE3', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  overviewValue: { color: '#FFFFFF', fontSize: 26, fontWeight: '700', marginTop: 8 },
  overviewIcon: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#29425F',
    borderRadius: 24,
  },

  // Alert banner
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.warningBg,
    borderWidth: 1,
    borderColor: Colors.warningBorder,
    borderRadius: BorderRadius.md,
    padding: 12,
    marginBottom: 8,
  },
  alertIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertTitle: { fontSize: 11, fontWeight: '800', color: Colors.warning, letterSpacing: 0.8 },
  alertCount: { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  alertAction: { fontSize: 12, fontWeight: '700', color: Colors.primary },

  // Reminder rows
  reminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  reminderDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.warning,
  },
  reminderReg: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  reminderMsg: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  renewBtn: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 6,
    backgroundColor: Colors.primaryLight,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  renewBtnText: { fontSize: 11, fontWeight: '700', color: Colors.primary },

  // Section header
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 12,
    gap: 12,
    flexWrap: 'wrap',
  },
  sectionLabel: { fontSize: 21, fontWeight: '700', color: Colors.textPrimary },
  sectionCount: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginTop: 1 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: Colors.primaryLight,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  addBtnText: { fontSize: 12, fontWeight: '700', color: Colors.primary },

  // Empty state
  emptyCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 32,
    alignItems: 'center',
    marginTop: 8,
    ...Shadow.card,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary, marginBottom: 8 },
  emptyDesc: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: BorderRadius.md,
  },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  // Vehicle card
  vehicleCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
    overflow: 'hidden',
  },
  cardStripe: { height: 4, width: '100%' },
  cardBody: { padding: 16 },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  regRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 3 },
  regText: { fontSize: 22, fontWeight: '900', color: Colors.textPrimary, letterSpacing: 0.5 },
  fuelBadge: {
    backgroundColor: Colors.surfaceAlt,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  fuelText: { fontSize: 11, fontWeight: '800', color: Colors.textMuted, letterSpacing: 0.5 },
  modelText: { fontSize: 13, color: Colors.textSecondary },

  // Stats
  statsRow: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceAlt,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    gap: 12,
    marginBottom: 14,
  },
  stat: { flexGrow: 1, flexShrink: 1, minWidth: 0, gap: 4 },
  statVal: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  statLbl: { fontSize: 12, lineHeight: 18, color: Colors.textSecondary, flexShrink: 1 },

  // Actions
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
});
