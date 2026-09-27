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
import { StatusPill } from '../../components/StatusPill';
import { AdminAPI } from '../../api/endpoints';

export const ProviderListScreen = () => {
  const [providers, setProviders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchAll = async () => {
    try {
      const res = await AdminAPI.getProviders(); // fetch all
      setProviders(res.data.data || []);
    } catch (err) {
      console.error('Fetch all error:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchAll();
  };

  const handleToggle = async (id: string, currentStatus: string, name: string) => {
    const newStatus = currentStatus === 'approved' ? 'suspended' : 'approved';
    try {
      await AdminAPI.updateProviderStatus(id, newStatus);
      Alert.alert('Status Updated', `'${name}' status changed to ${newStatus.toUpperCase()}`);
      fetchAll();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to update status');
    }
  };

  return (
    <View style={styles.container}>
      <RoleHeader
        title="Station Registry"
        subtitle="National directory of certified testing stations"
        onRefresh={onRefresh}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={Colors.admin} />}
      >
        <Text style={styles.sectionHeader}>REGISTERED STATIONS ({providers.length})</Text>

        {isLoading ? (
          <ActivityIndicator size="large" color={Colors.admin} style={{ marginTop: 30 }} />
        ) : providers.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No Stations Found</Text>
          </View>
        ) : (
          providers.map((p) => {
            const isApproved = p.status === 'approved';
            return (
              <View key={p._id} style={styles.pCard}>
                <View style={styles.pTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pName}>{p.businessName}</Text>
                    <Text style={styles.pAddress}>{p.address}</Text>
                    <Text style={styles.pOwner}>Contact: {p.userId?.name} · {p.userId?.phone}</Text>
                  </View>
                  <StatusPill
                    label={p.status.toUpperCase()}
                    type={isApproved ? 'compliant' : 'nonCompliant'}
                  />
                </View>

                <View style={styles.pFooter}>
                  <Text style={styles.ratingText}>★ {p.rating || 4.8} / 5.0 Rating</Text>
                  <TouchableOpacity
                    style={[
                      styles.toggleBtn,
                      { backgroundColor: isApproved ? Colors.nonCompliantBg : Colors.compliantBg }
                    ]}
                    onPress={() => handleToggle(p._id, p.status, p.businessName)}
                  >
                    <Text
                      style={[
                        styles.toggleBtnText,
                        { color: isApproved ? Colors.nonCompliant : Colors.compliant }
                      ]}
                    >
                      {isApproved ? 'Suspend Station' : 'Approve Station'}
                    </Text>
                  </TouchableOpacity>
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
  sectionHeader: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.textMuted,
    letterSpacing: 1,
    marginBottom: 10
  },
  emptyCard: {
    backgroundColor: Colors.surface,
    padding: 30,
    borderRadius: 14,
    alignItems: 'center'
  },
  emptyTitle: {
    color: Colors.textSecondary,
    fontSize: 14
  },
  pCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 12
  },
  pTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12
  },
  pName: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary
  },
  pAddress: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2
  },
  pOwner: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2
  },
  pFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 10
  },
  ratingText: {
    color: Colors.warning,
    fontSize: 11,
    fontWeight: '700'
  },
  toggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6
  },
  toggleBtnText: {
    fontSize: 11,
    fontWeight: '800'
  }
});
