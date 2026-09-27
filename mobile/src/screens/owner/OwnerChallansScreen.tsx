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
import { StatusPill } from '../../components/StatusPill';
import { VehiclesAPI, ChallansAPI } from '../../api/endpoints';

export const OwnerChallansScreen = () => {
  const [challans, setChallans] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPaying, setIsPaying] = useState(false);

  const fetchChallans = async () => {
    try {
      const vRes = await VehiclesAPI.list();
      const vehicles = vRes.data.data || [];
      const allChallans: any[] = [];

      for (const v of vehicles) {
        const cRes = await ChallansAPI.getByVehicle(v._id);
        const list = cRes.data.data || [];
        list.forEach((c: any) => {
          allChallans.push({ ...c, regNumber: v.regNumber });
        });
      }

      setChallans(allChallans);
    } catch (err) {
      console.error('Fetch challans error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchChallans();
  }, []);

  const handlePay = async (id: string, amount: number) => {
    setIsPaying(true);
    try {
      await ChallansAPI.pay(id);
      Alert.alert('Payment Successful', `e-Challan penalty of ₹${amount} settled. Receipt generated.`);
      fetchChallans();
    } catch (err: any) {
      Alert.alert('Payment Error', err.response?.data?.message || 'Failed to settle challan');
    } finally {
      setIsPaying(false);
    }
  };

  const pendingTotal = challans
    .filter((c) => c.status === 'pending')
    .reduce((sum, c) => sum + c.amount, 0);

  return (
    <View style={styles.container}>
      <RoleHeader
        title="Digital e-Challans"
        subtitle="Traffic violation penalties & direct payment"
        onRefresh={fetchChallans}
      />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Fine Summary Card */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryVal, { color: pendingTotal > 0 ? Colors.nonCompliant : Colors.compliant }]}>
              ₹{pendingTotal}
            </Text>
            <Text style={styles.summaryLbl}>Pending Fines</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryVal}>{challans.length}</Text>
            <Text style={styles.summaryLbl}>Total Issued</Text>
          </View>
        </View>

        <Text style={styles.sectionHeader}>ISSUED E-CHALLANS ({challans.length})</Text>

        {isLoading ? (
          <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 30 }} />
        ) : challans.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>🎉</Text>
            <Text style={styles.emptyTitle}>Zero Violations</Text>
            <Text style={styles.emptyDesc}>All your vehicles have a clean traffic enforcement record.</Text>
          </View>
        ) : (
          challans.map((c) => {
            const isPending = c.status === 'pending';
            return (
              <View key={c._id} style={styles.challanCard}>
                <View style={styles.cTop}>
                  <View>
                    <Text style={styles.cReg}>{c.regNumber}</Text>
                    <Text style={styles.cDate}>{new Date(c.issuedAt).toLocaleDateString()}</Text>
                  </View>
                  <StatusPill
                    label={isPending ? 'PENDING' : 'PAID'}
                    type={isPending ? 'nonCompliant' : 'compliant'}
                  />
                </View>

                <Text style={styles.cReason}>{c.reason}</Text>

                <View style={styles.cBottom}>
                  <Text style={styles.cAmount}>Fine: ₹{c.amount}</Text>

                  {isPending ? (
                    <TouchableOpacity
                      style={styles.payBtn}
                      onPress={() => handlePay(c._id, c.amount)}
                      disabled={isPaying}
                    >
                      <Text style={styles.payBtnText}>Pay Online →</Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={styles.paidBadge}>✓ Paid</Text>
                  )}
                </View>
              </View>
            );
          })
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
  summaryCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 20
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center'
  },
  summaryDivider: {
    width: 1,
    backgroundColor: Colors.border
  },
  summaryVal: {
    fontSize: 22,
    fontWeight: '900',
    color: Colors.textPrimary
  },
  summaryLbl: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 4
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    color: Colors.textMuted,
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
  challanCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    marginBottom: 12
  },
  cTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8
  },
  cReg: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary
  },
  cDate: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2
  },
  cReason: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 12
  },
  cBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 10
  },
  cAmount: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.textPrimary
  },
  payBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8
  },
  payBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12
  },
  paidBadge: {
    color: Colors.compliant,
    fontWeight: '800',
    fontSize: 12
  }
});
