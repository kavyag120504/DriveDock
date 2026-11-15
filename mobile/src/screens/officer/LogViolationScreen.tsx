import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { OfficerAPI } from '../../api/endpoints';
import { Button, Field, FormScreen, PageHeading } from '../../components/UI';
import { Colors } from '../../theme/colors';

// Mirror of the server-side PENALTY_MAP in officerController.ts
const PENALTY_MAP: Record<string, number> = {
  puc: 1000,
  insurance: 2000,
  rc: 5000,
  fitness: 3000,
  license: 1500,
};

const calcPenalty = (types: string[]): number =>
  types.reduce((sum, t) => sum + (PENALTY_MAP[t.toLowerCase()] ?? 1000), 0);

export const LogViolationScreen = ({ route, navigation }: any) => {
  const { vehicleId, regNumber, expiredTypes = [] } = route.params;

  // The officer states where the check happened; no checkpoint is assumed
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState(`Failed verification check. Offenses: ${expiredTypes.join(', ')}`);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const penalty = calcPenalty(expiredTypes);
  const nothingToCite = expiredTypes.length === 0;

  const handleSubmit = async () => {
    if (nothingToCite) {
      Alert.alert('Nothing to cite', 'This vehicle has no expired or unverified document to cite.');
      return;
    }
    if (!location.trim()) {
      Alert.alert('Required', 'Please enter inspection location');
      return;
    }

    setIsSubmitting(true);
    try {
      await OfficerAPI.logViolation({
        vehicleId,
        documentTypeExpired: expiredTypes,
        location: location.trim(),
        notes,
      });

      Alert.alert(
        'Violation Logged',
        `Digital e-Challan of ₹${penalty} issued to ${regNumber}. Linked to vehicle passport.`,
        [
          {
            text: 'Return to Scanner',
            onPress: () => navigation.navigate('ScanQR'),
          },
        ]
      );
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to record violation');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FormScreen>
      <PageHeading
        title="Record a violation"
        subtitle="Review the flagged documents and add the inspection location."
        onBack={() => navigation.goBack()}
        backLabel="Verification result"
      />

      {nothingToCite && (
        <View style={styles.noticeBox}>
          <Text style={styles.noticeText}>
            No expired or unverified document was flagged on this scan, so there is nothing to cite.
          </Text>
        </View>
      )}

      {/* Target Vehicle */}
      <View style={styles.vCard}>
        <Text style={styles.vReg}>{regNumber}</Text>
        <Text style={styles.vOffenses}>
          Flagged Non-Compliance: {expiredTypes.join(', ') || 'Document Violation'}
        </Text>
      </View>

      {/* Penalty display — computed server-side from the fee table */}
      <View style={styles.penaltyCard}>
        <Text style={styles.penaltyLabel}>PENALTY AMOUNT (FEE TABLE)</Text>
        <Text style={styles.penaltyAmount}>₹{penalty.toLocaleString('en-IN')}</Text>
        <Text style={styles.penaltyBreakdown}>
          {(expiredTypes as string[])
            .map(
              (t: string) =>
                `${t.toUpperCase()}: ₹${(PENALTY_MAP[t.toLowerCase()] ?? 1000).toLocaleString('en-IN')}`
            )
            .join('  +  ')}
        </Text>
      </View>

      <View style={styles.form}>
        <View style={styles.inputGroup}>
          <Field
            label="Traffic Checkpoint / Location"
            value={location}
            onChangeText={setLocation}
            placeholder="e.g. Bandra Toll Plaza, Mumbai"
            placeholderTextColor={Colors.textMuted}
          />
        </View>

        <View style={styles.inputGroup}>
          <Field
            label="Officer Notes & Citation Details"
            multiline
            value={notes}
            onChangeText={setNotes}
            placeholder="Describe the offense..."
            placeholderTextColor={Colors.textMuted}
            textAlignVertical="top"
          />
        </View>

        <Button
          label="Confirm & issue e-challan"
          onPress={handleSubmit}
          loading={isSubmitting}
          disabled={nothingToCite}
          color={Colors.officer}
        />
      </View>
    </FormScreen>
  );
};

const styles = StyleSheet.create({
  noticeBox: {
    backgroundColor: Colors.warningBg,
    borderColor: Colors.warningBorder,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  noticeText: {
    fontSize: 12,
    color: Colors.warning,
    lineHeight: 17,
  },
  vCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 16,
  },
  vReg: {
    fontSize: 22,
    fontWeight: '900',
    color: Colors.nonCompliant,
  },
  vOffenses: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  penaltyCard: {
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    padding: 16,
    marginBottom: 20,
    alignItems: 'center',
  },
  penaltyLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.nonCompliant,
    letterSpacing: 1,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  penaltyAmount: {
    fontSize: 32,
    fontWeight: '900',
    color: Colors.nonCompliant,
  },
  penaltyBreakdown: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },
  form: {
    gap: 14,
  },
  inputGroup: {
    marginBottom: 4,
  },
});
