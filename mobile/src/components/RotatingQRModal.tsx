import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Colors } from '../theme/colors';
import { VehiclesAPI } from '../api/endpoints';

interface RotatingQRModalProps {
  visible: boolean;
  vehicleId: string;
  regNumber: string;
  onClose: () => void;
}

export const RotatingQRModal: React.FC<RotatingQRModalProps> = ({
  visible,
  vehicleId,
  regNumber,
  onClose
}) => {
  const [token, setToken] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(120);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchToken = async () => {
    if (!vehicleId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await VehiclesAPI.getQRToken(vehicleId);
      setToken(res.data.data.token);
      setTimeLeft(res.data.data.expiresIn || 120);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to generate signed QR token');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (visible && vehicleId) {
      fetchToken();
    } else {
      setToken(null);
    }
  }, [visible, vehicleId]);

  // Countdown timer
  useEffect(() => {
    if (!visible || !token || timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [visible, token, timeLeft]);

  const isExpired = timeLeft <= 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Dynamic Vehicle Passport</Text>
              <Text style={styles.regNumber}>{regNumber}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Trust Banner */}
          <View style={styles.banner}>
            <Text style={styles.bannerIcon}>🛡️</Text>
            <Text style={styles.bannerText}>
              Tamper-Proof Time-Bound QR Token. Rotates and expires every 2 minutes. Screenshots cannot be forged.
            </Text>
          </View>

          {/* QR Display */}
          <View style={styles.qrContainer}>
            {isLoading ? (
              <ActivityIndicator size="large" color={Colors.primary} />
            ) : error ? (
              <Text style={styles.errorText}>{error}</Text>
            ) : isExpired ? (
              <View style={styles.expiredBox}>
                <Text style={styles.expiredIcon}>⚠️</Text>
                <Text style={styles.expiredTitle}>QR Token Expired</Text>
                <Text style={styles.expiredSubtitle}>
                  For traffic enforcement compliance, static copies become invalid after 120s.
                </Text>
              </View>
            ) : token ? (
              <View style={styles.qrWrapper}>
                <QRCode
                  value={token}
                  size={200}
                  backgroundColor="#FFFFFF"
                  color="#0B0F19"
                />
              </View>
            ) : null}
          </View>

          {/* Timer & Refresh */}
          <View style={styles.footer}>
            {!isExpired && token ? (
              <View style={styles.timerRow}>
                <View style={[styles.timerBadge, { backgroundColor: timeLeft < 30 ? Colors.nonCompliantBg : Colors.primaryLight }]}>
                  <Text style={[styles.timerText, { color: timeLeft < 30 ? Colors.nonCompliant : Colors.primary }]}>
                    Expires in: {timeLeft}s
                  </Text>
                </View>
                <TouchableOpacity onPress={fetchToken} style={styles.refreshIconBtn}>
                  <Text style={styles.refreshIconText}>↻ Re-sign</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={fetchToken} style={styles.regenerateBtn}>
                <Text style={styles.regenerateText}>Generate Fresh QR Token</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: Colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.borderHighlight,
    padding: 24,
    alignItems: 'center'
  },
  header: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16
  },
  title: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1
  },
  regNumber: {
    fontSize: 22,
    fontWeight: '900',
    color: Colors.textPrimary,
    marginTop: 2
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center'
  },
  closeText: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: '700'
  },
  banner: {
    width: '100%',
    flexDirection: 'row',
    backgroundColor: 'rgba(29, 100, 242, 0.1)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(29, 100, 242, 0.25)',
    padding: 10,
    gap: 8,
    marginBottom: 20
  },
  bannerIcon: {
    fontSize: 16
  },
  bannerText: {
    flex: 1,
    fontSize: 11,
    color: Colors.textSecondary,
    lineHeight: 16
  },
  qrContainer: {
    width: 240,
    height: 240,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6
  },
  qrWrapper: {
    padding: 8
  },
  expiredBox: {
    alignItems: 'center',
    padding: 16
  },
  expiredIcon: {
    fontSize: 36,
    marginBottom: 8
  },
  expiredTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.nonCompliant,
    marginBottom: 4
  },
  expiredSubtitle: {
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 16
  },
  errorText: {
    color: Colors.nonCompliant,
    fontSize: 12,
    textAlign: 'center'
  },
  footer: {
    width: '100%'
  },
  timerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  timerBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8
  },
  timerText: {
    fontSize: 13,
    fontWeight: '800'
  },
  refreshIconBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.surfaceLight
  },
  refreshIconText: {
    color: Colors.textPrimary,
    fontSize: 12,
    fontWeight: '700'
  },
  regenerateBtn: {
    width: '100%',
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center'
  },
  regenerateText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14
  }
});
