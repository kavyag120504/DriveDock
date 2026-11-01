import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, BorderRadius } from '../../theme/colors';
import { TwinAPI } from './api';
import { SellerDetailsModal } from './paperwork/SellerDetailsModal';
import { SellerForm, sellerFromServer, serverMessages } from './paperwork/validators';

interface Props {
  transfer: { _id: string; buyerName?: string | null; requestedAt?: string | null; vehicle?: { regNumber?: string } | null };
  onDone: (result: 'approved' | 'rejected') => void;
}

/**
 * SELLER: a buyer has applied to take ownership. Approving moves the vehicle out of the
 * seller's passport into the buyer's; declining keeps it with the seller.
 */
export const TransferRequestCard: React.FC<Props> = ({ transfer, onDone }) => {
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formSaving, setFormSaving] = useState(false);
  const [formInitial, setFormInitial] = useState<SellerForm | null>(null);
  const buyer = transfer.buyerName || 'A buyer';
  const reg = transfer.vehicle?.regNumber || 'this vehicle';

  // Approving first offers the sale-details form (the RTO paperwork needs them). It never blocks approval.
  const startApprove = async () => {
    setBusy('approve');
    try {
      const res = await TwinAPI.getPaperwork(transfer._id);
      setFormInitial(sellerFromServer(res.data.data));
      setFormOpen(true);
    } catch {
      // Can't load the form (e.g. offline): go straight to the confirmation
      act('approve');
    } finally {
      setBusy(null);
    }
  };

  const saveSellerDetails = async (payload: Record<string, any>) => {
    setFormSaving(true);
    try {
      await TwinAPI.savePaperwork(transfer._id, payload);
      setFormOpen(false);
      act('approve');
    } catch (err: any) {
      Alert.alert('Could not save your details', serverMessages(err));
    } finally {
      setFormSaving(false);
    }
  };

  const act = (kind: 'approve' | 'reject') => {
    Alert.alert(
      kind === 'approve' ? 'Approve Transfer' : 'Decline Request',
      kind === 'approve'
        ? `Transfer ${reg} to ${buyer}? It will leave your Vehicle Passport and appear in theirs. This cannot be undone.`
        : `Decline ${buyer}'s request? ${reg} stays with you.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: kind === 'approve' ? 'Approve' : 'Decline',
          style: kind === 'approve' ? 'default' : 'destructive',
          onPress: async () => {
            setBusy(kind);
            try {
              if (kind === 'approve') await TwinAPI.approveTransfer(transfer._id);
              else await TwinAPI.rejectTransfer(transfer._id);
              onDone(kind === 'approve' ? 'approved' : 'rejected');
            } catch (err: any) {
              Alert.alert('Could not complete', err.response?.data?.message ?? 'Please try again.');
            } finally {
              setBusy(null);
            }
          }
        }
      ]
    );
  };

  return (
    <View style={styles.card}>
      <View style={styles.headRow}>
        <Ionicons name="person-circle-outline" size={28} color={Colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>OWNERSHIP REQUEST</Text>
          <Text style={styles.title}>{buyer} wants to take ownership of {reg}</Text>
          {transfer.requestedAt ? (
            <Text style={styles.meta}>Requested {new Date(transfer.requestedAt).toLocaleString('en-IN')}</Text>
          ) : null}
        </View>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity style={styles.rejectBtn} onPress={() => act('reject')} disabled={!!busy}>
          {busy === 'reject' ? <ActivityIndicator color={Colors.nonCompliant} size="small" /> : <Text style={styles.rejectText}>Decline</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.approveBtn} onPress={startApprove} disabled={!!busy}>
          {busy === 'approve' ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.approveText}>Approve Transfer</Text>}
        </TouchableOpacity>
      </View>
      {formInitial ? (
        <SellerDetailsModal
          visible={formOpen}
          initial={formInitial}
          submitLabel="Save and continue"
          busy={formSaving}
          onCancel={() => setFormOpen(false)}
          onSkip={() => {
            setFormOpen(false);
            act('approve');
          }}
          onSubmit={saveSellerDetails}
        />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    padding: 16,
    gap: 14
  },
  headRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  label: { fontSize: 10, fontWeight: '800', color: Colors.primary, letterSpacing: 0.8, marginBottom: 2 },
  title: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary, lineHeight: 20 },
  meta: { fontSize: 11, color: Colors.textSecondary, marginTop: 3 },
  actions: { flexDirection: 'row', gap: 10 },
  rejectBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.nonCompliant
  },
  rejectText: { color: Colors.nonCompliant, fontWeight: '800', fontSize: 14 },
  approveBtn: { flex: 2, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: Colors.compliant },
  approveText: { color: '#fff', fontWeight: '800', fontSize: 14 }
});
