import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Colors } from '../../theme/colors';
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

export const VehicleDetailScreen = ({ route, navigation }: any) => {
  const { vehicleId } = route.params;
  const [vehicle, setVehicle] = useState<any>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [qrModalVisible, setQrModalVisible] = useState(false);

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
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8
      });

      if (result.canceled || !result.assets[0]) return;

      setIsUploading(true);
      const asset = result.assets[0];

      const formData = new FormData();
      formData.append('type', docType);
      formData.append('issueDate', new Date().toISOString());
      // Default expiry 1 year ahead
      const nextYear = new Date();
      nextYear.setFullYear(nextYear.getFullYear() + 1);
      formData.append('expiryDate', nextYear.toISOString());

      // Create file object for multipart upload
      const filename = asset.uri.split('/').pop() || `${docType}.jpg`;
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : `image/jpeg`;

      // @ts-ignore
      formData.append('file', {
        uri: asset.uri,
        name: filename,
        type
      });

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
          <Text style={styles.qrHeaderBtnText}>🛡️ QR</Text>
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
            <Text style={styles.trustIcon}>🔒</Text>
            <Text style={styles.trustText}>
              <Text style={{ fontWeight: '800', color: Colors.textPrimary }}>Trust Rule 1:</Text> Personal photo uploads remain strictly <Text style={{ color: Colors.nonCompliant, fontWeight: '800' }}>UNVERIFIED</Text>. Only an approved provider completing an official renewal marks papers <Text style={{ color: Colors.compliant, fontWeight: '800' }}>VERIFIED GENUINE</Text>.
            </Text>
          </View>
        </View>

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
                      {doc ? '📷 Re-upload' : '📷 Upload Photo'}
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
  }
});
