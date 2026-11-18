import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BookingsAPI, DocumentsAPI } from '../../api/endpoints';
import { Button, Field, FormScreen, PageHeading } from '../../components/UI';
import { Colors } from '../../theme/colors';
import { useResponsiveLayout } from '../../theme/responsive';
import { DISMISSIBLE_ALERT, withCancelButton } from '../../utils/alerts';

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
  const { stackFields } = useResponsiveLayout();
  const { booking } = route.params;
  const [notes, setNotes] = useState(
    'Vehicle passed official inspection standards. Genuine certificate issued.'
  );
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [issueDate, setIssueDate] = useState(todayStr());
  const [expiryDate, setExpiryDate] = useState(nextYearStr());

  // OCR scan state — same semantics as the owner upload screen: scanAttempted is
  // false for PDFs (which skip scanning and keep the mount-time defaults above),
  // and each *AutoFilled flag tracks whether that specific field was actually
  // filled by the scan vs. left blank for manual entry.
  const [isScanning, setIsScanning] = useState(false);
  const [scanAttempted, setScanAttempted] = useState(false);
  const [issueAutoFilled, setIssueAutoFilled] = useState(false);
  const [expiryAutoFilled, setExpiryAutoFilled] = useState(false);

  const handlePickFile = () => {
    Alert.alert(
      'Attach Certificate',
      'Choose source',
      withCancelButton([
        { text: 'Gallery (Photo)', onPress: pickFromGallery },
        { text: 'Camera (Take Photo)', onPress: pickFromCamera },
        { text: 'PDF Document', onPress: pickPDF },
      ]),
      DISMISSIBLE_ALERT
    );
  };

  // Scans a freshly-picked image to try to pre-fill the inline date fields. The
  // fields are blanked first so a failed/partial scan never leaves the original
  // mount-time today/next-year defaults looking like a real extraction.
  const scanAndPrefill = async (uri: string, name: string, mimeType: string) => {
    setIssueDate('');
    setExpiryDate('');
    setIssueAutoFilled(false);
    setExpiryAutoFilled(false);
    setScanAttempted(true);
    setIsScanning(true);
    try {
      const formData = new FormData();
      // @ts-ignore
      formData.append('file', { uri, name, type: mimeType });
      formData.append('type', booking.documentType);
      const res = await DocumentsAPI.scan(formData);
      const data = res.data?.data;
      if (data?.issueDate) {
        setIssueDate(data.issueDate);
        setIssueAutoFilled(true);
      }
      if (data?.expiryDate) {
        setExpiryDate(data.expiryDate);
        setExpiryAutoFilled(true);
      }
    } catch (err) {
      console.warn('Document scan failed:', err);
    } finally {
      setIsScanning(false);
    }
  };

  const pickFromGallery = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });
    if (!res.canceled && res.assets[0]) {
      const asset = res.assets[0];
      const name = asset.uri.split('/').pop() || 'certificate.jpg';
      const ext = /\.(\w+)$/.exec(name)?.[1] ?? 'jpg';
      const mimeType = `image/${ext}`;
      setSelectedFile({ uri: asset.uri, name, mimeType });
      await scanAndPrefill(asset.uri, name, mimeType);
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
      const mimeType = `image/${ext}`;
      setSelectedFile({ uri: asset.uri, name, mimeType });
      await scanAndPrefill(asset.uri, name, mimeType);
    }
  };

  const pickPDF = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
    });
    if (!res.canceled && res.assets?.[0]) {
      const asset = res.assets[0];
      // Tesseract.js can't read PDFs — skip scanning, keep the existing mount-time defaults untouched.
      setSelectedFile({ uri: asset.uri, name: asset.name || 'certificate.pdf', mimeType: 'application/pdf' });
    }
  };

  const handleComplete = async () => {
    if (!selectedFile) {
      Alert.alert(
        'Certificate Required',
        'You must attach a certificate scan before completing this booking.'
      );
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
      formData.append('issueDate', new Date(issueDate).toISOString());
      formData.append('expiryDate', new Date(expiryDate).toISOString());

      // @ts-ignore
      formData.append('certificate', {
        uri: selectedFile.uri,
        name: selectedFile.name,
        type: selectedFile.mimeType,
      });

      await BookingsAPI.updateStatus(booking._id, formData);

      Alert.alert(
        'Inspection complete',
        `The ${booking.documentType?.toUpperCase()} document is now verified in DriveDock. The owner's vehicle passport will reflect this update.`,
        [
          {
            text: 'Return to Orders',
            onPress: () => navigation.goBack(),
          },
        ]
      );
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to complete booking');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FormScreen>
      <PageHeading
        title="Complete inspection"
        subtitle="Attach the certificate and confirm its dates before completing this service."
        onBack={() => navigation.goBack()}
        backLabel="Inspections"
      />

      {/* Target Vehicle Summary */}
      <View style={styles.summaryCard}>
        <Text style={styles.cardHeader}>VEHICLE DETAILS</Text>
        <Text style={styles.vReg}>{booking.vehicleId?.regNumber}</Text>
        <Text style={styles.vModel}>
          {booking.vehicleId?.make} {booking.vehicleId?.model}
        </Text>
        <View style={styles.divider} />
        <Text style={styles.vService}>
          Document to Certify:{' '}
          <Text style={{ color: Colors.provider, fontWeight: '800' }}>
            {booking.documentType?.toUpperCase()}
          </Text>
        </Text>
      </View>

      {/* Trust Rule 1 Explainer */}
      <View style={styles.trustBanner}>
        <Text style={styles.trustText}>
          Completing this service marks the document as verified in DriveDock and records your centre as its
          issuer. Check the certificate and dates carefully.
        </Text>
      </View>

      {/* Certificate — required */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Certificate or test printout *</Text>
        <TouchableOpacity
          accessibilityRole="button"
          style={[styles.photoBox, selectedFile && styles.photoBoxSelected]}
          onPress={handlePickFile}
          disabled={isScanning}
        >
          <Text style={styles.photoText}>
            {isScanning
              ? 'Scanning document…'
              : selectedFile
                ? `${selectedFile.name} - Tap to change`
                : 'Tap to attach certificate (Photo, Camera or PDF)'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Issue & Expiry Dates */}
      <View style={[styles.dateRow, stackFields && { flexDirection: 'column', alignItems: 'stretch' }]}>
        <View style={[styles.inputGroup, { flex: stackFields ? 0 : 1 }]}>
          <Field
            label="Issue Date"
            value={issueDate}
            onChangeText={setIssueDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={Colors.textMuted}
            keyboardType="numbers-and-punctuation"
          />
          {scanAttempted && (
            <Text style={styles.scanNote}>
              {issueAutoFilled
                ? 'Auto-filled from scan — please verify'
                : "Couldn't read automatically — please enter it"}
            </Text>
          )}
        </View>
        <View style={[styles.inputGroup, { flex: stackFields ? 0 : 1 }]}>
          <Field
            label="Expiry Date"
            value={expiryDate}
            onChangeText={setExpiryDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={Colors.textMuted}
            keyboardType="numbers-and-punctuation"
          />
          {scanAttempted && (
            <Text style={styles.scanNote}>
              {expiryAutoFilled
                ? 'Auto-filled from scan — please verify'
                : "Couldn't read automatically — please enter it"}
            </Text>
          )}
        </View>
      </View>

      {/* Inspection Notes */}
      <View style={styles.inputGroup}>
        <Field
          label="Inspection notes"
          style={{ minHeight: 110 }}
          multiline
          placeholder="e.g. Emission readings: CO 0.15%, HC 50ppm. Certified valid for 12 months."
          placeholderTextColor={Colors.textMuted}
          value={notes}
          onChangeText={setNotes}
        />
      </View>

      <Button
        label="Complete & verify document"
        icon="checkmark-circle-outline"
        color={Colors.provider}
        onPress={handleComplete}
        loading={isSubmitting}
        disabled={isScanning}
      />
    </FormScreen>
  );
};

const styles = StyleSheet.create({
  summaryCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 16,
  },
  cardHeader: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textMuted,
    letterSpacing: 1,
    marginBottom: 6,
  },
  vReg: {
    fontSize: 20,
    fontWeight: '900',
    color: Colors.textPrimary,
  },
  vModel: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 12,
  },
  vService: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  trustBanner: {
    flexDirection: 'row',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.compliant,
    padding: 12,
    gap: 8,
    marginBottom: 20,
  },
  trustText: {
    flex: 1,
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  inputGroup: {
    marginBottom: 0,
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.textSecondary,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  photoBox: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    gap: 6,
  },
  photoBoxSelected: {
    borderColor: Colors.compliant,
    borderStyle: 'solid',
    backgroundColor: 'rgba(16, 185, 129, 0.05)',
  },
  photoText: {
    fontSize: 12,
    color: Colors.provider,
    fontWeight: '700',
    textAlign: 'center',
  },
  dateRow: {
    flexDirection: 'row',
    gap: 10,
  },
  scanNote: {
    fontSize: 12,
    lineHeight: 18,
    color: Colors.textMuted,
    marginTop: 4,
  },
});
