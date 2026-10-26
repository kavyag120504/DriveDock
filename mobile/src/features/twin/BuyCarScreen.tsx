import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, ScrollView, TextInput,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Shadow, BorderRadius } from '../../theme/colors';
import { TwinAPI } from './api';
import { getBuyerReport } from './buyerApi';

type BannerType = 'green' | 'amber' | 'red';

const bannerColors: Record<BannerType, { bg: string; border: string; text: string }> = {
  green: { bg: '#F0FDF4', border: '#BBF7D0', text: '#166534' },
  amber: { bg: Colors.warningBg, border: Colors.warningBorder, text: Colors.warning },
  red:   { bg: Colors.nonCompliantBg, border: Colors.nonCompliantBorder, text: Colors.nonCompliant },
};

const bannerIcon: Record<BannerType, string> = {
  green: 'checkmark-circle',
  amber: 'warning',
  red:   'close-circle',
};

const bannerLabel: Record<BannerType, string> = {
  green: 'All clear — no red flags on this vehicle',
  amber: 'A few concerns — review before buying',
  red:   'Significant issues found — proceed with caution',
};

function flagCount(flags: string[]): BannerType {
  if (flags.length === 0) return 'green';
  if (flags.length <= 2)  return 'amber';
  return 'red';
}

export const BuyCarScreen = ({ navigation }: any) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned]           = useState(false);
  const [isLoading, setIsLoading]       = useState(false);
  const [report, setReport]             = useState<any>(null);
  const [scannedToken, setScannedToken] = useState<string | null>(null);
  const [isAccepting, setIsAccepting]   = useState(false);
  const [pasteMode, setPasteMode]       = useState(false);
  const [pastedToken, setPastedToken]   = useState('');

  const fetchReport = async (token: string) => {
    setIsLoading(true);
    setReport(null);
    setScannedToken(null);
    try {
      const res = await getBuyerReport(token);
      setReport(res.data.data);
      setScannedToken(token);
    } catch (err: any) {
      const status  = err.response?.status;
      const message = err.response?.data?.message;
      if (status === 410) {
        Alert.alert('Link Expired', message ?? 'This QR code has expired or been revoked.');
      } else if (status === 401 || status === 403) {
        Alert.alert('Access Denied', message ?? 'You do not have permission to view this report.');
      } else {
        Alert.alert('Cannot Load Report', message ?? 'Please check your connection and try again.');
      }
    } finally {
      setIsLoading(false);
      setScanned(false);
    }
  };

  const onBarcodeScanned = ({ data }: { data: string }) => {
    if (scanned || isLoading) return;
    setScanned(true);
    fetchReport(data);
  };

  const handlePasteSubmit = () => {
    const t = pastedToken.trim();
    if (!t) return;
    setPasteMode(false);
    fetchReport(t);
  };

  const handleAcceptOwnership = async () => {
    if (!scannedToken || !report?.vehicleId) return;
    Alert.alert(
      'Accept Ownership',
      "Transfer this vehicle to your account? This cannot be undone. You'll still need to complete the RTO transfer on Parivahan.",
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
                'The vehicle is now in your account. Remember to complete the RTO transfer on Parivahan to finalise legal ownership.',
                [{
                  text: 'View Vehicle',
                  // VehicleTwin lives in the Passport tab's stack
                  onPress: () => navigation.navigate('Dashboard', { screen: 'VehicleTwin', params: { vehicleId: report.vehicleId } }),
                }]
              );
              setReport(null);
              setScannedToken(null);
            } catch (err: any) {
              const code    = err.response?.data?.code;
              const message = err.response?.data?.message ?? 'Transfer failed';
              if (code === 'ALREADY_PROCESSED') {
                Alert.alert('Already Processed', 'This transfer has already been accepted by someone else.');
              } else if (code === 'EXPIRED' || err.response?.status === 410) {
                Alert.alert('Expired', 'The transfer QR has expired. Ask the seller to generate a new one.');
              } else if (err.response?.status === 409) {
                Alert.alert('Conflict', message);
              } else {
                Alert.alert('Transfer Failed', message);
              }
            } finally {
              setIsAccepting(false);
            }
          },
        },
      ]
    );
  };

  const handleWalkAway = () => {
    setReport(null);
    setScannedToken(null);
    setScanned(false);
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Buy a Car</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {!report ? (
          /* ── CAMERA / PASTE VIEW ──────────────────────────────────────── */
          <View>
            <View style={[styles.cameraBox, Shadow.card]}>
              {!permission ? (
                <ActivityIndicator color={Colors.primary} />
              ) : !permission.granted ? (
                <View style={styles.camNotice}>
                  <Ionicons name="camera-outline" size={36} color={Colors.primary} />
                  <Text style={styles.camTitle}>Camera Access Required</Text>
                  <Text style={styles.camDesc}>
                    Enable camera permission to scan the seller's QR code
                  </Text>
                  <TouchableOpacity onPress={requestPermission} style={styles.permBtn}>
                    <Text style={styles.permBtnText}>Grant Permission</Text>
                  </TouchableOpacity>
                </View>
              ) : isLoading ? (
                <View style={styles.camNotice}>
                  <ActivityIndicator size="large" color={Colors.primary} />
                  <Text style={styles.camTitle}>Loading vehicle report…</Text>
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
                    <Text style={styles.scanPrompt}>Scan seller's transfer or share QR</Text>
                  </View>
                </CameraView>
              )}
            </View>

            {/* Paste fallback — shown only in __DEV__ */}
            {__DEV__ && (
              <View style={[styles.pasteCard, Shadow.card]}>
                {pasteMode ? (
                  <View>
                    <TextInput
                      style={styles.pasteInput}
                      placeholder="Paste token here"
                      value={pastedToken}
                      onChangeText={setPastedToken}
                      autoFocus
                      multiline
                      numberOfLines={3}
                    />
                    <View style={styles.pasteActions}>
                      <TouchableOpacity onPress={() => setPasteMode(false)} style={styles.pasteCancelBtn}>
                        <Text style={styles.pasteCancelText}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={handlePasteSubmit} style={styles.pasteSubmitBtn}>
                        <Text style={styles.pasteSubmitText}>Load Report</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity onPress={() => setPasteMode(true)} style={styles.pasteToggle}>
                    <Ionicons name="code-outline" size={14} color={Colors.textMuted} />
                    <Text style={styles.pasteToggleText}>Paste token (dev only)</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        ) : (
          /* ── REPORT VIEW ──────────────────────────────────────────────── */
          <View>
            {/* Car header */}
            <View style={[styles.carHeader, Shadow.card]}>
              <Text style={styles.carReg}>{report.car.regNumber}</Text>
              <Text style={styles.carMeta}>
                {report.car.make} {report.car.model} · {report.car.year} · {report.car.fuelType?.toUpperCase()}
              </Text>
              <View style={styles.scoreRow}>
                <Text style={styles.scoreLabel}>Twin Score</Text>
                <View style={styles.scorePill}>
                  <Text style={styles.scoreValue}>{report.twinScore}</Text>
                  <Text style={styles.scoreOut}>/100</Text>
                  <Text style={styles.scoreBadge}>  {report.twinScoreLabel}</Text>
                </View>
              </View>
            </View>

            {/* Banner */}
            {(() => {
              const type = flagCount(report.redFlags ?? []);
              const c    = bannerColors[type];
              return (
                <View style={[styles.banner, { backgroundColor: c.bg, borderColor: c.border }]}>
                  <Ionicons name={bannerIcon[type] as any} size={18} color={c.text} />
                  <Text style={[styles.bannerText, { color: c.text }]}>{bannerLabel[type]}</Text>
                </View>
              );
            })()}

            {/* Red flags */}
            {report.redFlags?.length > 0 && (
              <View style={[styles.card, Shadow.card]}>
                <Text style={styles.sectionTitle}>Issues Found</Text>
                {report.redFlags.map((flag: string, i: number) => (
                  <View key={i} style={styles.flagRow}>
                    <Ionicons name="alert-circle" size={14} color={Colors.nonCompliant} />
                    <Text style={styles.flagText}>{flag}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Documents */}
            <View style={[styles.card, Shadow.card]}>
              <Text style={styles.sectionTitle}>Documents</Text>
              {report.documents?.map((doc: any) => (
                <View key={doc.type} style={styles.docRow}>
                  <Ionicons
                    name={doc.present && doc.verified && !doc.expired ? 'checkmark-circle' : 'close-circle'}
                    size={18}
                    color={doc.present && doc.verified && !doc.expired ? Colors.compliant : Colors.nonCompliant}
                  />
                  <View style={styles.docInfo}>
                    <Text style={styles.docLabel}>{doc.label}</Text>
                    {doc.present ? (
                      <>
                        <Text style={styles.docMeta}>
                          {doc.verified
                            ? `Verified by ${doc.issuedByBusinessName ?? 'approved provider'}`
                            : 'Not verified by a provider'}
                        </Text>
                        {doc.expiryDate && (
                          <Text style={[styles.docMeta, doc.expired && { color: Colors.nonCompliant }]}>
                            {doc.expired ? 'Expired ' : 'Expires '}
                            {new Date(doc.expiryDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </Text>
                        )}
                      </>
                    ) : (
                      <Text style={styles.docMeta}>Not on record</Text>
                    )}
                  </View>
                </View>
              ))}
            </View>

            {/* Service history */}
            <View style={[styles.card, Shadow.card]}>
              <Text style={styles.sectionTitle}>Service History</Text>
              <Text style={styles.statLine}>
                {report.serviceHistory?.count ?? 0} completed service{report.serviceHistory?.count !== 1 ? 's' : ''} on record
              </Text>
              {report.serviceHistory?.recent?.length > 0 && (
                <View style={styles.historyList}>
                  {report.serviceHistory.recent.map((item: any, i: number) => (
                    <View key={i} style={styles.historyRow}>
                      <Ionicons name="build-outline" size={12} color={Colors.textMuted} />
                      <Text style={styles.historyText}>
                        {item.documentType?.toUpperCase() ?? 'SERVICE'} ·{' '}
                        {new Date(item.date).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Violations */}
            <View style={[styles.card, Shadow.card]}>
              <Text style={styles.sectionTitle}>Traffic Violations (Last 12 Months)</Text>
              <Text style={[
                styles.statLine,
                report.violationsLast12Months?.count > 0 && { color: Colors.nonCompliant },
              ]}>
                {report.violationsLast12Months?.count ?? 0} violation{report.violationsLast12Months?.count !== 1 ? 's' : ''}
              </Text>
              {report.violationsLast12Months?.documentTypes?.length > 0 && (
                <Text style={styles.docMeta}>
                  Related to: {report.violationsLast12Months.documentTypes.join(', ').toUpperCase()}
                </Text>
              )}
            </View>

            {/* Challans */}
            <View style={[styles.card, Shadow.card]}>
              <Text style={styles.sectionTitle}>Pending Fines (Challans)</Text>
              <View style={styles.challanRow}>
                <Ionicons
                  name={report.pendingChallans ? 'close-circle' : 'checkmark-circle'}
                  size={16}
                  color={report.pendingChallans ? Colors.nonCompliant : Colors.compliant}
                />
                <Text style={[styles.statLine, { marginBottom: 0 }]}>
                  {report.pendingChallans ? 'Unpaid fines on this vehicle' : 'No pending fines'}
                </Text>
              </View>
            </View>

            {/* Ownership */}
            <View style={[styles.card, Shadow.card]}>
              <Text style={styles.sectionTitle}>Ownership History</Text>
              <Text style={styles.statLine}>
                {report.ownershipCount === 1 ? '1st owner' : `${report.ownershipCount}${ownerSuffix(report.ownershipCount)} owner`}
              </Text>
              {report.previousOwners?.map((label: string, i: number) => (
                <Text key={i} style={styles.docMeta}>{label}</Text>
              ))}
            </View>

            {/* RTO note — always shown */}
            <View style={[styles.rtoNote, { borderColor: Colors.warningBorder, backgroundColor: Colors.warningBg }]}>
              <Ionicons name="information-circle-outline" size={14} color={Colors.warning} />
              <Text style={[styles.rtoText, { color: Colors.warning }]}>
                Accepting here moves the car's digital history. You must still complete the RTO transfer
                on{' '}<Text style={{ fontWeight: '800' }}>Parivahan (parivahan.gov.in)</Text>{' '}to finalise legal ownership.
              </Text>
            </View>

            {/* Action buttons */}
            {report.canAccept ? (
              <View style={styles.actionRow}>
                <TouchableOpacity onPress={handleWalkAway} style={styles.walkBtn}>
                  <Text style={styles.walkText}>Walk Away</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleAcceptOwnership}
                  style={[styles.acceptBtn, isAccepting && styles.btnDisabled]}
                  disabled={isAccepting}
                >
                  {isAccepting
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.acceptText}>Accept Ownership</Text>
                  }
                </TouchableOpacity>
              </View>
            ) : (
              <View>
                <View style={styles.shareOnlyNote}>
                  <Ionicons name="swap-horizontal-outline" size={16} color={Colors.primary} />
                  <Text style={styles.shareOnlyText}>
                    This is a read-only share link. To buy this vehicle, ask the seller to open DriveDock,
                    go to Vehicle Twin → Transfer Ownership, and share the{' '}
                    <Text style={{ fontWeight: '800' }}>transfer QR</Text> with you instead.
                  </Text>
                </View>
                <TouchableOpacity onPress={handleWalkAway} style={styles.scanAgainBtn}>
                  <Text style={styles.scanAgainText}>Scan Another QR</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
};

// Ordinal suffix helper
function ownerSuffix(n: number): string {
  if (n === 2) return 'nd';
  if (n === 3) return 'rd';
  return 'th';
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll:    { flex: 1 },
  content:   { padding: 16, paddingBottom: 40 },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14,
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn:     { padding: 6 },
  backText:    { color: Colors.primary, fontSize: 14, fontWeight: '700' },
  headerTitle: { fontSize: 17, fontWeight: '900', color: Colors.textPrimary },

  // Camera
  cameraBox: {
    width: '100%', height: 320, backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg, overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.border, marginBottom: 12,
  },
  camNotice: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  camTitle:  { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  camDesc:   { fontSize: 12, color: Colors.textSecondary, textAlign: 'center', lineHeight: 18 },
  permBtn:   { backgroundColor: Colors.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, marginTop: 4 },
  permBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },

  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
  scanFrame:  { width: 220, height: 220, borderRadius: 16, position: 'relative' },
  corner:     { position: 'absolute', width: 26, height: 26, borderColor: '#fff', borderWidth: 3 },
  cornerTL:   { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 4 },
  cornerTR:   { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 4 },
  cornerBL:   { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 4 },
  cornerBR:   { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 4 },
  scanPrompt: { color: '#fff', fontSize: 12, fontWeight: '700', marginTop: 20, letterSpacing: 0.3 },

  // Paste (dev only)
  pasteCard:        { backgroundColor: Colors.surface, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border, padding: 12 },
  pasteToggle:      { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pasteToggleText:  { fontSize: 12, color: Colors.textMuted },
  pasteInput:       { borderWidth: 1, borderColor: Colors.border, borderRadius: 8, padding: 10, fontSize: 11, fontFamily: 'monospace', color: Colors.textPrimary, minHeight: 60 },
  pasteActions:     { flexDirection: 'row', gap: 8, marginTop: 8 },
  pasteCancelBtn:   { flex: 1, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  pasteCancelText:  { fontSize: 13, color: Colors.textSecondary, fontWeight: '700' },
  pasteSubmitBtn:   { flex: 2, padding: 10, borderRadius: 8, backgroundColor: Colors.primary, alignItems: 'center' },
  pasteSubmitText:  { fontSize: 13, color: '#fff', fontWeight: '800' },

  // Car header
  carHeader: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border, padding: 16, marginBottom: 10,
  },
  carReg:     { fontSize: 26, fontWeight: '900', color: Colors.textPrimary, marginBottom: 4 },
  carMeta:    { fontSize: 13, color: Colors.textSecondary, marginBottom: 14 },
  scoreRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  scoreLabel: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  scorePill:  { flexDirection: 'row', alignItems: 'baseline' },
  scoreValue: { fontSize: 24, fontWeight: '900', color: Colors.primary },
  scoreOut:   { fontSize: 12, color: Colors.textMuted, fontWeight: '700' },
  scoreBadge: { fontSize: 12, color: Colors.textSecondary, fontWeight: '700' },

  // Banner
  banner:     {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: BorderRadius.md, borderWidth: 1, padding: 12, marginBottom: 10,
  },
  bannerText: { flex: 1, fontSize: 13, fontWeight: '700', lineHeight: 18 },

  // Card
  card: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border, padding: 14, marginBottom: 10,
  },
  sectionTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, color: Colors.textMuted, marginBottom: 10 },
  statLine:     { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },

  // Red flags
  flagRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 6 },
  flagText: { flex: 1, fontSize: 13, color: Colors.nonCompliant, lineHeight: 18 },

  // Documents
  docRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  docInfo:  { flex: 1 },
  docLabel: { fontSize: 13, fontWeight: '800', color: Colors.textPrimary },
  docMeta:  { fontSize: 11, color: Colors.textSecondary, marginTop: 1, lineHeight: 16 },

  // Service history
  historyList: { marginTop: 6 },
  historyRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  historyText: { fontSize: 12, color: Colors.textSecondary },

  // Challans
  challanRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  // Ownership
  rtoNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    borderRadius: BorderRadius.md, borderWidth: 1, padding: 12, marginBottom: 16,
  },
  rtoText: { flex: 1, fontSize: 11, lineHeight: 17 },

  // Actions
  actionRow: { flexDirection: 'row', gap: 12 },
  walkBtn:   {
    flex: 1, paddingVertical: 13, borderRadius: 10, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  walkText:   { color: Colors.textSecondary, fontWeight: '700', fontSize: 14 },
  acceptBtn:  { flex: 2, paddingVertical: 13, borderRadius: 10, alignItems: 'center', backgroundColor: Colors.primary },
  acceptText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  btnDisabled:{ opacity: 0.6 },

  shareOnlyNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: Colors.primaryLight, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border, padding: 12, marginBottom: 12,
  },
  shareOnlyText: { flex: 1, fontSize: 12, color: Colors.primary, lineHeight: 18 },
  scanAgainBtn:  {
    paddingVertical: 13, borderRadius: 10, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  scanAgainText: { color: Colors.textSecondary, fontWeight: '700', fontSize: 14 },
});
