import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { DocumentsAPI, VehiclesAPI } from '../../api/endpoints';
import { RotatingQRModal } from '../../components/RotatingQRModal';
import { StatusPill } from '../../components/StatusPill';
import { Button, Notice, PageHeading, ScreenState } from '../../components/UI';
import { Colors, Layout } from '../../theme/colors';
import { DISMISSIBLE_ALERT, withCancelButton } from '../../utils/alerts';

const ALL_DOC_TYPES = [
  { key: 'rc', label: 'Registration Certificate (RC)' },
  { key: 'insurance', label: 'Motor Insurance Policy' },
  { key: 'puc', label: 'Pollution Under Control (PUC)' },
  { key: 'license', label: 'Driving License' },
  { key: 'fitness', label: 'Vehicle Fitness Certificate' },
];

const todayISO = () => new Date().toISOString().split('T')[0];
const nextYearISO = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().split('T')[0];
};

export const VehicleDetailScreen = ({ route, navigation }: any) => {
  const { vehicleId } = route.params;
  const [vehicle, setVehicle] = useState<any>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [rcAvailability, setRcAvailability] = useState<any>(null);
  const [rcCheckError, setRcCheckError] = useState<string | null>(null);
  const [isRcVerifying, setIsRcVerifying] = useState(false);
  const [rcConsentVisible, setRcConsentVisible] = useState(false);

  // Date picker modal state
  const [dateModal, setDateModal] = useState<{ visible: boolean; docType: string } | null>(null);
  const [issueDate, setIssueDate] = useState(todayISO());
  const [expiryDate, setExpiryDate] = useState(nextYearISO());

  // OCR scan state: the already-picked file waiting for the user to confirm dates,
  // whether a scan was attempted at all (false for PDFs, which skip scanning), and
  // whether each date field was actually filled in by that scan (vs. left blank).
  const [isScanning, setIsScanning] = useState(false);
  const [pendingFile, setPendingFile] = useState<{ uri: string; filename: string; mimeType: string } | null>(
    null
  );
  const [scanAttempted, setScanAttempted] = useState(false);
  const [issueAutoFilled, setIssueAutoFilled] = useState(false);
  const [expiryAutoFilled, setExpiryAutoFilled] = useState(false);

  const fetchVehicleData = async () => {
    try {
      const [res, rcStatus] = await Promise.all([
        VehiclesAPI.getById(vehicleId),
        VehiclesAPI.getRcVerification(vehicleId).catch(() => null),
      ]);
      setVehicle(res.data.data.vehicle);
      setDocuments(res.data.data.documents || []);
      setRcAvailability(rcStatus?.data?.data ?? null);
    } catch (err) {
      console.error('Fetch vehicle error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchVehicleData();
  }, [vehicleId]);

  const requestRcCheck = async () => {
    setRcConsentVisible(false);
    setIsRcVerifying(true);
    setRcCheckError(null);
    try {
      const res = await VehiclesAPI.verifyRc(vehicleId);
      setRcAvailability((current: any) => ({ ...current, latest: res.data.data.result }));
      await fetchVehicleData();
    } catch (error: any) {
      setRcCheckError(error.response?.data?.message || 'Could not complete RC verification. Please try again later.');
    } finally { setIsRcVerifying(false); }
  };

  const handleUpload = (docType: string) => {
    Alert.alert(
      'Attach Document',
      'Choose source',
      withCancelButton([
        { text: 'Gallery (Photo)', onPress: () => pickFromGallery(docType) },
        { text: 'Camera (Take Photo)', onPress: () => pickFromCamera(docType) },
        { text: 'PDF Document', onPress: () => pickPDF(docType) },
      ]),
      DISMISSIBLE_ALERT
    );
  };

  // Scans the already-picked image (never a PDF) to try to pre-fill the date modal.
  // Best-effort only: a failed/partial scan leaves the relevant field blank rather
  // than a fake default, since a stale-looking default is indistinguishable from a
  // real extraction to the user.
  const scanAndPrefill = async (docType: string, uri: string, filename: string, mimeType: string) => {
    setIssueDate('');
    setExpiryDate('');
    setIssueAutoFilled(false);
    setExpiryAutoFilled(false);
    setScanAttempted(true);
    setPendingFile({ uri, filename, mimeType });
    setIsScanning(true);
    try {
      const formData = new FormData();
      // @ts-ignore
      formData.append('file', { uri, name: filename, type: mimeType });
      formData.append('type', docType);
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
      setDateModal({ visible: true, docType });
    }
  };

  const confirmUpload = (docType: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(issueDate) || !/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) {
      Alert.alert('Invalid Date', 'Enter dates in YYYY-MM-DD format');
      return;
    }
    if (new Date(expiryDate) <= new Date(issueDate)) {
      Alert.alert('Invalid Date', 'Expiry date must be after issue date');
      return;
    }
    if (!pendingFile) return;

    setDateModal(null);
    doUpload(docType, pendingFile.uri, pendingFile.filename, pendingFile.mimeType);
  };

  const doUpload = async (docType: string, uri: string, filename: string, mimeType: string) => {
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('type', docType);
      formData.append('issueDate', new Date(issueDate).toISOString());
      formData.append('expiryDate', new Date(expiryDate).toISOString());
      // @ts-ignore
      formData.append('file', { uri, name: filename, type: mimeType });

      await DocumentsAPI.upload(vehicleId, formData);
      Alert.alert(
        'Uploaded for Tracking',
        docType === 'rc'
          ? 'RC saved as unverified. Use Check RC to compare registration records through Arya, or complete the approved-provider workflow.'
          : 'Document saved as unverified until inspected and certified by an approved provider.'
      );
      fetchVehicleData();
    } catch (err: any) {
      Alert.alert('Upload Error', err.response?.data?.message || 'Failed to upload document');
    } finally {
      setIsUploading(false);
    }
  };

  const pickFromGallery = async (docType: string) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const filename = asset.uri.split('/').pop() || `${docType}.jpg`;
    const ext = /\.(\w+)$/.exec(filename)?.[1] ?? 'jpg';
    await scanAndPrefill(docType, asset.uri, filename, `image/${ext}`);
  };

  const pickFromCamera = async (docType: string) => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Camera access is needed to take a photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.8 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const filename = asset.uri.split('/').pop() || `${docType}.jpg`;
    const ext = /\.(\w+)$/.exec(filename)?.[1] ?? 'jpg';
    await scanAndPrefill(docType, asset.uri, filename, `image/${ext}`);
  };

  const pickPDF = async (docType: string) => {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const filename = asset.name || `${docType}.pdf`;
    // Tesseract.js can't read PDFs — skip scanning entirely, same manual defaults as before.
    setScanAttempted(false);
    setIssueAutoFilled(false);
    setExpiryAutoFilled(false);
    setIssueDate(todayISO());
    setExpiryDate(nextYearISO());
    setPendingFile({ uri: asset.uri, filename, mimeType: 'application/pdf' });
    setDateModal({ visible: true, docType });
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!vehicle) {
    return (
      <View style={styles.container}>
        <View style={Layout.content}>
          <PageHeading title="Vehicle documents" onBack={() => navigation.goBack()} />
          <ScreenState
            title="Couldn't load this vehicle"
            message="Check your connection and try again."
            action="Try again"
            onAction={() => {
              setIsLoading(true);
              fetchVehicleData();
            }}
          />
        </View>
      </View>
    );
  }

  const docMap = new Map<string, any>();
  documents.forEach((d) => docMap.set(d.type, d));

  return (
    <View style={styles.container}>
      {/* Top Bar */}
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
        >
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{vehicle.regNumber}</Text>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => setQrModalVisible(true)}
          style={styles.qrHeaderBtn}
        >
          <Text style={styles.qrHeaderBtnText}>QR</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Vehicle Spec Card */}
        <View style={styles.specCard}>
          <View style={styles.specHeader}>
            <View>
              <Text style={styles.specMakeModel}>
                {vehicle.make} {vehicle.model}
              </Text>
              <Text style={styles.specMeta}>
                Model Year {vehicle.year} · {vehicle.fuelType.toUpperCase()}
              </Text>
            </View>
            <View style={styles.regionBadge}>
              <Text style={styles.regionText}>{vehicle.region?.district || 'Not set'}</Text>
            </View>
          </View>

          {/* Trust Banner Explainer */}
          <View style={styles.trustExplainer}>
            <Text style={styles.trustText}>
              Uploads remain unverified. Approved providers certify service documents; an RC can also be
              checked against registry records through Arya. Registry checks do not prove ownership or image authenticity.
            </Text>
          </View>
        </View>

        {/* Vehicle Twin CTA */}
        <TouchableOpacity
          accessibilityRole="button"
          style={styles.twinBtn}
          onPress={() => navigation.navigate('VehicleTwin', { vehicleId: vehicle._id })}
        >
          <Text style={styles.twinBtnText}>Vehicle Twin — Score & History →</Text>
        </TouchableOpacity>

        {/* Documents Checklist */}
        <View style={styles.docsSection}>
          <Text style={styles.sectionHeading}>Your documents · 5 required</Text>

          {ALL_DOC_TYPES.map((item) => {
            const doc = docMap.get(item.key);
            const isVerified = doc?.verified === true;
            const isExpired = doc && new Date(doc.expiryDate).getTime() < Date.now();

            return (
              <View key={item.key} style={styles.docItemCard}>
                <View style={styles.docTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.docLabel}>{item.label}</Text>
                    {doc ? (
                      <Text style={styles.docDates}>
                        Expires: {new Date(doc.expiryDate).toLocaleDateString()}
                      </Text>
                    ) : (
                      <Text style={styles.docMissing}>Missing from passport</Text>
                    )}
                  </View>

                  {doc ? (
                    <StatusPill
                      label={isExpired ? 'EXPIRED' : isVerified ? 'Verified' : 'Unverified'}
                      type={isExpired ? 'nonCompliant' : isVerified ? 'compliant' : 'nonCompliant'}
                    />
                  ) : (
                    <StatusPill label="MISSING" type="nonCompliant" />
                  )}
                </View>

                {/* Issuer Info */}
                {doc && (
                  <View style={styles.issuerRow}>
                    <Text style={styles.issuerText}>
                      {isVerified
                        ? doc.verificationSource === 'arya'
                          ? 'RC registration record verified through Arya'
                          : `Certified by: ${doc.issuedByProviderId?.businessName || 'Approved Station'}`
                        : `Uploaded by: Owner (Uncertified tracking photo)`}
                    </Text>
                  </View>
                )}

                {item.key === 'rc' && (
                  <View style={{ marginTop: 12, gap: 10 }}>
                    {rcAvailability?.latest && (
                      <Notice
                        title={rcAvailability.latest.outcome === 'verified' ? 'RC record verified'
                          : rcAvailability.latest.outcome === 'record_matched' ? 'RC record matched'
                          : 'RC verification result'}
                        tone={['verified', 'record_matched'].includes(rcAvailability.latest.outcome) ? 'info' : 'warning'}
                      >
                        {rcAvailability.latest.message}
                        {'\n'}Checked: {new Date(rcAvailability.latest.checkedAt).toLocaleString()}
                      </Notice>
                    )}
                    {rcCheckError && <Notice title="RC check could not finish" tone="error">{rcCheckError}</Notice>}
                    {!rcAvailability?.enabled && (
                      <Text style={styles.issuerText}>Arya RC verification is not enabled on this server.</Text>
                    )}
                    {!doc && <Text style={styles.issuerText}>Upload your RC before requesting a registry check.</Text>}
                    <Button
                      label={rcAvailability?.latest ? 'Check RC again' : 'Verify RC with Arya'}
                      loading={isRcVerifying}
                      disabled={!rcAvailability?.enabled || !doc || isUploading || isRcVerifying}
                      onPress={() => setRcConsentVisible(true)}
                    />
                  </View>
                )}

                {/* Actions */}
                <View style={styles.docActions}>
                  <TouchableOpacity
                    accessibilityRole="button"
                    style={styles.uploadBtn}
                    onPress={() => handleUpload(item.key)}
                    disabled={isUploading || isRcVerifying}
                  >
                    <Text style={styles.uploadBtnText}>{doc ? 'Re-upload' : 'Upload'}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    accessibilityRole="button"
                    style={styles.renewBtn}
                    onPress={() =>
                      navigation.navigate('BookSlot', {
                        vehicleId: vehicle._id,
                        documentType: item.key,
                      })
                    }
                  >
                    <Text style={styles.renewBtnText}>Book renewal →</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* Rotating QR Modal */}
      <RotatingQRModal
        visible={qrModalVisible}
        vehicleId={vehicle._id}
        regNumber={vehicle.regNumber}
        onClose={() => setQrModalVisible(false)}
      />

      <Modal visible={rcConsentVisible} transparent animationType="fade" onRequestClose={() => setRcConsentVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Check RC with Arya?</Text>
            <Text style={styles.modalSubtitle}>
              This sends {vehicle.regNumber} to Arya and may use one verification credit. It checks registration records,
              not ownership or the authenticity of the uploaded image. Recent results may be reused for five minutes.
            </Text>
            <Button label="Check RC" onPress={requestRcCheck} />
            <TouchableOpacity accessibilityRole="button" style={styles.modalCancelBtn} onPress={() => setRcConsentVisible(false)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Scanning indicator — shown while the picked image is being OCR'd, before the date modal opens */}
      <Modal visible={isScanning} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { alignItems: 'center' }]}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={[styles.modalSubtitle, { marginTop: 12, marginBottom: 0 }]}>Scanning document…</Text>
          </View>
        </View>
      </Modal>

      {/* Date picker modal for document upload */}
      <Modal
        visible={!!dateModal?.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setDateModal(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Document Dates</Text>
            <Text style={styles.modalSubtitle}>
              Enter the dates printed on the {dateModal?.docType?.toUpperCase()} document:
            </Text>

            <Text style={styles.modalLabel}>Issue Date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.modalInput}
              value={issueDate}
              onChangeText={setIssueDate}
              placeholder="e.g. 2024-01-15"
              placeholderTextColor={Colors.textMuted}
              keyboardType="numbers-and-punctuation"
            />
            {scanAttempted && (
              <Text style={styles.scanNote}>
                {issueAutoFilled
                  ? 'Auto-filled from scan — please verify'
                  : "Couldn't read this automatically — please enter it"}
              </Text>
            )}

            <Text style={styles.modalLabel}>Expiry Date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.modalInput}
              value={expiryDate}
              onChangeText={setExpiryDate}
              placeholder="e.g. 2025-01-15"
              placeholderTextColor={Colors.textMuted}
              keyboardType="numbers-and-punctuation"
            />
            {scanAttempted && (
              <Text style={styles.scanNote}>
                {expiryAutoFilled
                  ? 'Auto-filled from scan — please verify'
                  : "Couldn't read this automatically — please enter it"}
              </Text>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                accessibilityRole="button"
                style={styles.modalCancelBtn}
                onPress={() => setDateModal(null)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                style={styles.modalConfirmBtn}
                onPress={() => dateModal && confirmUpload(dateModal.docType)}
              >
                <Text style={styles.modalConfirmText}>Choose Source →</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    padding: 6,
  },
  backText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: Colors.textPrimary,
  },
  qrHeaderBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  qrHeaderBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
  },
  scroll: {
    flex: 1,
  },
  content: Layout.content,
  specCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 20,
  },
  specHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  specMakeModel: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  specMeta: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  regionBadge: {
    backgroundColor: Colors.surfaceLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  regionText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  trustExplainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(29, 100, 242, 0.08)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(29, 100, 242, 0.2)',
    padding: 10,
    gap: 8,
  },
  trustText: {
    flex: 1,
    fontSize: 11,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  twinBtn: {
    backgroundColor: Colors.primaryLight,
    borderWidth: 1,
    borderColor: Colors.primary,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 20,
  },
  twinBtnText: {
    color: Colors.primary,
    fontWeight: '800',
    fontSize: 13,
  },
  docsSection: {
    gap: 12,
  },
  sectionHeading: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    color: Colors.textMuted,
    marginBottom: 4,
  },
  docItemCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
  },
  docTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
    flexWrap: 'wrap',
    gap: 10,
  },
  docLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  docDates: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  docMissing: {
    fontSize: 11,
    color: Colors.nonCompliant,
    fontWeight: '600',
    marginTop: 2,
  },
  issuerRow: {
    backgroundColor: Colors.surfaceLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 10,
  },
  issuerText: {
    fontSize: 10,
    color: Colors.textMuted,
  },
  docActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  uploadBtn: {
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
  },
  uploadBtnText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  renewBtn: {
    flex: 1,
    backgroundColor: Colors.primaryLight,
    borderWidth: 1,
    borderColor: Colors.primary,
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  renewBtnText: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '800',
  },

  // Date picker modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 20,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 16,
  },
  modalLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  modalInput: {
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: Colors.textPrimary,
    fontSize: 14,
    marginBottom: 14,
  },
  scanNote: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: -8,
    marginBottom: 12,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalCancelText: {
    color: Colors.textSecondary,
    fontWeight: '700',
    fontSize: 14,
  },
  modalConfirmBtn: {
    flex: 2,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: Colors.primary,
  },
  modalConfirmText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
  },
});
