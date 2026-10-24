import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Shadow, BorderRadius } from '../../theme/colors';
import { TwinAPI } from './api';

const TRANSFER_EXPIRY_SECONDS = 10 * 60; // 10 minutes

export const TransferOwnershipScreen = ({ route, navigation }: any) => {
  const { vehicleId } = route.params;
  const [token, setToken]             = useState<string | null>(null);
  const [transferId, setTransferId]   = useState<string | null>(null);
  const [timeLeft, setTimeLeft]       = useState(TRANSFER_EXPIRY_SECONDS);
  const [isLoading, setIsLoading]     = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const createTransfer = async () => {
    setIsLoading(true);
    setError(null);
    setToken(null);
    try {
      const res = await TwinAPI.createTransfer(vehicleId);
      setToken(res.data.data.token);
      setTransferId(res.data.data.transferId);
      setTimeLeft(TRANSFER_EXPIRY_SECONDS);
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Failed to create transfer');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { createTransfer(); }, [vehicleId]);

  // Countdown timer
  useEffect(() => {
    if (!token || timeLeft <= 0) return;
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current!);
  }, [token]);

  const handleCancel = () => {
    Alert.alert(
      'Cancel Transfer',
      'Cancel this transfer request? The QR code will become invalid.',
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Cancel Transfer',
          style: 'destructive',
          onPress: async () => {
            if (transferId) {
              try { await TwinAPI.cancelTransfer(transferId); } catch { /* best-effort */ }
            }
            navigation.goBack();
          }
        }
      ]
    );
  };

  const mins = String(Math.floor(timeLeft / 60)).padStart(2, '0');
  const secs = String(timeLeft % 60).padStart(2, '0');
  const isExpired = timeLeft <= 0;
  const isWarning = timeLeft > 0 && timeLeft <= 60;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleCancel} style={styles.backBtn}>
          <Text style={styles.backText}>← Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Transfer Ownership</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.content}>
        {/* Info card */}
        <View style={styles.infoCard}>
          <Ionicons name="information-circle-outline" size={16} color={Colors.primary} />
          <Text style={styles.infoText}>
            Show this QR to the buyer. They scan it in their DriveDock app to accept the transfer.
            The code expires in 10 minutes.
          </Text>
        </View>

        {/* QR card */}
        <View style={[styles.qrCard, Shadow.elevated]}>
          {isLoading ? (
            <ActivityIndicator size="large" color={Colors.primary} />
          ) : error ? (
            <View style={styles.errorBox}>
              <Ionicons name="close-circle-outline" size={40} color={Colors.nonCompliant} />
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity onPress={createTransfer} style={styles.retryBtn}>
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : isExpired ? (
            <View style={styles.expiredBox}>
              <Ionicons name="timer-outline" size={40} color={Colors.nonCompliant} />
              <Text style={styles.expiredTitle}>QR Expired</Text>
              <Text style={styles.expiredSub}>Generate a new transfer QR to continue.</Text>
              <TouchableOpacity onPress={createTransfer} style={styles.refreshBtn}>
                <Text style={styles.refreshText}>Generate New QR</Text>
              </TouchableOpacity>
            </View>
          ) : token ? (
            <View style={styles.qrWrapper}>
              <QRCode value={token} size={200} backgroundColor="#FFFFFF" color="#0B0F19" />
            </View>
          ) : null}
        </View>

        {/* Timer */}
        {token && !isExpired && !isLoading && (
          <View style={[styles.timerCard, isWarning && styles.timerCardWarning]}>
            <Ionicons
              name="timer-outline"
              size={16}
              color={isWarning ? Colors.nonCompliant : Colors.primary}
            />
            <Text style={[styles.timerText, isWarning && styles.timerTextWarning]}>
              Expires in {mins}:{secs}
            </Text>
          </View>
        )}

        {/* Cancel button */}
        {!isLoading && (
          <TouchableOpacity onPress={handleCancel} style={styles.cancelBtn}>
            <Ionicons name="close-outline" size={16} color={Colors.textSecondary} />
            <Text style={styles.cancelBtnText}>Cancel this Transfer</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14,
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border
  },
  backBtn:     { padding: 6 },
  backText:    { color: Colors.nonCompliant, fontSize: 14, fontWeight: '700' },
  headerTitle: { fontSize: 17, fontWeight: '900', color: Colors.textPrimary },

  content: { flex: 1, padding: 16, alignItems: 'center' },

  infoCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: Colors.primaryLight, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.primary + '40',
    padding: 12, marginBottom: 24, width: '100%'
  },
  infoText: { flex: 1, fontSize: 12, color: Colors.primary, fontWeight: '600', lineHeight: 18 },

  qrCard: {
    width: 260, height: 260, backgroundColor: Colors.surface,
    borderRadius: 20, borderWidth: 1, borderColor: Colors.border,
    justifyContent: 'center', alignItems: 'center', marginBottom: 20
  },
  qrWrapper: { padding: 10 },

  errorBox:    { alignItems: 'center', gap: 12, padding: 16 },
  errorText:   { color: Colors.nonCompliant, fontSize: 13, textAlign: 'center', fontWeight: '600' },
  retryBtn:    { backgroundColor: Colors.primary, paddingHorizontal: 20, paddingVertical: 8, borderRadius: 8 },
  retryText:   { color: '#fff', fontWeight: '800', fontSize: 13 },

  expiredBox:  { alignItems: 'center', gap: 10, padding: 16 },
  expiredTitle:{ fontSize: 16, fontWeight: '800', color: Colors.nonCompliant },
  expiredSub:  { fontSize: 12, color: Colors.textMuted, textAlign: 'center' },
  refreshBtn:  { backgroundColor: Colors.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, marginTop: 4 },
  refreshText: { color: '#fff', fontWeight: '800', fontSize: 14 },

  timerCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.primaryLight, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.primary + '40',
    paddingHorizontal: 16, paddingVertical: 8, marginBottom: 16
  },
  timerCardWarning: { backgroundColor: Colors.nonCompliantBg, borderColor: Colors.nonCompliantBorder },
  timerText:        { fontSize: 15, fontWeight: '800', color: Colors.primary },
  timerTextWarning: { color: Colors.nonCompliant },

  cancelBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8,
    paddingVertical: 11, paddingHorizontal: 20, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface
  },
  cancelBtnText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '700' }
});
