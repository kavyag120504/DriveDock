import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet
} from 'react-native';
import { Colors } from '../../theme/colors';
import { StatusPill } from '../../components/StatusPill';

export const VehicleStatusScreen = ({ route, navigation }: any) => {
  const result = route.params?.result || {};
  const isGreen = result.compliance === 'GREEN';
  const vehicle = result.data?.vehicle;
  const issues = result.data?.issues || {};
  const documents = result.data?.documents || [];
  const pendingChallans = result.data?.pendingChallans || 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
        <Text style={styles.backText}>← New Scan</Text>
      </TouchableOpacity>

      {/* Big Compliance Status Card */}
      <View
        style={[
          styles.complianceCard,
          {
            backgroundColor: isGreen ? Colors.compliantBg : Colors.nonCompliantBg,
            borderColor: isGreen ? Colors.compliant : Colors.nonCompliant
          }
        ]}
      >
        <Text style={styles.statusIcon}>{isGreen ? '🛡️' : '🚨'}</Text>
        <Text style={[styles.statusTitle, { color: isGreen ? Colors.compliant : Colors.nonCompliant }]}>
          {isGreen ? 'COMPLIANT (GREEN)' : 'NON-COMPLIANT (RED)'}
        </Text>
        <Text style={styles.statusExplainer}>
          {result.reason || result.error || 'Trust check evaluation completed.'}
        </Text>
      </View>

      {/* Trust Rule 2 Explainer Banner */}
      <View style={styles.trustBanner}>
        <Text style={styles.trustIcon}>🔒</Text>
        <Text style={styles.trustText}>
          <Text style={{ fontWeight: '800', color: Colors.textPrimary }}>Trust Rule 2 Evaluated:</Text> Traffic compliance requires RC, Insurance, PUC, License & Fitness to be valid <Text style={{ fontWeight: '800' }}>AND verified by approved providers</Text>. Unverified owner uploads are automatically flagged RED.
        </Text>
      </View>

      {vehicle && (
        <View style={styles.sectionCard}>
          <Text style={styles.cardHeader}>VEHICLE REGISTRATION DETAILS</Text>
          <View style={styles.regRow}>
            <Text style={styles.vReg}>{vehicle.regNumber}</Text>
            <View style={styles.fuelBadge}>
              <Text style={styles.fuelText}>{vehicle.fuelType?.toUpperCase()}</Text>
            </View>
          </View>
          <Text style={styles.vModel}>
            {vehicle.make} {vehicle.model} ({vehicle.year}) · Owner: {vehicle.owner?.name}
          </Text>
          <Text style={styles.vPhone}>Contact: {vehicle.owner?.phone}</Text>
        </View>
      )}

      {/* Flagged Issues if RED */}
      {!isGreen && (
        <View style={styles.issuesCard}>
          <Text style={styles.issuesTitle}>VIOLATION REASONS DETECTED</Text>
          {issues.unverifiedDocs?.length > 0 && (
            <View style={styles.issueRow}>
              <Text style={styles.issueBullet}>⚠️</Text>
              <Text style={styles.issueText}>
                Unverified papers: <Text style={{ fontWeight: '800' }}>{issues.unverifiedDocs.join(', ')}</Text> (Uploaded by owner for personal tracking, never certified by an authorized station)
              </Text>
            </View>
          )}
          {issues.expiredDocs?.length > 0 && (
            <View style={styles.issueRow}>
              <Text style={styles.issueBullet}>❌</Text>
              <Text style={styles.issueText}>
                Expired papers: <Text style={{ fontWeight: '800' }}>{issues.expiredDocs.join(', ')}</Text>
              </Text>
            </View>
          )}
          {issues.missingDocs?.length > 0 && (
            <View style={styles.issueRow}>
              <Text style={styles.issueBullet}>❓</Text>
              <Text style={styles.issueText}>
                Missing papers: <Text style={{ fontWeight: '800' }}>{issues.missingDocs.join(', ')}</Text>
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Documents Breakdown */}
      {documents.length > 0 && (
        <View style={styles.sectionCard}>
          <Text style={styles.cardHeader}>CERTIFICATE VERIFICATION STATUS</Text>
          {documents.map((d: any, idx: number) => (
            <View key={idx} style={styles.docRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.docType}>{d.type?.toUpperCase()}</Text>
                <Text style={styles.docExpiry}>Expires: {new Date(d.expiryDate).toLocaleDateString()}</Text>
                <Text style={styles.docIssuer}>
                  {d.verified ? `Issued by: ${d.issuedBy?.businessName || 'Approved Station'}` : 'Uncertified photo'}
                </Text>
              </View>
              <StatusPill
                label={d.verified ? 'VERIFIED' : 'UNVERIFIED'}
                type={d.verified ? 'compliant' : 'nonCompliant'}
              />
            </View>
          ))}
        </View>
      )}

      {/* Enforcement Actions */}
      <View style={styles.actions}>
        {!isGreen && vehicle && (
          <TouchableOpacity
            style={styles.violationBtn}
            onPress={() =>
              navigation.navigate('LogViolation', {
                vehicleId: vehicle.id,
                regNumber: vehicle.regNumber,
                expiredTypes: [...(issues.unverifiedDocs || []), ...(issues.expiredDocs || [])]
              })
            }
          >
            <Text style={styles.violationBtnText}>🚨 Log Violation & Issue e-Challan</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.newScanBtn}
          onPress={() => navigation.navigate('ScanQR')}
        >
          <Text style={styles.newScanBtnText}>Scan Next Vehicle →</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background
  },
  content: {
    padding: 16,
    paddingTop: 48,
    paddingBottom: 60
  },
  backBtn: {
    marginBottom: 16
  },
  backText: {
    color: Colors.officer,
    fontSize: 14,
    fontWeight: '700'
  },
  complianceCard: {
    borderRadius: 16,
    borderWidth: 2,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16
  },
  statusIcon: {
    fontSize: 36,
    marginBottom: 6
  },
  statusTitle: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 6
  },
  statusExplainer: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18
  },
  trustBanner: {
    flexDirection: 'row',
    backgroundColor: 'rgba(6, 182, 212, 0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.officer,
    padding: 12,
    gap: 8,
    marginBottom: 16
  },
  trustIcon: {
    fontSize: 16
  },
  trustText: {
    flex: 1,
    fontSize: 11,
    color: Colors.textSecondary,
    lineHeight: 16
  },
  sectionCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 16
  },
  cardHeader: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textMuted,
    letterSpacing: 1,
    marginBottom: 8
  },
  regRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  vReg: {
    fontSize: 22,
    fontWeight: '900',
    color: Colors.textPrimary
  },
  fuelBadge: {
    backgroundColor: Colors.surfaceLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4
  },
  fuelText: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textSecondary
  },
  vModel: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 4
  },
  vPhone: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2
  },
  issuesCard: {
    backgroundColor: Colors.nonCompliantBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.nonCompliant,
    padding: 14,
    marginBottom: 16,
    gap: 8
  },
  issuesTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: Colors.nonCompliant,
    letterSpacing: 1
  },
  issueRow: {
    flexDirection: 'row',
    gap: 8
  },
  issueBullet: {
    fontSize: 12
  },
  issueText: {
    flex: 1,
    fontSize: 12,
    color: Colors.textPrimary,
    lineHeight: 16
  },
  docRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border
  },
  docType: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.textPrimary
  },
  docExpiry: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1
  },
  docIssuer: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 1
  },
  actions: {
    gap: 12,
    marginTop: 8
  },
  violationBtn: {
    backgroundColor: Colors.nonCompliant,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center'
  },
  violationBtnText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 14
  },
  newScanBtn: {
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center'
  },
  newScanBtnText: {
    color: Colors.textPrimary,
    fontWeight: '800',
    fontSize: 14
  }
});
