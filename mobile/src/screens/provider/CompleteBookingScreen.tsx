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
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Colors } from '../../theme/colors';
import { BookingsAPI } from '../../api/endpoints';

const todayStr = () => new Date().toISOString().split('T')[0];
const nextYearStr = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().split('T')[0];
};

interface SelectedFile {
  uri: string;
  name: string;
  mimeType: string;
}

export const CompleteBookingScreen = ({ route, navigation }: any) => {
  const { booking } = route.params;
  const [notes, setNotes] = useState('Vehicle passed official inspection standards. Genuine certificate issued.');
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [issueDate, setIssueDate] = useState(todayStr());
  const [expiryDate, setExpiryDate] = useState(nextYearStr());

  const handlePickFile = () => {
    Alert.alert('Attach Certificate', 'Choose source', [
      { text: 'Gallery (Photo)', onPress: pickFromGallery },
      { text: 'Camera (Take Photo)', onPress: pickFromCamera },
      { text: 'PDF Document', onPress: pickPDF },
      { text: 'Cancel', style: 'cancel' }
    ]);
  };

  const pickFromGallery = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8
    });
    if (!res.canceled && res.assets[0]) {
      const asset = res.assets[0];
      const name = asset.uri.split('/').pop() || 'certificate.jpg';
      const ext = /\.(\w+)$/.exec(name)?.[1] ?? 'jpg';
      setSelectedFile({ uri: asset.uri, name, mimeType: `image/${ext}` });
    }
  };

  const pickFromCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Camera access is needed to take a photo.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.8 });
    if (!res.canceled && res.assets[0]) {
      const asset = res.assets[0];
      const name = asset.uri.split('/').pop() || 'certificate.jpg';
      const ext = /\.(\w+)$/.exec(name)?.[1] ?? 'jpg';
      setSelectedFile({ uri: asset.uri, name, mimeType: `image/${ext}` });
    }
  };

  const pickPDF = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
    if (!res.canceled && res.assets?.[0]) {
      const asset = res.assets[0];
      setSelectedFile({ uri: asset.uri, name: asset.name || 'certificate.pdf', mimeType: 'application/pdf' });
    }
  };

  const handleComplete = async () => {
    if (!selectedFile) {
      Alert.alert('Certificate Required', 'You must attach a certificate scan before completing this booking.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(issueDate) || !/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) {
      Alert.alert('Invalid Date', 'Enter dates in YYYY-MM-DD format (e.g. 2025-01-15)');
      return;
    }
    if (new Date(expiryDate) <= new Date(issueDate)) {
      Alert.alert('Invalid Date', 'Expiry date must be after issue date');
      return;
    }
    if (new Date(expiryDate) <= new Date()) {
      Alert.alert('Invalid Date', 'Expiry date must be in the future');
      return;
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('status', 'completed');
      formData.append('notes', notes);
      formData.append('expiryDate', new Date(expiryDate).toISOString());

      // @ts-ignore
      formData.append('certificate', {
        uri: selectedFile.uri,
        name: selectedFile.name,
        type: selectedFile.mimeType
      });

      await BookingsAPI.updateStatus(booking._id, formData);

      Alert.alert(
        'Certification Complete! (Trust Rule 1)',
        `Document ${booking.documentType?.toUpperCase()} has been set to VERIFIED: TRUE. The owner's dynamic QR code will now reflect this verified status.`,
        [
          {
            text: 'Return to Orders',
            onPress: () => navigation.goBack()
          }
        ]
      );
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to complete booking');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
        <Text style={styles.backText}>← Back to Orders</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Certify & Complete Inspection</Text>
      <Text style={styles.subtitle}>
        Issue an official, tamper-proof renewal certificate for vehicle compliance.
      </Text>

      {/* Target Vehicle Summary */}
      <View style={styles.summaryCard}>
        <Text style={styles.cardHeader}>VEHICLE DETAILS</Text>
        <Text style={styles.vReg}>{booking.vehicleId?.regNumber}</Text>
        <Text style={styles.vModel}>{booking.vehicleId?.make} {booking.vehicleId?.model}</Text>
        <View style={styles.divider} />
        <Text style={styles.vService}>
          Document to Certify: <Text style={{ color: Colors.provider, fontWeight: '800' }}>{booking.documentType?.toUpperCase()}</Text>
        </Text>
      </View>

      {/* Trust Rule 1 Explainer */}
      <View style={styles.trustBanner}>
        <Text style={styles.trustText}>
          <Text style={{ fontWeight: '800', color: Colors.textPrimary }}>Trust Rule 1 Active:</Text> When you confirm this completion, the system transitions this vehicle's document to <Text style={{ color: Colors.compliant, fontWeight: '800' }}>verified: true</Text> with your Station ID permanently recorded.
        </Text>
      </View>

      {/* Certificate — required */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Certificate Document / Test Printout *</Text>
        <TouchableOpacity
          style={[styles.photoBox, selectedFile && styles.photoBoxSelected]}
          onPress={handlePickFile}
        >
          <Text style={styles.photoText}>
            {selectedFile
              ? `${selectedFile.name} - Tap to change`
              : 'Tap to attach certificate (Photo, Camera or PDF)'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Issue & Expiry Dates */}
      <View style={styles.dateRow}>
        <View style={[styles.inputGroup, { flex: 1 }]}>
          <Text style={styles.label}>Issue Date</Text>
          <TextInput
            style={styles.input}
            value={issueDate}
            onChangeText={setIssueDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={Colors.textMuted}
            keyboardType="numbers-and-punctuation"
          />
        </View>
        <View style={[styles.inputGroup, { flex: 1 }]}>
          <Text style={styles.label}>Expiry Date</Text>
          <TextInput
            style={styles.input}
            value={expiryDate}
            onChangeText={setExpiryDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={Colors.textMuted}
            keyboardType="numbers-and-punctuation"
          />
        </View>
      </View>

      {/* Inspection Notes */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Official Certification Notes</Text>
        <TextInput
          style={[styles.input, { height: 80 }]}
          multiline
          placeholder="e.g. Emission readings: CO 0.15%, HC 50ppm. Certified valid for 12 months."
          placeholderTextColor={Colors.textMuted}
          value={notes}
          onChangeText={setNotes}
        />
      </View>

      <TouchableOpacity
        style={[styles.submitBtn, isSubmitting && styles.btnDisabled]}
        onPress={handleComplete}
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.submitBtnText}>Sign & Mark Document VERIFIED</Text>
        )}
      </TouchableOpacity>
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
    color: Colors.provider,
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
  summaryCard: {
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
    marginBottom: 6
  },
  vReg: {
    fontSize: 20,
    fontWeight: '900',
    color: Colors.textPrimary
  },
  vModel: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 12
  },
  vService: {
    fontSize: 13,
    color: Colors.textSecondary
  },
  trustBanner: {
    flexDirection: 'row',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.compliant,
    padding: 12,
    gap: 8,
    marginBottom: 20
  },
  trustIcon: {
    fontSize: 16
  },
  trustText: {
    flex: 1,
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 16
  },
  inputGroup: {
    marginBottom: 16
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.textSecondary,
    marginBottom: 6,
    textTransform: 'uppercase'
  },
  photoBox: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    gap: 6
  },
  photoBoxSelected: {
    borderColor: Colors.compliant,
    borderStyle: 'solid',
    backgroundColor: 'rgba(16, 185, 129, 0.05)',
  },
  photoIcon: {
    fontSize: 28
  },
  photoText: {
    fontSize: 12,
    color: Colors.provider,
    fontWeight: '700',
    textAlign: 'center'
  },
  dateRow: {
    flexDirection: 'row',
    gap: 10,
  },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Colors.textPrimary,
    fontSize: 14,
    textAlignVertical: 'top'
  },
  submitBtn: {
    backgroundColor: Colors.compliant,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10
  },
  btnDisabled: {
    opacity: 0.6
  },
  submitBtnText: {
    color: '#0B0F19',
    fontWeight: '900',
    fontSize: 15,
    letterSpacing: 0.5
  }
});
