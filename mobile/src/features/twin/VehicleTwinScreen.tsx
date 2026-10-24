import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, RefreshControl, Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Shadow, BorderRadius } from '../../theme/colors';
import { TwinAPI } from './api';

// ── Score badge ───────────────────────────────────────────────────────────────

const LABEL_COLORS: Record<string, string> = {
  'Excellent':       Colors.compliant,
  'Good':            '#16A34A',
  'Fair':            Colors.warning,
  'Needs Attention': Colors.nonCompliant
};

const ScoreBadge = ({ score, label }: { score: number; label: string }) => {
  const color = LABEL_COLORS[label] ?? Colors.textSecondary;
  return (
    <View style={[styles.scoreBadge, { borderColor: color }]}>
      <Text style={[styles.scoreNumber, { color }]}>{score}</Text>
      <Text style={styles.scoreMax}>/100</Text>
      <View style={[styles.scoreLabelBg, { backgroundColor: color + '18' }]}>
        <Text style={[styles.scoreLabelText, { color }]}>{label}</Text>
      </View>
    </View>
  );
};

// ── Breakdown row ─────────────────────────────────────────────────────────────

const BreakdownRow = ({ label, score, max }: { label: string; score: number; max: number }) => (
  <View style={styles.breakdownRow}>
    <Text style={styles.breakdownLabel}>{label}</Text>
    <View style={styles.breakdownBar}>
      <View style={[styles.breakdownFill, { width: `${(score / max) * 100}%` as any }]} />
    </View>
    <Text style={styles.breakdownScore}>{score}/{max}</Text>
  </View>
);

// ── Timeline item ─────────────────────────────────────────────────────────────

const TYPE_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  document:  'document-text-outline',
  service:   'construct-outline',
  violation: 'warning-outline',
  challan:   'cash-outline',
  ownership: 'swap-horizontal-outline'
};
const TYPE_COLOR: Record<string, string> = {
  document:  Colors.compliant,
  service:   Colors.primary,
  violation: Colors.nonCompliant,
  challan:   Colors.warning,
  ownership: Colors.provider
};

const TimelineRow = ({ item }: { item: any }) => {
  const color = TYPE_COLOR[item.type] ?? Colors.textMuted;
  const icon  = TYPE_ICON[item.type]  ?? 'ellipse-outline';
  return (
    <View style={styles.timelineRow}>
      <View style={[styles.timelineDot, { backgroundColor: color + '20', borderColor: color }]}>
        <Ionicons name={icon} size={14} color={color} />
      </View>
      <View style={styles.timelineContent}>
        <Text style={styles.timelineTitle}>{item.title}</Text>
        <Text style={styles.timelineDetail}>{item.detail}</Text>
        <Text style={styles.timelineDate}>{new Date(item.date).toLocaleDateString('en-IN')}</Text>
      </View>
    </View>
  );
};

// ── Main screen ───────────────────────────────────────────────────────────────

