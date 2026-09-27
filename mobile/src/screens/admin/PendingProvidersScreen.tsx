import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl
} from 'react-native';
import { Colors } from '../../theme/colors';
import { RoleHeader } from '../../components/RoleHeader';
import { AdminAPI } from '../../api/endpoints';

export const PendingProvidersScreen = () => {
  const [providers, setProviders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  const fetchPending = async () => {
    try {
      const res = await AdminAPI.getProviders('pending');
      setProviders(res.data.data || []);
    } catch (err) {
      console.error('Fetch pending error:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchPending();
  }, []);

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchPending();
  };

  const handleUpdateStatus = async (id: string, status: 'approved' | 'suspended', name: string) => {
    setActionId(id);
    try {
      await AdminAPI.updateProviderStatus(id, status);
      Alert.alert(
        status === 'approved' ? '✅ Provider Approved (Trust Rule 3)' : 'Provider Suspended',
        `'${name}' is now ${status.toUpperCase()}. ${status === 'approved' ? 'This station is now visible in owner search and authorized to certify renewals.' : ''}`
      );
      fetchPending();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to update provider status');
    } finally {
      setActionId(null);
    }
  };

  return (
    <View style={styles.container}>
      <RoleHeader
        title="Provider Gatekeeping"
        subtitle="Trust Rule 3: Admin authorization desk"
        onRefresh={onRefresh}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={Colors.admin} />}
      >
        {/* Trust Rule 3 Explainer */}
        <View style={styles.trustBanner}>
          <Text style={styles.trustIcon}>🛡️</Text>
          <Text style={styles.trustText}>
            <Text style={{ fontWeight: '800', color: Colors.textPrimary }}>Trust Rule 3 Active:</Text> Unapproved providers are completely invisible in search and cannot issue verified certificates. Only after Admin approval can they certify vehicle papers.
          </Text>
        </View>

        <Text style={styles.sectionHeader}>PENDING STATION APPROVALS ({providers.length})</Text>

        {isLoading ? (
          <ActivityIndicator size="large" color={Colors.admin} style={{ marginTop: 30 }} />
        ) : providers.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>🎉</Text>
            <Text style={styles.emptyTitle}>Zero Pending Approvals</Text>
            <Text style={styles.emptyDesc}>All registered service stations have been audited and processed.</Text>
          </View>
        ) : (
          providers.map((p) => (
            <View key={p._id} style={styles.pCard}>
              <View style={styles.pTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pName}>{p.businessName}</Text>
                  <Text style={styles.pContact}>Applicant: {p.userId?.name} ({p.userId?.email})</Text>
                  <Text style={styles.pAddress}>{p.address}</Text>
                </View>

                <View style={styles.pendingBadge}>
                  <Text style={styles.pendingText}>PENDING AUDIT</Text>
                </View>
              </View>

              <View style={styles.servicesRow}>
                <Text style={styles.servLabel}>Requested Certifications:</Text>
                <View style={styles.tags}>
                  {p.serviceTypes?.map((s: string, idx: number) => (
                    <View key={idx} style={styles.tag}>
                      <Text style={styles.tagText}>{s.toUpperCase()}</Text>
                    </View>
                  ))}
                </View>
              </View>

              <View style={styles.actions}>
                <TouchableOpacity
                  style={styles.approveBtn}
                  onPress={() => handleUpdateStatus(p._id, 'approved', p.businessName)}
                  disabled={actionId === p._id}
                >
                  {actionId === p._id ? (
                    <ActivityIndicator color="#0B0F19" size="small" />
                  ) : (
                    <Text style={styles.approveBtnText}>✓ Authorize & Approve</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.rejectBtn}
                  onPress={() => handleUpdateStatus(p._id, 'suspended', p.businessName)}
                  disabled={actionId === p._id}
                >
                  <Text style={styles.rejectBtnText}>✕ Reject</Text>
                </TouchableOpacity>
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
  trustBanner: {
    flexDirection: 'row',
    backgroundColor: 'rgba(236, 72, 153, 0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(236, 72, 153, 0.3)',
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
  pCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 14
  },
  pTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12
  },
  pName: {
    fontSize: 17,
    fontWeight: '900',
    color: Colors.textPrimary
  },
  pContact: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2
  },
  pAddress: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2
  },
  pendingBadge: {
    backgroundColor: Colors.warningBg,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.warning
  },
  pendingText: {
    color: Colors.warning,
    fontSize: 10,
    fontWeight: '800'
  },
  servicesRow: {
    backgroundColor: Colors.surfaceLight,
    padding: 10,
    borderRadius: 8,
    marginBottom: 14
  },
  servLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: '700',
    marginBottom: 6,
    textTransform: 'uppercase'
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6
  },
  tag: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4
  },
  tagText: {
    color: Colors.textPrimary,
    fontSize: 10,
    fontWeight: '700'
  },
  actions: {
    flexDirection: 'row',
    gap: 10
  },
  approveBtn: {
    flex: 2,
    backgroundColor: Colors.compliant,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center'
  },
  approveBtnText: {
    color: '#0B0F19',
    fontWeight: '900',
    fontSize: 13
  },
  rejectBtn: {
    flex: 1,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center'
  },
  rejectBtnText: {
    color: Colors.nonCompliant,
    fontWeight: '800',
    fontSize: 13
  }
});
