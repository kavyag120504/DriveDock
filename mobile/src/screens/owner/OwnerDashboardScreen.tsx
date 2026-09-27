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
import { RotatingQRModal } from '../../components/RotatingQRModal';
import { VehiclesAPI, RemindersAPI } from '../../api/endpoints';

export const OwnerDashboardScreen = ({ navigation }: any) => {
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [reminders, setReminders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Rotating QR Modal state
  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [activeVehicle, setActiveVehicle] = useState<{ id: string; regNumber: string } | null>(null);

  const fetchData = async () => {
    try {
      const [vRes, rRes] = await Promise.all([
        VehiclesAPI.list(),
        RemindersAPI.list()
      ]);
      setVehicles(vRes.data.data || []);
      setReminders(rRes.data.data || []);
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchData();
  };

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
        {/* Active Reminders Alert Box */}
        {reminders.length > 0 && (
          <View style={styles.remindersCard}>
            <View style={styles.reminderHeader}>
              <Text style={styles.reminderTitle}>⚠️ EXPIRY COMPLIANCE ALERTS ({reminders.length})</Text>
            </View>
            {reminders.map((rem, idx) => (
              <View key={idx} style={styles.reminderItem}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.reminderReg}>
                    {rem.vehicleId?.regNumber || 'Vehicle'} · {rem.vehicleId?.model}
                  </Text>
                  <Text style={styles.reminderMsg}>{rem.message}</Text>
                </View>
                <TouchableOpacity
                  style={styles.renewQuickBtn}
                  onPress={() => navigation.navigate('BookSlot', { vehicleId: rem.vehicleId?._id })}
                >
                  <Text style={styles.renewQuickText}>Renew Slot</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Action Header */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>MY REGISTERED VEHICLES ({vehicles.length})</Text>
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => navigation.navigate('AddVehicle')}
          >
            <Text style={styles.addBtnText}>+ Add Vehicle</Text>
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 40 }} />
        ) : vehicles.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>🚗</Text>
            <Text style={styles.emptyTitle}>No Vehicles Registered</Text>
            <Text style={styles.emptyDesc}>Add your vehicle to track certified papers and generate tamper-proof QR codes.</Text>
            <TouchableOpacity
              style={styles.emptyBtn}
              onPress={() => navigation.navigate('AddVehicle')}
            >
              <Text style={styles.emptyBtnText}>Register First Vehicle</Text>
            </TouchableOpacity>
          </View>
        ) : (
          vehicles.map((v) => {
            const isCompliant = v.isCompliant;
            return (
              <View key={v._id} style={styles.vehicleCard}>
                <View style={styles.cardTop}>
                  <View>
                    <View style={styles.regRow}>
                      <Text style={styles.regText}>{v.regNumber}</Text>
                      <View style={styles.fuelBadge}>
                        <Text style={styles.fuelText}>{v.fuelType.toUpperCase()}</Text>
                      </View>
                    </View>
                    <Text style={styles.modelText}>
                      {v.make} {v.model} ({v.year})
                    </Text>
                  </View>

                  <StatusPill
                    label={isCompliant ? 'COMPLIANT' : 'NON-COMPLIANT'}
                    type={isCompliant ? 'compliant' : 'nonCompliant'}
                  />
                </View>

                {/* Metrics */}
                <View style={styles.metricsRow}>
                  <View style={styles.metric}>
                    <Text style={styles.metricVal}>{v.verifiedCount} / {v.documentCount || 5}</Text>
                    <Text style={styles.metricLbl}>Verified Docs</Text>
                  </View>
                  <View style={styles.metric}>
                    <Text style={[styles.metricVal, { color: v.pendingChallans > 0 ? Colors.nonCompliant : Colors.textPrimary }]}>
                      {v.pendingChallans || 0}
                    </Text>
                    <Text style={styles.metricLbl}>Pending Challans</Text>
                  </View>
                  <View style={styles.metric}>
                    <Text style={styles.metricVal}>{v.region?.district || 'Mumbai'}</Text>
                    <Text style={styles.metricLbl}>RTO Region</Text>
                  </View>
                </View>

                {/* Action Row */}
                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    style={styles.qrBtn}
                    onPress={() => handleOpenQR(v._id, v.regNumber)}
                  >
                    <Text style={styles.qrBtnText}>🛡️ Show Rotating QR</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.detailBtn}
                    onPress={() => navigation.navigate('VehicleDetail', { vehicleId: v._id })}
                  >
                    <Text style={styles.detailBtnText}>Manage Papers →</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Rotating QR Modal */}
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
  remindersCard: {
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.warning,
    padding: 14,
    marginBottom: 20
  },
  reminderHeader: {
    marginBottom: 8
  },
  reminderTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.warning,
    letterSpacing: 1
  },
  reminderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(245, 158, 11, 0.2)'
  },
  reminderReg: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.textPrimary
  },
  reminderMsg: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2
  },
  renewQuickBtn: {
    backgroundColor: Colors.warning,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8
  },
  renewQuickText: {
    color: '#0B0F19',
    fontSize: 11,
    fontWeight: '800'
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    color: Colors.textMuted
  },
  addBtn: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.primary
  },
  addBtnText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '800'
  },
  emptyCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 32,
    alignItems: 'center',
    marginTop: 20
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 10
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: 6
  },
  emptyDesc: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16
  },
  emptyBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8
  },
  emptyBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13
  },
  vehicleCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 16
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14
  },
  regRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  regText: {
    fontSize: 20,
    fontWeight: '900',
    color: Colors.textPrimary,
    letterSpacing: 0.5
  },
  fuelBadge: {
    backgroundColor: Colors.surfaceLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4
  },
  fuelText: {
    fontSize: 9,
    fontWeight: '800',
    color: Colors.textSecondary
  },
  modelText: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2
  },
  metricsRow: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceLight,
    borderRadius: 10,
    padding: 10,
    marginBottom: 14
  },
  metric: {
    flex: 1,
    alignItems: 'center'
  },
  metricVal: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.textPrimary
  },
  metricLbl: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 2
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10
  },
  qrBtn: {
    flex: 1,
    backgroundColor: Colors.primary,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center'
  },
  qrBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12
  },
  detailBtn: {
    flex: 1,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center'
  },
  detailBtnText: {
    color: Colors.textPrimary,
    fontWeight: '700',
    fontSize: 12
  }
});
