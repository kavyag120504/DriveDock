import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Colors } from '../../theme/colors';
import { RoleHeader } from '../../components/RoleHeader';
import { VerificationAPI } from '../../api/endpoints';

export const ScanQRScreen = ({ navigation }: any) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [manualToken, setManualToken] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [scanned, setScanned] = useState(false);

  const handleVerify = async (token: string) => {
    if (!token) return;
    setIsVerifying(true);
    try {
      const res = await VerificationAPI.verifyToken(token);
      navigation.navigate('VehicleStatus', { result: res.data });
    } catch (err: any) {
      const data = err.response?.data;
      if (data) {
        navigation.navigate('VehicleStatus', { result: data });
      } else {
        Alert.alert('Verification Error', 'Failed to reach verification endpoint');
      }
    } finally {
      setIsVerifying(false);
      setScanned(false);
    }
  };

  const onBarcodeScanned = ({ data }: { data: string }) => {
    if (scanned || isVerifying) return;
    setScanned(true);
    handleVerify(data);
  };

  return (
    <View style={styles.container}>
      <RoleHeader
        title="Enforcement Scanner"
        subtitle="Tamper-proof compliance check (Trust Rules 2 & 4)"
      />

      <View style={styles.content}>
        {/* Camera Viewport */}
        <View style={styles.cameraBox}>
          {!permission ? (
            <View style={styles.camNotice}>
              <ActivityIndicator color={Colors.officer} />
            </View>
          ) : !permission.granted ? (
            <View style={styles.camNotice}>
              <Text style={styles.camNoticeTitle}>Camera Access Required</Text>
              <Text style={styles.camNoticeDesc}>Enable camera permission to scan vehicle QR codes</Text>
              <TouchableOpacity onPress={requestPermission} style={styles.permBtn}>
                <Text style={styles.permBtnText}>Grant Permission</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <CameraView
              style={StyleSheet.absoluteFillObject}
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: ['qr']
              }}
              onBarcodeScanned={onBarcodeScanned}
            >
              {/* Scan Overlay Frame */}
              <View style={styles.overlay}>
                <View style={styles.scanFrame} />
                <Text style={styles.scanPrompt}>Align vehicle QR within frame</Text>
              </View>
            </CameraView>
          )}
        </View>

        {/* Simulator / Test Token Input */}
        <View style={styles.testSection}>
          <Text style={styles.testSectionTitle}>SIMULATOR / DIRECT TOKEN VERIFICATION</Text>
          <Text style={styles.testSectionDesc}>
            Test rotating token signature and 2-min expiry directly:
          </Text>

          <TextInput
            style={styles.input}
            placeholder="Paste JWT token here..."
            placeholderTextColor={Colors.textMuted}
            value={manualToken}
            onChangeText={setManualToken}
          />

          <TouchableOpacity
            style={styles.verifyBtn}
            onPress={() => handleVerify(manualToken)}
            disabled={isVerifying || !manualToken}
          >
            {isVerifying ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.verifyBtnText}>Verify Compliance →</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background
  },
  content: {
    flex: 1,
    padding: 16
  },
  cameraBox: {
    width: '100%',
    height: 320,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 20
  },
  camNotice: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  camNoticeTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: 6
  },
  camNoticeDesc: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 16
  },
  permBtn: {
    backgroundColor: Colors.officer,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8
  },
  permBtnText: {
    color: '#0B0F19',
    fontWeight: '800',
    fontSize: 13
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  scanFrame: {
    width: 200,
    height: 200,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: Colors.officer,
    backgroundColor: 'rgba(6, 182, 212, 0.05)'
  },
  scanPrompt: {
    marginTop: 16,
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700'
  },
  testSection: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16
  },
  testSectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    color: Colors.officer,
    marginBottom: 4
  },
  testSectionDesc: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 12
  },
  input: {
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Colors.textPrimary,
    fontSize: 12,
    marginBottom: 10
  },
  verifyBtn: {
    backgroundColor: Colors.officer,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center'
  },
  verifyBtnText: {
    color: '#0B0F19',
    fontWeight: '900',
    fontSize: 14
  }
});
