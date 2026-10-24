import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, ScrollView, Share, Modal
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Shadow, BorderRadius } from '../../theme/colors';
import { TwinAPI } from './api';
import { API_BASE_URL } from '../../api/client';

// Build the public URL a potential buyer would open
const buildShareUrl = (token: string) =>
  `${API_BASE_URL.replace('/api/v1', '')}/api/v1/public/twin?token=${encodeURIComponent(token)}`;

export const ShareTwinScreen = ({ route, navigation }: any) => {
  const { vehicleId } = route.params;
  const [shares, setShares]         = useState<any[]>([]);
  const [isLoading, setIsLoading]   = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [qrToken, setQrToken]       = useState<string | null>(null);
  const [qrVisible, setQrVisible]   = useState(false);

  const fetchShares = useCallback(async () => {
    try {
      const res = await TwinAPI.listShares(vehicleId);
      setShares(res.data.data ?? []);
    } catch { /* ignore */ }
    finally { setIsLoading(false); }
  }, [vehicleId]);

  useEffect(() => { fetchShares(); }, [fetchShares]);

  const handleCreate = async () => {
    setIsCreating(true);
    try {
      const res = await TwinAPI.createShare(vehicleId);
      const token = res.data.data.token;
      setQrToken(token);
      setQrVisible(true);
      await fetchShares();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message ?? 'Failed to create share link');
    } finally {
      setIsCreating(false);
    }
  };

  const handleShare = async (token: string) => {
    try {
      await Share.share({
        message: `Check out this vehicle's verified history on DriveDock:\n${buildShareUrl(token)}`,
        title: 'Vehicle Twin Share'
      });
    } catch { /* user dismissed */ }
  };

  const handleRevoke = (shareId: string) => {
    Alert.alert('Revoke Share', 'This link will stop working immediately.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Revoke',
        style: 'destructive',
        onPress: async () => {
          try {
            await TwinAPI.revokeShare(shareId);
            await fetchShares();
          } catch (err: any) {
            Alert.alert('Error', err.response?.data?.message ?? 'Failed to revoke share');
          }
        }
      }
    ]);
  };

  const activeShares = shares.filter(
    (s) => !s.revoked && new Date(s.expiresAt).getTime() > Date.now()
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Share with Buyer</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Info */}
        <View style={styles.infoCard}>
          <Ionicons name="information-circle-outline" size={16} color={Colors.primary} />
          <Text style={styles.infoText}>
            Generate a 7-day read-only link to share your vehicle's Twin Score and verified history.
            No personal information is shared. You can revoke a link at any time.
          </Text>
        </View>

        {/* Create button */}
        <TouchableOpacity
          style={[styles.createBtn, isCreating && styles.btnDisabled]}
          onPress={handleCreate}
          disabled={isCreating}
        >
          {isCreating
            ? <ActivityIndicator color="#fff" size="small" />
            : <>
                <Ionicons name="add-circle-outline" size={18} color="#fff" />
                <Text style={styles.createBtnText}>Generate New Share Link</Text>
              </>
          }
        </TouchableOpacity>

        {/* Active shares list */}
        <Text style={styles.sectionLabel}>ACTIVE SHARE LINKS ({activeShares.length})</Text>

        {isLoading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: 24 }} />
        ) : activeShares.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="link-outline" size={32} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No active share links</Text>
          </View>
        ) : (
          activeShares.map((share) => (
            <View key={share._id} style={[styles.shareCard, Shadow.card]}>
              <View style={styles.shareInfo}>
                <Text style={styles.shareExpiry}>
                  Expires {new Date(share.expiresAt).toLocaleDateString('en-IN')}
                </Text>
                <Text style={styles.shareId}>ID: {share._id?.slice(-8)}</Text>
              </View>
              <View style={styles.shareActions}>
                <TouchableOpacity
                  style={styles.iconBtn}
                  onPress={() => { setQrToken(null); setQrToken(share._id); setQrVisible(true); }}
                >
                  <Ionicons name="qr-code-outline" size={18} color={Colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.iconBtn}
                  onPress={() => handleShare('SHARE_TOKEN_PLACEHOLDER')}
                >
                  <Ionicons name="share-outline" size={18} color={Colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.iconBtn, styles.revokeBtn]}
                  onPress={() => handleRevoke(share._id)}
                >
                  <Ionicons name="close-outline" size={18} color={Colors.nonCompliant} />
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* QR Modal */}
      <Modal
        visible={qrVisible && !!qrToken}
        transparent
        animationType="fade"
        onRequestClose={() => setQrVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Share QR Code</Text>
            <Text style={styles.modalSub}>Buyer scans to see vehicle history without personal data</Text>
            <View style={styles.qrBox}>
              {qrToken && (
                <QRCode
                  value={buildShareUrl(qrToken)}
                  size={200}
                  backgroundColor="#FFFFFF"
                  color="#0B0F19"
                />
              )}
            </View>
            <TouchableOpacity onPress={() => setQrVisible(false)} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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

  infoCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: Colors.primaryLight, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.primary + '40',
    padding: 12, marginBottom: 16
  },
  infoText: { flex: 1, fontSize: 12, color: Colors.primary, fontWeight: '600', lineHeight: 18 },

  createBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: BorderRadius.md, marginBottom: 24
  },
  createBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  btnDisabled:   { opacity: 0.6 },

  sectionLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: Colors.textMuted, marginBottom: 12 },

  emptyCard: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border, padding: 32,
    alignItems: 'center', gap: 10
  },
  emptyText: { fontSize: 13, color: Colors.textMuted },

  shareCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border, padding: 14, marginBottom: 10
  },
  shareInfo:    { flex: 1 },
  shareExpiry:  { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  shareId:      { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  shareActions: { flexDirection: 'row', gap: 8 },
  iconBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.surfaceLight,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border
  },
  revokeBtn: { backgroundColor: Colors.nonCompliantBg, borderColor: Colors.nonCompliantBorder },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center', alignItems: 'center', padding: 24
  },
  modalCard: {
    width: '100%', backgroundColor: Colors.surface, borderRadius: 20,
    borderWidth: 1, borderColor: Colors.border, padding: 24, alignItems: 'center'
  },
  modalTitle: { fontSize: 17, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4 },
  modalSub:   { fontSize: 12, color: Colors.textSecondary, textAlign: 'center', marginBottom: 20 },
  qrBox: {
    width: 240, height: 240, backgroundColor: '#fff',
    borderRadius: 16, justifyContent: 'center', alignItems: 'center',
    marginBottom: 20, borderWidth: 1, borderColor: Colors.border
  },
  closeBtn:     { backgroundColor: Colors.primary, paddingHorizontal: 32, paddingVertical: 12, borderRadius: 10 },
  closeBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 }
});
