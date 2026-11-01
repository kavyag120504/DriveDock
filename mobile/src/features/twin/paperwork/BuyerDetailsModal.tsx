import React, { useEffect, useState } from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { Colors } from '../../../theme/colors';
import { PartyDetailsForm } from './PartyDetailsForm';
import { Chips, SectionTitle } from './fields';
import { INSURANCE_PLANS } from './constants';
import { Errors, PartyForm, toPartyPayload, validateParty } from './validators';

interface Props {
  visible: boolean;
  initial: PartyForm;
  initialPlan?: string;
  submitLabel: string;
  /** shows a "Fill later" button when given */
  onSkip?: () => void;
  busy?: boolean;
  onCancel: () => void;
  /** called with a validated payload for PUT /paperwork */
  onSubmit: (payload: Record<string, any>) => void;
}

/** BUYER: the details Form 30 and the insurer letter need. */
export const BuyerDetailsModal: React.FC<Props> = ({ visible, initial, initialPlan, submitLabel, onSkip, busy, onCancel, onSubmit }) => {
  const [party, setParty] = useState<PartyForm>(initial);
  const [plan, setPlan] = useState(initialPlan || '');
  const [errors, setErrors] = useState<Errors>({});

  useEffect(() => {
    if (visible) {
      setParty(initial);
      setPlan(initialPlan || '');
      setErrors({});
    }
  }, [visible]);

  const submit = () => {
    const found = validateParty(party, { requireId: true });
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const payload: Record<string, any> = { party: toPartyPayload(party) };
    if (plan) payload.insurance = { buyerPlan: plan };
    onSubmit(payload);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onCancel}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <Text style={styles.title}>Your details</Text>
          <TouchableOpacity onPress={onCancel}>
            <Text style={styles.cancel}>Cancel</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.note}>
            <Text style={styles.noteText}>
              These go into your Form 30 worksheet. They are stored encrypted. The seller sees only your name, mobile number and city
              after they approve, and you can delete your details any time after that.
            </Text>
          </View>

          <PartyDetailsForm title="About you" value={party} onChange={setParty} errors={errors} />

          <SectionTitle>Insurance</SectionTitle>
          <Chips label="What will you do about the insurance?" options={INSURANCE_PLANS} value={plan} onChange={setPlan} />
        </ScrollView>

        <View style={styles.footer}>
          {onSkip ? (
            <TouchableOpacity style={styles.skipBtn} onPress={onSkip} disabled={busy}>
              <Text style={styles.skipText}>Fill later</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={[styles.primaryBtn, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{submitLabel}</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16,
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border
  },
  title: { fontSize: 18, fontWeight: '900', color: Colors.textPrimary },
  cancel: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  content: { padding: 16, paddingBottom: 30 },
  note: { backgroundColor: Colors.primaryLight, borderRadius: 10, padding: 12, marginBottom: 16 },
  noteText: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },
  footer: { flexDirection: 'row', gap: 10, padding: 16, backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.border },
  skipBtn: { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  skipText: { color: Colors.textSecondary, fontWeight: '800', fontSize: 14 },
  primaryBtn: { flex: 2, paddingVertical: 14, borderRadius: 10, alignItems: 'center', backgroundColor: Colors.primary },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 14 }
});
