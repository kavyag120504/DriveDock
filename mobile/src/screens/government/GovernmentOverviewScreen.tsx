import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl
} from 'react-native';
import { Colors } from '../../theme/colors';
import { RoleHeader } from '../../components/RoleHeader';
import { AdminAPI } from '../../api/endpoints';

export const GovernmentOverviewScreen = () => {
  const [stats, setStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchStats = async () => {
    try {
      const res = await AdminAPI.getOverview();
      setStats(res.data.data);
    } catch (err) {
      console.error('Fetch stats error:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchStats();
  };

  return (
    <View style={styles.container}>
      <RoleHeader
        title="National RTO Analytics"
        subtitle="Real-time compliance monitoring & enforcement intelligence"
        onRefresh={onRefresh}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={Colors.government} />}
      >
        {isLoading ? (
          <ActivityIndicator size="large" color={Colors.government} style={{ marginTop: 40 }} />
        ) : !stats ? (
          <Text style={styles.errorText}>Failed to load government analytics</Text>
        ) : (
          <>
            {/* Primary KPI Card */}
            <View style={styles.kpiCard}>
              <Text style={styles.kpiHeader}>NATIONAL COMPLIANCE INDEX</Text>
              <View style={styles.rateRow}>
                <Text style={styles.rateVal}>{stats.complianceRate}%</Text>
                <View style={styles.ratePill}>
                  <Text style={styles.ratePillText}>
                    {stats.fullyCompliantCount} of {stats.totalVehicles} Vehicles 100% Verified
                  </Text>
                </View>
              </View>
              <Text style={styles.kpiExplainer}>
                Vehicles with all 5 mandatory papers (RC, PUC, Insurance, License, Fitness) verified genuine by certified stations.
              </Text>
            </View>

            {/* Document Integrity Breakdown */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>DOCUMENT INTEGRITY AUDIT</Text>
              <View style={styles.statsGrid}>
                <View style={styles.statBox}>
                  <Text style={[styles.statNum, { color: Colors.compliant }]}>
                    {stats.documents?.verified || 0}
                  </Text>
                  <Text style={styles.statLabel}>Verified Genuine</Text>
                </View>

                <View style={styles.statBox}>
                  <Text style={[styles.statNum, { color: Colors.warning }]}>
                    {stats.documents?.unverified || 0}
                  </Text>
                  <Text style={styles.statLabel}>Unverified Photos</Text>
                </View>

                <View style={styles.statBox}>
                  <Text style={[styles.statNum, { color: Colors.nonCompliant }]}>
                    {stats.documents?.expired || 0}
                  </Text>
                  <Text style={styles.statLabel}>Expired Papers</Text>
                </View>
              </View>
            </View>

            {/* Enforcement & Fines */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>ENFORCEMENT & REVENUE COLLECTION</Text>
              <View style={styles.revGrid}>
                <View style={styles.revItem}>
                  <Text style={styles.revNum}>₹{stats.enforcement?.challanTotalIssued || 0}</Text>
                  <Text style={styles.revLabel}>Total Citations Issued</Text>
                </View>
                <View style={styles.revItem}>
                  <Text style={[styles.revNum, { color: Colors.compliant }]}>
                    ₹{stats.enforcement?.challanTotalCollected || 0}
                  </Text>
                  <Text style={styles.revLabel}>Penalties Collected</Text>
                </View>
              </View>

              <View style={styles.citationRow}>
                <Text style={styles.citationText}>
                  Violations Logged by Officers: <Text style={{ color: Colors.textPrimary, fontWeight: '800' }}>{stats.enforcement?.totalViolations || 0}</Text>
                </Text>
                <Text style={styles.citationText}>
                  Settled Challans: <Text style={{ color: Colors.compliant, fontWeight: '800' }}>{stats.enforcement?.challansPaid || 0}</Text>
                </Text>
              </View>
            </View>

            {/* Service Providers */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>CERTIFIED TESTING NETWORK</Text>
              <View style={styles.networkRow}>
                <View style={styles.networkItem}>
                  <Text style={styles.networkNum}>{stats.providers?.approved || 0}</Text>
                  <Text style={styles.networkLabel}>Approved Stations</Text>
                </View>
                <View style={styles.networkItem}>
                  <Text style={[styles.networkNum, { color: Colors.warning }]}>
                    {stats.providers?.pending || 0}
                  </Text>
                  <Text style={styles.networkLabel}>Pending Audit</Text>
                </View>
              </View>
            </View>
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
  errorText: {
    color: Colors.nonCompliant,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 40
  },
  kpiCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.borderHighlight,
    padding: 20,
    marginBottom: 16
  },
  kpiHeader: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.government,
    letterSpacing: 1,
    marginBottom: 8
  },
  rateRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 12,
    marginBottom: 8
  },
  rateVal: {
    fontSize: 44,
    fontWeight: '900',
    color: Colors.textPrimary
  },
  ratePill: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6
  },
  ratePillText: {
    color: Colors.government,
    fontSize: 11,
    fontWeight: '800'
  },
  kpiExplainer: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 18
  },
  sectionCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 16
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textMuted,
    letterSpacing: 1,
    marginBottom: 12
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 10
  },
  statBox: {
    flex: 1,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center'
  },
  statNum: {
    fontSize: 22,
    fontWeight: '900'
  },
  statLabel: {
    fontSize: 10,
    color: Colors.textSecondary,
    marginTop: 4,
    textAlign: 'center'
  },
  revGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12
  },
  revItem: {
    flex: 1,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 10,
    padding: 14
  },
  revNum: {
    fontSize: 20,
    fontWeight: '900',
    color: Colors.textPrimary
  },
  revLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2
  },
  citationRow: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 10,
    gap: 4
  },
  citationText: {
    fontSize: 12,
    color: Colors.textSecondary
  },
  networkRow: {
    flexDirection: 'row',
    gap: 12
  },
  networkItem: {
    flex: 1,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 10,
    padding: 14
  },
  networkNum: {
    fontSize: 22,
    fontWeight: '900',
    color: Colors.textPrimary
  },
  networkLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2
  }
});
