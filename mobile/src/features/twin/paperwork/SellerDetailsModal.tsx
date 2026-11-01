import React, { useEffect, useState } from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { Colors } from '../../../theme/colors';
import { PartyDetailsForm } from './PartyDetailsForm';
import { DateField, Field, SectionTitle, YesNo } from './fields';
import { Errors, SellerForm, toSellerPayload, validateSeller } from './validators';

interface Props {
  visible: boolean;
  initial: SellerForm;
  submitLabel: string;
  /** shows a "Fill later" button when given */
  onSkip?: () => void;
  busy?: boolean;
  onCancel: () => void;
  onSubmit: (payload: Record<string, any>) => void;
}

/** SELLER: the details Form 29, Form 30 and the insurer letter need from the person selling. */
export const SellerDetailsModal: React.FC<Props> = ({ visible, initial, submitLabel, onSkip, busy, onCancel, onSubmit }) => {
  const [form, setForm] = useState<SellerForm>(initial);
  const [errors, setErrors] = useState<Errors>({});

  useEffect(() => {
    if (visible) {
      setForm(initial);
      setErrors({});
    }
  }, [visible]);

  const set = <K extends keyof SellerForm>(key: K) => (v: SellerForm[K]) => setForm((f) => ({ ...f, [key]: v }));

  const submit = () => {
    const found = validateSeller(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    onSubmit(toSellerPayload(form));
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onCancel}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <Text style={styles.title}>Sale details</Text>
          <TouchableOpacity onPress={onCancel}>
            <Text style={styles.cancel}>Cancel</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.note}>
            <Text style={styles.noteText}>
              These go into your Form 29 worksheet and the buyer's Form 30 worksheet. They are stored encrypted. The buyer sees only your name,
              mobile number and city after you approve, and you can delete your details any time after that.
            </Text>
          </View>

          <PartyDetailsForm title="About you" value={form.party} onChange={set('party')} errors={errors} errorPrefix="party." />

          <SectionTitle>Vehicle (from the RC)</SectionTitle>
          <Field label="Chassis number" value={form.chassisNo} onChangeText={(t) => set('chassisNo')(t.toUpperCase())} autoCapitalize="characters" error={errors.chassisNo} />
          <Field label="Engine number" value={form.engineNo} onChangeText={(t) => set('engineNo')(t.toUpperCase())} autoCapitalize="characters" error={errors.engineNo} />
          <Field label="Colour (optional)" value={form.colour} onChangeText={set('colour')} error={errors.colour} />
          <DateField label="Date of registration" value={form.registrationDate} onChange={set('registrationDate')} error={errors.registrationDate} />

          <SectionTitle>The sale</SectionTitle>
          <DateField
            label="Date the vehicle was handed over"
            value={form.saleDate}
            onChange={set('saleDate')}
            error={errors.saleDate}
            hint="The buyer will be asked to confirm this date. Your paperwork deadlines are counted from it."
          />
          <Field label="Odometer reading (km)" value={form.odometer} onChangeText={(t) => set('odometer')(t.replace(/\D/g, '').slice(0, 7))} keyboardType="number-pad" error={errors.odometer} />
          <Field label="Sale price in rupees (optional)" value={form.price} onChangeText={(t) => set('price')(t.replace(/[^\d.]/g, '').slice(0, 11))} keyboardType="decimal-pad" error={errors.price} />

          <SectionTitle>Loan</SectionTitle>
          <YesNo label="Is the vehicle under a loan?" value={form.hypothecated} onChange={set('hypothecated')} error={errors.hypothecated} />
          {form.hypothecated === 'yes' ? <Field label="Bank or financier" value={form.bankName} onChangeText={set('bankName')} error={errors.bankName} /> : null}

          <SectionTitle>Insurance (optional)</SectionTitle>
          <Field label="Insurer" value={form.insurerName} onChangeText={set('insurerName')} error={errors.insurerName} />
          <Field label="Policy number" value={form.policyNumber} onChangeText={(t) => set('policyNumber')(t.toUpperCase())} autoCapitalize="characters" error={errors.policyNumber} />
          <TouchableOpacity style={styles.consentRow} onPress={() => set('sellerConsent')(!form.sellerConsent)}>
            <View style={[styles.box, form.sellerConsent && styles.boxOn]}>{form.sellerConsent ? <Text style={styles.tick}>✓</Text> : null}</View>
            <Text style={styles.consentText}>I agree to the buyer asking the insurer to transfer this policy to them.</Text>
          </TouchableOpacity>
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
  consentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface },
  boxOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tick: { color: '#fff', fontWeight: '900', fontSize: 14 },
  consentText: { flex: 1, fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },
  footer: { flexDirection: 'row', gap: 10, padding: 16, backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.border },
  skipBtn: { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  skipText: { color: Colors.textSecondary, fontWeight: '800', fontSize: 14 },
  primaryBtn: { flex: 2, paddingVertical: 14, borderRadius: 10, alignItems: 'center', backgroundColor: Colors.primary },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 14 }
});
