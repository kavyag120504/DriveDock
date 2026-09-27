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

export const RegionMapScreen = () => {
  const [regions, setRegions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchRegions = async () => {
    try {
      const res = await AdminAPI.getByRegion();
      setRegions(res.data.data || []);
    } catch (err) {
      console.error('Fetch regions error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRegions();
  }, []);

  return (
    <View style={styles.container}>
      <RoleHeader
        title="Regional Enforcement"
        subtitle="Jurisdictional compliance and vehicle density"
        onRefresh={fetchRegions}
      />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.sectionHeader}>RTO DISTRICT METRICS ({regions.length})</Text>

        {isLoading ? (
          <ActivityIndicator size="large" color={Colors.government} style={{ marginTop: 30 }} />
        ) : regions.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No Regional Data Available</Text>
          </View>
        ) : (
          regions.map((r, idx) => {
            const verified = r.verifiedDocsCount || 0;
            const total = r.totalDocuments || 0;
            const rate = total > 0 ? Math.round((verified / total) * 100) : 0;

            return (
              <View key={idx} style={styles.regionCard}>
                <View style={styles.rHeader}>
                  <View>
                    <Text style={styles.districtName}>{r.district || 'Metro Region'}</Text>
                    <Text style={styles.stateName}>{r.state || 'Maharashtra'}</Text>
                  </View>
                  <View style={styles.countBadge}>
                    <Text style={styles.countNum}>{r.vehicleCount}</Text>
                    <Text style={styles.countLbl}>Vehicles</Text>
                  </View>
                </View>

                {/* Progress Bar */}
                <View style={styles.progressContainer}>
                  <View style={styles.progressHeader}>
                    <Text style={styles.progressLabel}>Verification Integrity</Text>
                    <Text style={styles.progressPct}>{rate}% Verified</Text>
                  </View>
                  <View style={styles.progressBar}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${rate}%`,
                          backgroundColor: rate > 70 ? Colors.compliant : Colors.warning
                        }
                      ]}
                    />
                  </View>
                </View>

                <View style={styles.statsRow}>
                  <Text style={styles.subStat}>Verified: {verified}</Text>
                  <Text style={styles.subStat}>Expired: {r.expiredDocsCount || 0}</Text>
                  <Text style={styles.subStat}>Total Papers: {total}</Text>
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
  regionCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 14
  },
  rHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14
  },
  districtName: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.textPrimary
  },
  stateName: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2
  },
  countBadge: {
    backgroundColor: Colors.surfaceLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center'
  },
  countNum: {
    fontSize: 16,
    fontWeight: '900',
    color: Colors.textPrimary
  },
  countLbl: {
    fontSize: 9,
    color: Colors.textMuted,
    textTransform: 'uppercase'
  },
  progressContainer: {
    marginBottom: 12
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6
  },
  progressLabel: {
    fontSize: 11,
    color: Colors.textSecondary
  },
  progressPct: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textPrimary
  },
  progressBar: {
    height: 6,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 3,
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%',
    borderRadius: 3
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 10
  },
  subStat: {
    fontSize: 11,
    color: Colors.textMuted
  }
});
