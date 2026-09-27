import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, RefreshControl
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Shadow, BorderRadius, Spacing } from '../../theme/colors';
import { RoleHeader } from '../../components/RoleHeader';
import { StatusPill } from '../../components/StatusPill';
import { RotatingQRModal } from '../../components/RotatingQRModal';
import { VehiclesAPI, RemindersAPI } from '../../api/endpoints';

export const OwnerDashboardScreen = ({ navigation }: any) => {
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [reminders, setReminders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [activeVehicle, setActiveVehicle] = useState<{ id: string; regNumber: string } | null>(null);

  const fetchData = async () => {
    try {
      const [vRes, rRes] = await Promise.all([VehiclesAPI.list(), RemindersAPI.list()]);
      setVehicles(vRes.data.data || []);
      setReminders(rRes.data.data || []);
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => { fetchData(); }, []);
  const onRefresh = () => { setIsRefreshing(true); fetchData(); };
  const handleOpenQR = (id: string, regNumber: string) => {
    setActiveVehicle({ id, regNumber });
    setQrModalVisible(true);
  };

  return (
    <View style={styles.container}>
      <RoleHeader
        title="Vehicle Passport"
        subtitle="Live document verification & renewal desk"
        onRefresh={onRefresh}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {/* Compliance Alert Banner */}
        {reminders.length > 0 && (
          <View style={styles.alertBanner}>
            <View style={styles.alertIconWrap}>
              <Ionicons name="alert-circle" size={18} color={Colors.warning} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.alertTitle}>EXPIRY COMPLIANCE ALERTS</Text>
              <Text style={styles.alertCount}>{reminders.length} document{reminders.length > 1 ? 's' : ''} require attention</Text>
            </View>
            <TouchableOpacity onPress={() => navigation.navigate('OwnerChallans')}>
              <Text style={styles.alertAction}>View All</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Reminder detail items */}
        {reminders.length > 0 && reminders.map((rem, idx) => (
          <View key={idx} style={styles.reminderRow}>
            <View style={styles.reminderDot} />
            <View style={{ flex: 1 }}>
              <Text style={styles.reminderReg}>{rem.vehicleId?.regNumber || 'Vehicle'} · {rem.vehicleId?.model}</Text>
              <Text style={styles.reminderMsg}>{rem.message}</Text>
            </View>
            <TouchableOpacity
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
            <Text style={styles.sectionLabel}>MY VEHICLES</Text>
            <Text style={styles.sectionCount}>{vehicles.length} registered</Text>
          </View>
          <TouchableOpacity style={styles.addBtn} onPress={() => navigation.navigate('AddVehicle')}>
            <Ionicons name="add" size={16} color={Colors.primary} />
            <Text style={styles.addBtnText}>Add Vehicle</Text>
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 48 }} />
        ) : vehicles.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="car-outline" size={36} color={Colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>No Vehicles Registered</Text>
            <Text style={styles.emptyDesc}>
              Add your vehicle to track certified documents and generate tamper-proof QR codes.
            </Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => navigation.navigate('AddVehicle')}>
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
                <View style={[styles.cardStripe, { backgroundColor: isCompliant ? Colors.compliant : Colors.nonCompliant }]} />

                <View style={styles.cardBody}>
                  {/* Header row */}
                  <View style={styles.cardTop}>
                    <View style={{ flex: 1 }}>
                      <View style={styles.regRow}>
                        <Text style={styles.regText}>{v.regNumber}</Text>
                        <View style={styles.fuelBadge}>
                          <Text style={styles.fuelText}>{v.fuelType?.toUpperCase()}</Text>
                        </View>
                      </View>
                      <Text style={styles.modelText}>{v.make} {v.model} · {v.year}</Text>
                    </View>
                    <StatusPill
                      label={isCompliant ? 'COMPLIANT' : 'NON-COMPLIANT'}
                      type={isCompliant ? 'compliant' : 'nonCompliant'}
                    />
                  </View>

                  {/* Stats row */}
                  <View style={styles.statsRow}>
                    <View style={styles.stat}>
                      <Text style={styles.statVal}>{v.verifiedCount} / {v.documentCount || 5}</Text>
                      <Text style={styles.statLbl}>VERIFIED DOCS</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.stat}>
                      <Text style={[styles.statVal, { color: v.pendingChallans > 0 ? Colors.nonCompliant : Colors.compliant }]}>
                        {v.pendingChallans || 0}
                      </Text>
                      <Text style={styles.statLbl}>CHALLANS</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.stat}>
                      <Text style={styles.statVal}>{v.region?.district || 'Mumbai'}</Text>
                      <Text style={styles.statLbl}>RTO REGION</Text>
                    </View>
                  </View>

                  {/* Action buttons */}
                  <View style={styles.actionsRow}>
                    <TouchableOpacity
                      style={styles.qrBtn}
                      onPress={() => handleOpenQR(v._id, v.regNumber)}
                    >
                      <Ionicons name="qr-code-outline" size={15} color="#fff" />
                      <Text style={styles.qrBtnText}>Show QR Code</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.detailBtn}
                      onPress={() => navigation.navigate('VehicleDetail', { vehicleId: v._id })}
                    >
                      <Ionicons name="document-text-outline" size={15} color={Colors.primary} />
                      <Text style={styles.detailBtnText}>Manage Papers</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

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
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 48 },

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
    width: 36, height: 36, borderRadius: 8,
    backgroundColor: '#FEF3C7',
    alignItems: 'center', justifyContent: 'center',
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
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: Colors.warning,
  },
  reminderReg: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  reminderMsg: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  renewBtn: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: Colors.primaryLight,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  renewBtnText: { fontSize: 11, fontWeight: '700', color: Colors.primary },

  // Section header
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginTop: 20, marginBottom: 12,
  },
  sectionLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: Colors.textMuted },
  sectionCount: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginTop: 1 },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 7,
    backgroundColor: Colors.primaryLight,
    borderRadius: BorderRadius.sm,
    borderWidth: 1, borderColor: Colors.primary,
  },
  addBtnText: { fontSize: 12, fontWeight: '700', color: Colors.primary },

  // Empty state
  emptyCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 32, alignItems: 'center', marginTop: 8,
    ...Shadow.card,
  },
  emptyIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary, marginBottom: 8 },
  emptyDesc: {
    fontSize: 13, color: Colors.textSecondary,
    textAlign: 'center', lineHeight: 20, marginBottom: 20,
  },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.primary,
    paddingHorizontal: 20, paddingVertical: 11,
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
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 16,
  },
  regRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  regText: { fontSize: 22, fontWeight: '900', color: Colors.textPrimary, letterSpacing: 0.5 },
  fuelBadge: {
    backgroundColor: Colors.surfaceAlt,
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 4, borderWidth: 1, borderColor: Colors.border,
  },
  fuelText: { fontSize: 9, fontWeight: '800', color: Colors.textMuted, letterSpacing: 0.5 },
  modelText: { fontSize: 13, color: Colors.textSecondary },

  // Stats
  statsRow: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceAlt,
    borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border,
    padding: 12, marginBottom: 14,
  },
  stat: { flex: 1, alignItems: 'center' },
  statVal: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  statLbl: { fontSize: 9, fontWeight: '700', color: Colors.textMuted, marginTop: 2, letterSpacing: 0.5 },
  statDivider: { width: 1, backgroundColor: Colors.border },

  // Actions
  actionsRow: { flexDirection: 'row', gap: 10 },
  qrBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: Colors.primary,
    paddingVertical: 11, borderRadius: BorderRadius.md,
  },
  qrBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  detailBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: Colors.primaryLight,
    borderWidth: 1.5, borderColor: Colors.primary,
    paddingVertical: 11, borderRadius: BorderRadius.md,
  },
  detailBtnText: { color: Colors.primary, fontWeight: '700', fontSize: 13 },
});
