import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { VerificationAPI } from '../../api/endpoints';
import { RoleHeader } from '../../components/RoleHeader';
import { Button, Notice } from '../../components/UI';
import { WorkspaceScreen } from '../../components/WorkspaceScreen';
import { BorderRadius, Colors, Shadow } from '../../theme/colors';
import { useResponsiveLayout } from '../../theme/responsive';

export const ScanQRScreen = ({ navigation }: any) => {
  const { cameraHeight, scanFrameSize } = useResponsiveLayout();
  const isFocused = useIsFocused();
  const verificationLock = useRef(false);
  useEffect(() => {
    if (isFocused) verificationLock.current = false;
  }, [isFocused]);
  const [permission, requestPermission] = useCameraPermissions();
  const [manualToken, setManualToken] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  const handleVerify = async (token: string) => {
    if (!token || verificationLock.current || !isFocused) return;
    verificationLock.current = true;
    setIsVerifying(true);
    try {
      const res = await VerificationAPI.verifyToken(token);
      navigation.navigate('VehicleStatus', { result: res.data });
    } catch (err: any) {
      const data = err.response?.data;
      if (data) navigation.navigate('VehicleStatus', { result: data });
      else {
        verificationLock.current = false;
        Alert.alert('Could not verify', 'Check your connection and scan again.');
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const onBarcodeScanned = ({ data }: { data: string }) => {
    handleVerify(data);
  };

  return (
    <View style={styles.container}>
      <WorkspaceScreen
        header={
          <RoleHeader title="Verify a vehicle" subtitle="Scan the owner’s current vehicle passport QR." />
        }
      >
        <Notice title="Ask for a fresh QR">
          The owner can open Show QR Code in their vehicle passport. Each code expires after two minutes.
        </Notice>
        {/* Camera Viewport */}
        <View
          style={[
            styles.cameraBox,
            Shadow.card,
            { minHeight: cameraHeight },
            permission?.granted && { height: cameraHeight },
          ]}
        >
          {!permission ? (
            <View style={styles.camNotice}>
              <ActivityIndicator color={Colors.primary} />
              <Text style={styles.camNoticeTitle}>Loading camera...</Text>
            </View>
          ) : !permission.granted ? (
            <View style={styles.camNotice}>
              <View style={styles.camIconWrap}>
                <Ionicons name="camera-outline" size={32} color={Colors.primary} />
              </View>
              <Text style={styles.camNoticeTitle}>Camera Access Required</Text>
              <Text style={styles.camNoticeDesc}>Enable camera permission to scan vehicle QR codes</Text>
              <Button
                label={permission.canAskAgain ? 'Enable camera' : 'Open camera settings'}
                icon="camera-outline"
                color={Colors.officer}
                onPress={() => {
                  if (permission.canAskAgain) requestPermission();
                  else Linking.openSettings();
                }}
              />
            </View>
          ) : isVerifying ? (
            <View style={styles.camNotice}>
              <ActivityIndicator size="large" color={Colors.officer} />
              <Text style={styles.camNoticeTitle}>Checking vehicle passport…</Text>
            </View>
          ) : isFocused ? (
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={onBarcodeScanned}
            >
              <View style={styles.overlay}>
                <View style={[styles.scanFrame, { width: scanFrameSize, height: scanFrameSize }]}>
                  {/* Corner markers */}
                  <View style={[styles.corner, styles.cornerTL]} />
                  <View style={[styles.corner, styles.cornerTR]} />
                  <View style={[styles.corner, styles.cornerBL]} />
                  <View style={[styles.corner, styles.cornerBR]} />
                </View>
                <Text style={styles.scanPrompt}>Align vehicle QR within frame</Text>
              </View>
            </CameraView>
          ) : null}
        </View>

        {/* Manual token input - only shown in dev builds */}
        {__DEV__ && (
          <View style={[styles.testSection, Shadow.card]}>
            <View style={styles.testHeader}>
              <View style={styles.testBadge}>
                <Ionicons name="code-slash-outline" size={11} color={Colors.primary} />
                <Text style={styles.testBadgeText}>SIMULATOR MODE</Text>
              </View>
              <Text style={styles.testTitle}>Direct Token Verification</Text>
              <Text style={styles.testDesc}>
                Paste a rotating JWT token to test signature validation and 2-minute expiry:
              </Text>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Paste JWT token here..."
              placeholderTextColor={Colors.textMuted}
              value={manualToken}
              onChangeText={setManualToken}
            />

            <TouchableOpacity
              accessibilityRole="button"
              style={[styles.verifyBtn, (!manualToken || isVerifying) && styles.verifyBtnDisabled]}
              onPress={() => handleVerify(manualToken)}
              disabled={isVerifying || !manualToken}
            >
              {isVerifying ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="shield-checkmark-outline" size={16} color="#fff" />
                  <Text style={styles.verifyBtnText}>Verify Compliance</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </WorkspaceScreen>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  cameraBox: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
  },
  camNotice: { minHeight: 280, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 10 },
  camIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  camNoticeTitle: { fontSize: 18, textAlign: 'center', fontWeight: '800', color: Colors.textPrimary },
  camNoticeDesc: { fontSize: 14, lineHeight: 21, color: Colors.textSecondary, textAlign: 'center' },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
  scanFrame: {
    width: 210,
    height: 210,
    borderRadius: 16,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: '#fff',
    borderWidth: 3,
  },
  cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 4 },
  cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 4 },
  cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 4 },
  cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 4 },
  scanPrompt: { color: '#fff', fontSize: 12, fontWeight: '700', marginTop: 20, letterSpacing: 0.3 },

  testSection: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
  },
  testHeader: { marginBottom: 14 },
  testBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primaryLight,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    marginBottom: 8,
  },
  testBadgeText: { fontSize: 10, fontWeight: '800', color: Colors.primary, letterSpacing: 0.5 },
  testTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4 },
  testDesc: { fontSize: 14, color: Colors.textSecondary, lineHeight: 17 },
  input: {
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Colors.textPrimary,
    fontSize: 12,
    marginBottom: 10,
  },
  verifyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    paddingVertical: 13,
    borderRadius: BorderRadius.md,
  },
  verifyBtnDisabled: { opacity: 0.5 },
  verifyBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
