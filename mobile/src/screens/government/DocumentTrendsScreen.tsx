import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator
} from 'react-native';
import { Colors } from '../../theme/colors';
import { RoleHeader } from '../../components/RoleHeader';
import { AdminAPI } from '../../api/endpoints';

export const DocumentTrendsScreen = () => {
  const [trends, setTrends] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchTrends = async () => {
    try {
      const res = await AdminAPI.getDocumentTrends();
      setTrends(res.data.data || []);
    } catch (err) {
      console.error('Fetch trends error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTrends();
  }, []);

  return (
    <View style={styles.container}>
      <RoleHeader
        title="Document Audit Trends"
        subtitle="Breakdown by certificate type (PUC, Insurance, RC, Fitness)"
        onRefresh={fetchTrends}
      />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.sectionHeader}>CATEGORY INTEGRITY ANALYSIS</Text>

        {isLoading ? (
          <ActivityIndicator size="large" color={Colors.government} style={{ marginTop: 30 }} />
        ) : trends.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No Trends Data</Text>
          </View>
        ) : (
          trends.map((t, idx) => {
            const verified = t.verifiedValid || 0;
            const unverified = t.unverified || 0;
            const expired = t.expired || 0;
            const total = t.total || 1;

            const verifiedPct = Math.round((verified / total) * 100);
            const unverifiedPct = Math.round((unverified / total) * 100);
            const expiredPct = Math.round((expired / total) * 100);

            return (
              <View key={idx} style={styles.trendCard}>
                <View style={styles.tHeader}>
                  <Text style={styles.tType}>{t._id?.toUpperCase()} DOCUMENTS</Text>
                  <Text style={styles.tTotal}>{total} in Registry</Text>
                </View>

                {/* Multi-segment distribution bar */}
                <View style={styles.barContainer}>
                  <View style={[styles.barSegment, { flex: verified || 0.01, backgroundColor: Colors.compliant }]} />
                  <View style={[styles.barSegment, { flex: unverified || 0.01, backgroundColor: Colors.warning }]} />
                  <View style={[styles.barSegment, { flex: expired || 0.01, backgroundColor: Colors.nonCompliant }]} />
                </View>

                {/* Legend */}
                <View style={styles.legendRow}>
                  <View style={styles.legendItem}>
                    <View style={[styles.dot, { backgroundColor: Colors.compliant }]} />
                    <Text style={styles.legendText}>Verified: {verified} ({verifiedPct}%)</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.dot, { backgroundColor: Colors.warning }]} />
                    <Text style={styles.legendText}>Unverified: {unverified} ({unverifiedPct}%)</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.dot, { backgroundColor: Colors.nonCompliant }]} />
                    <Text style={styles.legendText}>Expired: {expired} ({expiredPct}%)</Text>
                  </View>
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
    marginBottom: 12
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
  trendCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 14
  },
  tHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  tType: {
    fontSize: 15,
    fontWeight: '900',
    color: Colors.textPrimary
  },
  tTotal: {
    fontSize: 12,
    color: Colors.textSecondary
  },
  barContainer: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    marginBottom: 14,
    backgroundColor: Colors.surfaceLight
  },
  barSegment: {
    height: '100%'
  },
  legendRow: {
    gap: 6
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4
  },
  legendText: {
    fontSize: 11,
    color: Colors.textSecondary
  }
});
