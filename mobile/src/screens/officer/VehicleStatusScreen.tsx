import { Ionicons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusPill } from '../../components/StatusPill';
import { Notice, PageHeading } from '../../components/UI';
import { Colors, Layout } from '../../theme/colors';

export const VehicleStatusScreen = ({ route, navigation }: any) => {
  const result = route.params?.result || {};
  const isGreen = result.compliance === 'GREEN';
  const invalidQR = result.valid === false;
  const statusColor = isGreen ? Colors.compliant : Colors.nonCompliant;
  const vehicle = result.data?.vehicle;
  const issues = result.data?.issues || {};
  const documents = result.data?.documents || [];
  const pendingChallans = result.data?.pendingChallans || 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <PageHeading title="Verification result" onBack={() => navigation.goBack()} backLabel="Scanner" />

      {/* Big Compliance Status Card */}
      <View
        style={[
          styles.complianceCard,
          {
            backgroundColor: isGreen ? Colors.compliantBg : Colors.nonCompliantBg,
            borderColor: isGreen ? Colors.compliant : Colors.nonCompliant,
          },
        ]}
      >
        <Ionicons
          name={isGreen ? 'shield-checkmark-outline' : 'alert-circle-outline'}
          size={44}
          color={statusColor}
          style={{ marginBottom: 14 }}
        />
        <Text style={[styles.statusTitle, { color: statusColor }]}>
          {isGreen ? 'Compliant · GREEN' : invalidQR ? 'QR not verified · RED' : 'Needs attention · RED'}
        </Text>
        <Text style={styles.statusExplainer}>
          {result.reason || result.error || 'Trust check evaluation completed.'}
        </Text>
      </View>

      {/* Trust Rule 2 Explainer Banner */}
      <Notice title={invalidQR ? 'Ask the owner to refresh their QR' : 'What this result checks'}>
        {invalidQR
          ? 'Scan a fresh code from the owner’s app to check the vehicle documents.'
          : 'RC, insurance, PUC, licence and fitness must all be valid and verified by approved providers. Owner uploads alone do not count as verified.'}
      </Notice>

      {vehicle && (
        <View style={styles.sectionCard}>
          <Text style={styles.cardHeader}>Vehicle details</Text>
          <View style={styles.regRow}>
            <Text style={styles.vReg}>{vehicle.regNumber}</Text>
            <View style={styles.fuelBadge}>
              <Text style={styles.fuelText}>{vehicle.fuelType?.toUpperCase()}</Text>
            </View>
          </View>
          <Text style={styles.vModel}>
            {vehicle.make} {vehicle.model} ({vehicle.year}) · Owner: {vehicle.owner?.name}
          </Text>
        </View>
      )}

      {/* Flagged Issues if RED */}
      {!isGreen && (
        <View style={styles.issuesCard}>
          <Text style={styles.issuesTitle}>Items requiring attention</Text>
          {issues.unverifiedDocs?.length > 0 && (
            <View style={styles.issueRow}>
              <Text style={styles.issueBullet}>!</Text>
              <Text style={styles.issueText}>
                Unverified papers:{' '}
                <Text style={{ fontWeight: '800' }}>{issues.unverifiedDocs.join(', ')}</Text> (uploaded for
                tracking; not certified by an approved provider)
              </Text>
            </View>
          )}
          {issues.expiredDocs?.length > 0 && (
            <View style={styles.issueRow}>
              <Text style={styles.issueBullet}>x</Text>
              <Text style={styles.issueText}>
                Expired papers: <Text style={{ fontWeight: '800' }}>{issues.expiredDocs.join(', ')}</Text>
              </Text>
            </View>
          )}
          {issues.missingDocs?.length > 0 && (
            <View style={styles.issueRow}>
              <Text style={styles.issueBullet}>?</Text>
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
          <Text style={styles.cardHeader}>Document verification</Text>
          {documents.map((d: any, idx: number) => (
            <View key={idx} style={styles.docRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.docType}>{d.type?.toUpperCase()}</Text>
                <Text style={styles.docExpiry}>Expires: {new Date(d.expiryDate).toLocaleDateString()}</Text>
                <Text style={styles.docIssuer}>
                  {d.verified
                    ? `Issued by: ${d.issuedBy?.businessName || 'Approved Station'}`
                    : 'Uncertified photo'}
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

      {pendingChallans > 0 && (
        <Notice title="Pending e-challans" tone="warning">
          {pendingChallans} outstanding e-challan{pendingChallans === 1 ? '' : 's'} linked to this vehicle.
        </Notice>
      )}
      {/* Enforcement Actions */}
      <View style={styles.actions}>
        {!isGreen && vehicle && (
          <TouchableOpacity
            accessibilityRole="button"
            style={styles.violationBtn}
            onPress={() =>
              navigation.navigate('LogViolation', {
                vehicleId: vehicle.id,
                regNumber: vehicle.regNumber,
                expiredTypes: [...(issues.unverifiedDocs || []), ...(issues.expiredDocs || [])],
              })
            }
          >
            <Text style={styles.violationBtnText}>Log Violation & Issue e-Challan</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          accessibilityRole="button"
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
    backgroundColor: Colors.background,
  },
  content: Layout.content,
  complianceCard: {
    borderRadius: 16,
    borderWidth: 2,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  statusTitle: {
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 6,
  },
  statusExplainer: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  sectionCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 16,
  },
  cardHeader: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  regRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  vReg: {
    fontSize: 22,
    fontWeight: '900',
    color: Colors.textPrimary,
  },
  fuelBadge: {
    backgroundColor: Colors.surfaceLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  fuelText: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textSecondary,
  },
  vModel: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  issuesCard: {
    backgroundColor: Colors.nonCompliantBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.nonCompliant,
    padding: 14,
    marginBottom: 16,
    gap: 8,
  },
  issuesTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.nonCompliant,
  },
  issueRow: {
    flexDirection: 'row',
    gap: 8,
  },
  issueBullet: {
    fontSize: 12,
  },
  issueText: {
    flex: 1,
    fontSize: 12,
    color: Colors.textPrimary,
    lineHeight: 16,
  },
  docRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  docType: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  docExpiry: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  docIssuer: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 1,
  },
  actions: {
    gap: 12,
    marginTop: 8,
  },
  violationBtn: {
    backgroundColor: Colors.nonCompliant,
    minHeight: 50,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  violationBtnText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 14,
  },
  newScanBtn: {
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 50,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  newScanBtnText: {
    color: Colors.textPrimary,
    fontWeight: '800',
    fontSize: 14,
  },
});
