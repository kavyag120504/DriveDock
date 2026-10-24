import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, ScrollView
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Shadow, BorderRadius } from '../../theme/colors';
import { StatusPill } from '../../components/StatusPill';
import { TwinAPI } from './api';

export const AcceptTransferScreen = ({ navigation }: any) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned]           = useState(false);
  const [isLoading, setIsLoading]       = useState(false);
  const [preview, setPreview]           = useState<any>(null);
  const [scannedToken, setScannedToken] = useState<string | null>(null);
  const [isAccepting, setIsAccepting]   = useState(false);

  const fetchPreview = async (token: string) => {
    setIsLoading(true);
    setPreview(null);
    setScannedToken(null);
    try {
      const res = await TwinAPI.previewTransfer(token);
      setPreview(res.data.data);
      setScannedToken(token);
    } catch (err: any) {
      const code    = err.response?.data?.code;
      const message = err.response?.data?.message ?? 'Failed to load transfer preview';
      if (code === 'EXPIRED' || err.response?.status === 410) {
        Alert.alert('Transfer Expired', 'This QR code has expired. Ask the seller to generate a new one.');
      } else {
        Alert.alert('Preview Error', message);
      }
    } finally {
      setIsLoading(false);
      setScanned(false);
    }
  };

  const onBarcodeScanned = ({ data }: { data: string }) => {
    if (scanned || isLoading) return;
    setScanned(true);
    fetchPreview(data);
  };

  const handleAccept = async () => {
    if (!scannedToken) return;
    Alert.alert(
      'Accept Ownership',
      'Transfer the vehicle to your account? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Accept',
          onPress: async () => {
            setIsAccepting(true);
            try {
              await TwinAPI.acceptTransfer(scannedToken);
              Alert.alert(
                'Transfer Complete',
                'The vehicle has been transferred to your account. You can now find it on your dashboard.',
                [{ text: 'Go to Dashboard', onPress: () => navigation.navigate('DashboardMain') }]
              );
              setPreview(null);
              setScannedToken(null);
            } catch (err: any) {
              const code    = err.response?.data?.code;
              const message = err.response?.data?.message ?? 'Transfer failed';
              if (code === 'ALREADY_PROCESSED') {
                Alert.alert('Already Processed', 'This transfer has already been accepted by someone else.');
              } else if (code === 'EXPIRED') {
                Alert.alert('Expired', 'The transfer QR has expired. Ask the seller to generate a new one.');
              } else {
                Alert.alert('Transfer Failed', message);
              }
            } finally {
              setIsAccepting(false);
            }
          }
        }
      ]
    );
  };

  const handleReject = () => {
    setPreview(null);
    setScannedToken(null);
    setScanned(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Accept Transfer</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Camera or preview */}
        {!preview ? (
          <View style={[styles.cameraBox, Shadow.card]}>
            {!permission ? (
              <ActivityIndicator color={Colors.primary} />
            ) : !permission.granted ? (
              <View style={styles.camNotice}>
                <Ionicons name="camera-outline" size={36} color={Colors.primary} />
                <Text style={styles.camTitle}>Camera Access Required</Text>
                <Text style={styles.camDesc}>Enable camera permission to scan the seller's transfer QR</Text>
                <TouchableOpacity onPress={requestPermission} style={styles.permBtn}>
                  <Text style={styles.permBtnText}>Grant Permission</Text>
                </TouchableOpacity>
              </View>
            ) : isLoading ? (
              <View style={styles.camNotice}>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={styles.camTitle}>Loading preview…</Text>
              </View>
            ) : (
              <CameraView
                style={StyleSheet.absoluteFill}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={onBarcodeScanned}
              >
                <View style={styles.overlay}>
                  <View style={styles.scanFrame}>
                    <View style={[styles.corner, styles.cornerTL]} />
                    <View style={[styles.corner, styles.cornerTR]} />
                    <View style={[styles.corner, styles.cornerBL]} />
                    <View style={[styles.corner, styles.cornerBR]} />
                  </View>
                  <Text style={styles.scanPrompt}>Align transfer QR within frame</Text>
                </View>
              </CameraView>
            )}
          </View>
        ) : (
          /* Preview card */
          <View style={[styles.previewCard, Shadow.card]}>
            <Text style={styles.previewHeading}>Vehicle Preview</Text>
            <Text style={styles.previewReg}>{preview.vehicle?.regNumber}</Text>
            <Text style={styles.previewMeta}>
              {preview.vehicle?.make} {preview.vehicle?.model} · {preview.vehicle?.year} · {preview.vehicle?.fuelType?.toUpperCase()}
            </Text>

            {/* Score */}
            <View style={styles.scoreRow}>
              <Text style={styles.scoreLabel}>Twin Score</Text>
              <View style={styles.scorePill}>
                <Text style={styles.scoreValue}>{preview.twinScore}</Text>
                <Text style={styles.scoreOut}>/100</Text>
                <Text style={styles.scoreBadge}> · {preview.twinScoreLabel}</Text>
              </View>
            </View>

            {/* Verified docs */}
            <Text style={styles.docHeading}>Verified Documents</Text>
            {preview.verifiedDocTypes?.length > 0 ? (
              <View style={styles.docChips}>
                {preview.verifiedDocTypes.map((t: string) => (
                  <StatusPill key={t} label={t.toUpperCase()} type="compliant" />
                ))}
              </View>
            ) : (
              <Text style={styles.noDocsText}>No verified documents at time of transfer</Text>
            )}

            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{preview.completedServiceCount}</Text>
                <Text style={styles.statLabel}>Services</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{preview.ownershipCount}</Text>
                <Text style={styles.statLabel}>Prior Owners</Text>
              </View>
            </View>

            {/* Insurance note */}
            <View style={styles.noteCard}>
              <Ionicons name="information-circle-outline" size={14} color={Colors.warning} />
              <Text style={styles.noteText}>
                Insurance policy may need to be re-issued in your name after this transfer.
              </Text>
            </View>

            <View style={styles.actionRow}>
              <TouchableOpacity onPress={handleReject} style={styles.rejectBtn}>
                <Text style={styles.rejectText}>Reject</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleAccept}
                style={[styles.acceptBtn, isAccepting && styles.btnDisabled]}
                disabled={isAccepting}
              >
                {isAccepting
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.acceptText}>Accept Ownership</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll:    { flex: 1 },
  content:   { padding: 16, paddingBottom: 40 },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14,
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border
  },
  backBtn:     { padding: 6 },
  backText:    { color: Colors.primary, fontSize: 14, fontWeight: '700' },
  headerTitle: { fontSize: 17, fontWeight: '900', color: Colors.textPrimary },

  cameraBox: {
    width: '100%', height: 320, backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg, overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.border
  },
  camNotice: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  camTitle:  { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  camDesc:   { fontSize: 12, color: Colors.textSecondary, textAlign: 'center', lineHeight: 18 },
  permBtn:   { backgroundColor: Colors.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, marginTop: 4 },
  permBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },

  overlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
  scanFrame: { width: 220, height: 220, borderRadius: 16, position: 'relative' },
  corner:    { position: 'absolute', width: 26, height: 26, borderColor: '#fff', borderWidth: 3 },
  cornerTL:  { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 4 },
  cornerTR:  { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 4 },
  cornerBL:  { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 4 },
  cornerBR:  { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 4 },
  scanPrompt:{ color: '#fff', fontSize: 12, fontWeight: '700', marginTop: 20, letterSpacing: 0.3 },

  previewCard: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border, padding: 16
  },
  previewHeading: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: Colors.textMuted, marginBottom: 8 },
  previewReg:  { fontSize: 26, fontWeight: '900', color: Colors.textPrimary, marginBottom: 4 },
  previewMeta: { fontSize: 13, color: Colors.textSecondary, marginBottom: 16 },

  scoreRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  scoreLabel:{ fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  scorePill: { flexDirection: 'row', alignItems: 'baseline' },
  scoreValue:{ fontSize: 24, fontWeight: '900', color: Colors.primary },
  scoreOut:  { fontSize: 12, color: Colors.textMuted, fontWeight: '700' },
  scoreBadge:{ fontSize: 12, color: Colors.textSecondary, fontWeight: '700' },

  docHeading:  { fontSize: 11, fontWeight: '800', color: Colors.textMuted, letterSpacing: 0.5, marginBottom: 8 },
  docChips:    { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 },
  noDocsText:  { fontSize: 12, color: Colors.textMuted, marginBottom: 16 },

  statsRow:  { flexDirection: 'row', gap: 12, marginBottom: 16 },
  statItem:  { flex: 1, backgroundColor: Colors.surfaceLight, borderRadius: 10, padding: 12, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '900', color: Colors.textPrimary },
  statLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: '700', marginTop: 2 },

  noteCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: Colors.warningBg, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.warningBorder, padding: 10, marginBottom: 20
  },
  noteText: { flex: 1, fontSize: 11, color: Colors.warning, fontWeight: '600', lineHeight: 17 },

  actionRow: { flexDirection: 'row', gap: 12 },
  rejectBtn: {
    flex: 1, paddingVertical: 13, borderRadius: 10, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border
  },
  rejectText: { color: Colors.textSecondary, fontWeight: '700', fontSize: 14 },
  acceptBtn:  { flex: 2, paddingVertical: 13, borderRadius: 10, alignItems: 'center', backgroundColor: Colors.primary },
  acceptText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  btnDisabled:{ opacity: 0.6 }
});
