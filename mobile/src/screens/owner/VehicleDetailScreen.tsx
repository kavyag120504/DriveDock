import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Colors } from '../../theme/colors';
import { withCancelButton, DISMISSIBLE_ALERT } from '../../utils/alerts';
import { StatusPill } from '../../components/StatusPill';
import { RotatingQRModal } from '../../components/RotatingQRModal';
import { VehiclesAPI, DocumentsAPI } from '../../api/endpoints';

const ALL_DOC_TYPES = [
  { key: 'rc', label: 'Registration Certificate (RC)' },
  { key: 'insurance', label: 'Motor Insurance Policy' },
  { key: 'puc', label: 'Pollution Under Control (PUC)' },
  { key: 'license', label: 'Driving License' },
  { key: 'fitness', label: 'Vehicle Fitness Certificate' }
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

  // Date picker modal state
  const [dateModal, setDateModal] = useState<{ visible: boolean; docType: string } | null>(null);
  const [issueDate, setIssueDate] = useState(todayISO());
  const [expiryDate, setExpiryDate] = useState(nextYearISO());

  const fetchVehicleData = async () => {
    try {
      const res = await VehiclesAPI.getById(vehicleId);
      setVehicle(res.data.data.vehicle);
      setDocuments(res.data.data.documents || []);
    } catch (err) {
      console.error('Fetch vehicle error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchVehicleData();
  }, [vehicleId]);

  const handleUpload = async (docType: string) => {
    // Ask for dates first
    setIssueDate(todayISO());
    setExpiryDate(nextYearISO());
    setDateModal({ visible: true, docType });
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

    setDateModal(null);

    Alert.alert('Attach Document', 'Choose source', withCancelButton([
      { text: 'Gallery (Photo)', onPress: () => pickFromGallery(docType) },
      { text: 'Camera (Take Photo)', onPress: () => pickFromCamera(docType) },
      { text: 'PDF Document', onPress: () => pickPDF(docType) }
    ]), DISMISSIBLE_ALERT);
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
        'Document saved. Note (Trust Rule 1): Document remains UNVERIFIED until inspected and certified by an approved provider.'
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
      quality: 0.8
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const filename = asset.uri.split('/').pop() || `${docType}.jpg`;
    const ext = /\.(\w+)$/.exec(filename)?.[1] ?? 'jpg';
    await doUpload(docType, asset.uri, filename, `image/${ext}`);
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
    await doUpload(docType, asset.uri, filename, `image/${ext}`);
  };

  const pickPDF = async (docType: string) => {
    const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const filename = asset.name || `${docType}.pdf`;
    await doUpload(docType, asset.uri, filename, 'application/pdf');
  };

  if (isLoading || !vehicle) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  const docMap = new Map<string, any>();
  documents.forEach((d) => docMap.set(d.type, d));

  return (
    <View style={styles.container}>
      {/* Top Bar */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{vehicle.regNumber}</Text>
        <TouchableOpacity
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
              <Text style={styles.specMakeModel}>{vehicle.make} {vehicle.model}</Text>
              <Text style={styles.specMeta}>Model Year {vehicle.year} · {vehicle.fuelType.toUpperCase()}</Text>
            </View>
            <View style={styles.regionBadge}>
              <Text style={styles.regionText}>{vehicle.region?.district || 'Mumbai'}</Text>
            </View>
          </View>

          {/* Trust Banner Explainer */}
          <View style={styles.trustExplainer}>
            <Text style={styles.trustText}>
              <Text style={{ fontWeight: '800', color: Colors.textPrimary }}>Trust Rule 1:</Text> Personal photo uploads remain strictly <Text style={{ color: Colors.nonCompliant, fontWeight: '800' }}>UNVERIFIED</Text>. Only an approved provider completing an official renewal marks papers <Text style={{ color: Colors.compliant, fontWeight: '800' }}>VERIFIED GENUINE</Text>.
            </Text>
          </View>
        </View>

        {/* Vehicle Twin CTA */}
        <TouchableOpacity
          style={styles.twinBtn}
          onPress={() => navigation.navigate('VehicleTwin', { vehicleId: vehicle._id })}
        >
          <Text style={styles.twinBtnText}>Vehicle Twin — Score & History →</Text>
        </TouchableOpacity>

        {/* Documents Checklist */}
        <View style={styles.docsSection}>
          <Text style={styles.sectionHeading}>REQUIRED DOCUMENTS CHECKLIST (5)</Text>

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
                      label={isExpired ? 'EXPIRED' : isVerified ? 'VERIFIED GENUINE' : 'UNVERIFIED UPLOAD'}
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
                        ? `Certified by: ${doc.issuedByProviderId?.businessName || 'Approved Station'}`
                        : `Uploaded by: Owner (Uncertified tracking photo)`}
                    </Text>
                  </View>
                )}

                {/* Actions */}
                <View style={styles.docActions}>
                  <TouchableOpacity
                    style={styles.uploadBtn}
                    onPress={() => handleUpload(item.key)}
                    disabled={isUploading}
                  >
                    <Text style={styles.uploadBtnText}>
                      {doc ? 'Re-upload' : 'Upload'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.renewBtn}
                    onPress={() =>
                      navigation.navigate('BookSlot', {
                        vehicleId: vehicle._id,
                        documentType: item.key
                      })
                    }
                  >
                    <Text style={styles.renewBtnText}>Book Genuine Renewal →</Text>
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

            <Text style={styles.modalLabel}>Expiry Date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.modalInput}
              value={expiryDate}
              onChangeText={setExpiryDate}
              placeholder="e.g. 2025-01-15"
              placeholderTextColor={Colors.textMuted}
              keyboardType="numbers-and-punctuation"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setDateModal(null)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
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
    backgroundColor: Colors.background
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center'
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
    borderBottomColor: Colors.border
  },
  backBtn: {
    padding: 6
  },
  backText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '700'
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: Colors.textPrimary
  },
  qrHeaderBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8
  },
  qrHeaderBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12
  },
  scroll: {
    flex: 1
  },
  content: {
    padding: 16,
    paddingBottom: 40
  },
  specCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 20
  },
  specHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12
  },
  specMakeModel: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.textPrimary
  },
  specMeta: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2
  },
  regionBadge: {
    backgroundColor: Colors.surfaceLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6
  },
  regionText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary
  },
  trustExplainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(29, 100, 242, 0.08)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(29, 100, 242, 0.2)',
    padding: 10,
    gap: 8
  },
  trustIcon: {
    fontSize: 14
  },
  trustText: {
    flex: 1,
    fontSize: 11,
    color: Colors.textSecondary,
    lineHeight: 16
  },
  twinBtn: {
    backgroundColor: Colors.primaryLight,
    borderWidth: 1,
    borderColor: Colors.primary,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 20
  },
  twinBtnText: {
    color: Colors.primary,
    fontWeight: '800',
    fontSize: 13
  },
  docsSection: {
    gap: 12
  },
  sectionHeading: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    color: Colors.textMuted,
    marginBottom: 4
  },
  docItemCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14
  },
  docTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8
  },
  docLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.textPrimary
  },
  docDates: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2
  },
  docMissing: {
    fontSize: 11,
    color: Colors.nonCompliant,
    fontWeight: '600',
    marginTop: 2
  },
  issuerRow: {
    backgroundColor: Colors.surfaceLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 10
  },
  issuerText: {
    fontSize: 10,
    color: Colors.textMuted
  },
  docActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4
  },
  uploadBtn: {
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8
  },
  uploadBtnText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '700'
  },
  renewBtn: {
    flex: 1,
    backgroundColor: Colors.primaryLight,
    borderWidth: 1,
    borderColor: Colors.primary,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center'
  },
  renewBtnText: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '800'
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