export const VehicleTwinScreen = ({ route, navigation }: any) => {
  const { vehicleId } = route.params;
  const [scoreData, setScoreData]     = useState<any>(null);
  const [timeline, setTimeline]       = useState<any[]>([]);
  const [isLoading, setIsLoading]     = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError]             = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const [sRes, tRes] = await Promise.all([
        TwinAPI.getScore(vehicleId),
        TwinAPI.getTimeline(vehicleId)
      ]);
      setScoreData(sRes.data.data);
      setTimeline(tRes.data.data ?? []);
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Failed to load Vehicle Twin data');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [vehicleId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = () => { setIsRefreshing(true); fetchData(); };

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity onPress={fetchData} style={styles.retryBtn}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const chain: any[] = scoreData?.ownershipChain ?? [];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Vehicle Twin</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
      >
        {/* Pitch line */}
        <View style={styles.pitchCard}>
          <Ionicons name="shield-checkmark-outline" size={18} color={Colors.primary} />
          <Text style={styles.pitchText}>
            A car's reputation travels with it — like a credit score for vehicles.
          </Text>
        </View>

        {/* Score badge */}
        {scoreData && (
          <View style={styles.scoreCard}>
            <Text style={styles.sectionLabel}>TWIN SCORE</Text>
            <ScoreBadge score={scoreData.total} label={scoreData.label} />
            <View style={styles.breakdownSection}>
              <BreakdownRow label="Documents"  score={scoreData.breakdown.documents.score}  max={45} />
              <BreakdownRow label="Services"   score={scoreData.breakdown.services.score}   max={20} />
              <BreakdownRow label="Violations" score={scoreData.breakdown.violations.score} max={20} />
              <BreakdownRow label="Challans"   score={scoreData.breakdown.challans.score}   max={15} />
            </View>
            {scoreData.ledgerIntact === false && (
              <View style={styles.tamperBanner}>
                <Ionicons name="alert-circle-outline" size={14} color={Colors.nonCompliant} />
                <Text style={styles.tamperText}>Ownership ledger integrity check failed</Text>
              </View>
            )}
          </View>
        )}

        {/* Ownership chain */}
        {chain.length > 0 && (
          <View style={styles.chainCard}>
            <Text style={styles.sectionLabel}>OWNERSHIP CHAIN</Text>
            <View style={styles.chainRow}>
              {chain.map((c: any, i: number) => (
                <React.Fragment key={i}>
                  <View style={[styles.chainNode, c.label === 'You' && styles.chainNodeActive]}>
                    <Text style={[styles.chainNodeText, c.label === 'You' && styles.chainNodeTextActive]}>
                      {c.label}
                    </Text>
                  </View>
                  {i < chain.length - 1 && (
                    <Ionicons name="arrow-forward-outline" size={14} color={Colors.textMuted} style={{ marginHorizontal: 4 }} />
                  )}
                </React.Fragment>
              ))}
            </View>
          </View>
        )}

        {/* Action buttons */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => navigation.navigate('TransferOwnership', { vehicleId })}
          >
            <Ionicons name="swap-horizontal-outline" size={16} color={Colors.primary} />
            <Text style={styles.actionBtnText}>Transfer Ownership</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => navigation.navigate('ShareTwin', { vehicleId })}
          >
            <Ionicons name="share-outline" size={16} color={Colors.provider} />
            <Text style={[styles.actionBtnText, { color: Colors.provider }]}>Share with Buyer</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => navigation.navigate('BuyCar')}
          >
            <Ionicons name="car-sport-outline" size={16} color={Colors.compliant} />
            <Text style={[styles.actionBtnText, { color: Colors.compliant }]}>Buy a Car</Text>
          </TouchableOpacity>
        </View>

        {/* Accept transfer button for incoming transfers */}
        <TouchableOpacity
          style={styles.acceptBtn}
          onPress={() => navigation.navigate('AcceptTransfer')}
        >
          <Ionicons name="qr-code-outline" size={16} color={Colors.textSecondary} />
          <Text style={styles.acceptBtnText}>Scan Incoming Transfer QR</Text>
        </TouchableOpacity>

        {/* Timeline */}
        <Text style={[styles.sectionLabel, { marginTop: 20, marginBottom: 12 }]}>VEHICLE HISTORY</Text>
        {timeline.length === 0 ? (
          <View style={styles.emptyTimeline}>
            <Text style={styles.emptyText}>No history recorded yet</Text>
          </View>
        ) : (
          timeline.map((item: any, i: number) => <TimelineRow key={i} item={item} />)
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: Colors.background },
  center:         { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  scroll:         { flex: 1 },
  content:        { padding: 16, paddingBottom: 40 },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14,
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border
  },
  backBtn:      { padding: 6 },
  backText:     { color: Colors.primary, fontSize: 14, fontWeight: '700' },
  headerTitle:  { fontSize: 18, fontWeight: '900', color: Colors.textPrimary },

  pitchCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.primaryLight, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.primary + '40',
    padding: 12, marginBottom: 16
  },
  pitchText: { flex: 1, fontSize: 12, color: Colors.primary, fontWeight: '600', lineHeight: 18 },

  scoreCard: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border, padding: 16, marginBottom: 16,
    ...Shadow.card
  },
  sectionLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: Colors.textMuted, marginBottom: 12 },

  scoreBadge: {
    alignSelf: 'center', alignItems: 'center',
    borderWidth: 3, borderRadius: 60,
    width: 120, height: 120, justifyContent: 'center', marginBottom: 16
  },
  scoreNumber:   { fontSize: 40, fontWeight: '900', lineHeight: 44 },
  scoreMax:      { fontSize: 12, color: Colors.textMuted, fontWeight: '700' },
  scoreLabelBg:  { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, marginTop: 4 },
  scoreLabelText:{ fontSize: 11, fontWeight: '800' },

  breakdownSection: { gap: 8 },
  breakdownRow:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  breakdownLabel:   { width: 76, fontSize: 11, color: Colors.textSecondary, fontWeight: '700' },
  breakdownBar:     { flex: 1, height: 6, backgroundColor: Colors.surfaceAlt, borderRadius: 3, overflow: 'hidden' },
  breakdownFill:    { height: '100%', backgroundColor: Colors.primary, borderRadius: 3 },
  breakdownScore:   { width: 36, fontSize: 11, color: Colors.textMuted, textAlign: 'right', fontWeight: '700' },

  tamperBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.nonCompliantBg, borderRadius: 8,
    borderWidth: 1, borderColor: Colors.nonCompliantBorder, padding: 8, marginTop: 12
  },
  tamperText: { fontSize: 11, color: Colors.nonCompliant, fontWeight: '700' },

  chainCard: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border, padding: 16, marginBottom: 16,
    ...Shadow.card
  },
  chainRow:         { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  chainNode:        { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, backgroundColor: Colors.surfaceLight, borderWidth: 1, borderColor: Colors.border },
  chainNodeActive:  { backgroundColor: Colors.primaryLight, borderColor: Colors.primary },
  chainNodeText:    { fontSize: 11, fontWeight: '700', color: Colors.textSecondary },
  chainNodeTextActive: { color: Colors.primary },

  actionsRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    paddingVertical: 12, borderRadius: BorderRadius.md, ...Shadow.card
  },
  actionBtnText: { fontSize: 12, fontWeight: '800', color: Colors.primary },

  acceptBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    paddingVertical: 11, borderRadius: BorderRadius.md, marginBottom: 4, ...Shadow.card
  },
  acceptBtnText: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },

  emptyTimeline: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border, padding: 24, alignItems: 'center'
  },
  emptyText:   { color: Colors.textMuted, fontSize: 13 },
  errorText:   { color: Colors.nonCompliant, fontSize: 14, textAlign: 'center', marginBottom: 16 },
  retryBtn:    { backgroundColor: Colors.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  retryText:   { color: '#fff', fontWeight: '800', fontSize: 14 },

  timelineRow: {
    flexDirection: 'row', gap: 12, marginBottom: 16,
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border, padding: 12, ...Shadow.card
  },
  timelineDot: {
    width: 32, height: 32, borderRadius: 16, borderWidth: 1,
    justifyContent: 'center', alignItems: 'center', flexShrink: 0
  },
  timelineContent: { flex: 1 },
  timelineTitle:   { fontSize: 13, fontWeight: '800', color: Colors.textPrimary, marginBottom: 2 },
  timelineDetail:  { fontSize: 11, color: Colors.textSecondary, lineHeight: 16, marginBottom: 4 },
  timelineDate:    { fontSize: 10, color: Colors.textMuted, fontWeight: '700' }
});
