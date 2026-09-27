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

export const LogViolationScreen = ({ route, navigation }: any) => {
  const { vehicleId, regNumber, expiredTypes = [] } = route.params;

  const [location, setLocation] = useState('Marine Drive Checkpoint, Mumbai');
  const [notes, setNotes] = useState(`Failed verification check. Offenses: ${expiredTypes.join(', ')}`);
  const [penaltyAmount, setPenaltyAmount] = useState('2000');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
        notes,
        penaltyAmount: Number(penaltyAmount)
      });

      Alert.alert(
        '🚨 Violation Logged',
        `Digital e-Challan of ₹${penaltyAmount} issued to ${regNumber}. Linked to vehicle passport.`,
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
          <Text style={styles.label}>Penalty Fine Amount (INR)</Text>
          <TextInput
            style={styles.input}
            value={penaltyAmount}
            onChangeText={setPenaltyAmount}
            keyboardType="numeric"
            placeholder="2000"
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
    marginBottom: 20
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
