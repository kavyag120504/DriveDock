import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert
} from 'react-native';
import { Colors } from '../../theme/colors';
import { OfficerAPI } from '../../api/endpoints';

// Mirror of the server-side PENALTY_MAP in officerController.ts
const PENALTY_MAP: Record<string, number> = {
  puc: 1000,
  insurance: 2000,
  rc: 5000,
  fitness: 3000,
  license: 1500
};

const calcPenalty = (types: string[]): number =>
  types.reduce((sum, t) => sum + (PENALTY_MAP[t.toLowerCase()] ?? 1000), 0);

export const LogViolationScreen = ({ route, navigation }: any) => {
  const { vehicleId, regNumber, expiredTypes = [] } = route.params;

  const [location, setLocation] = useState('Marine Drive Checkpoint, Mumbai');
  const [notes, setNotes] = useState(`Failed verification check. Offenses: ${expiredTypes.join(', ')}`);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const penalty = calcPenalty(expiredTypes);

  const handleSubmit = async () => {
    if (!location) {
      Alert.alert('Required', 'Please enter inspection location');
      return;
    }

    setIsSubmitting(true);
    try {
      await OfficerAPI.logViolation({
        vehicleId,
        documentTypeExpired: expiredTypes.length > 0 ? expiredTypes : ['puc'],
        location,
        notes
      });

      Alert.alert(
        'Violation Logged',
        `Digital e-Challan of ₹${penalty} issued to ${regNumber}. Linked to vehicle passport.`,
        [
          {
            text: 'Return to Scanner',
            onPress: () => navigation.navigate('ScanQR')
          }
        ]
      );
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to record violation');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
        <Text style={styles.backText}>← Back to Status</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Issue Digital e-Challan</Text>
      <Text style={styles.subtitle}>Enforcement citation recorded against National Registry</Text>

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
          {(expiredTypes as string[]).map((t: string) => `${t.toUpperCase()}: ₹${(PENALTY_MAP[t.toLowerCase()] ?? 1000).toLocaleString('en-IN')}`).join('  +  ')}
        </Text>
      </View>

      <View style={styles.form}>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Traffic Checkpoint / Location</Text>
          <TextInput
            style={styles.input}
            value={location}
            onChangeText={setLocation}
            placeholder="e.g. Bandra Toll Plaza, Mumbai"
            placeholderTextColor={Colors.textMuted}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Officer Notes & Citation Details</Text>
          <TextInput
            style={[styles.input, { height: 80 }]}
            multiline
            value={notes}
            onChangeText={setNotes}
            placeholder="Describe the offense..."
            placeholderTextColor={Colors.textMuted}
            textAlignVertical="top"
          />
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, isSubmitting && styles.btnDisabled]}
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.submitBtnText}>Confirm Citation & Issue e-Challan</Text>
          )}
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
    padding: 20,
    paddingTop: 20,
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
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: Colors.textPrimary
  },
  subtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 4,
    marginBottom: 20
  },
  vCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 16
  },
  vReg: {
    fontSize: 22,
    fontWeight: '900',
    color: Colors.nonCompliant
  },
  vOffenses: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 4
  },
  penaltyCard: {
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    padding: 16,
    marginBottom: 20,
    alignItems: 'center'
  },
  penaltyLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.nonCompliant,
    letterSpacing: 1,
    marginBottom: 4,
    textTransform: 'uppercase'
  },
  penaltyAmount: {
    fontSize: 32,
    fontWeight: '900',
    color: Colors.nonCompliant
  },
  penaltyBreakdown: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 4,
    textAlign: 'center'
  },
  form: {
    gap: 14
  },
  inputGroup: {
    marginBottom: 4
  },
  label: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textSecondary,
    marginBottom: 6,
    textTransform: 'uppercase'
  },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Colors.textPrimary,
    fontSize: 14
  },
  submitBtn: {
    backgroundColor: Colors.nonCompliant,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10
  },
  btnDisabled: {
    opacity: 0.6
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 15
  }
});
