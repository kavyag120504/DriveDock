import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, FlatList, TextInputProps } from 'react-native';
import { Colors } from '../../../theme/colors';
import { INDIAN_STATES } from './constants';
import { maskDmy } from './validators';

export const Field: React.FC<TextInputProps & { label: string; error?: string; hint?: string; prefix?: string }> = ({ label, error, hint, prefix, style, ...input }) => (
  <View style={styles.group}>
    <Text style={styles.label}>{label}</Text>
    <View style={[styles.inputRow, !!error && styles.inputError]}>
      {prefix ? <Text style={styles.prefix}>{prefix}</Text> : null}
      <TextInput style={[styles.input, style]} placeholderTextColor={Colors.textMuted} {...input} />
    </View>
    {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
  </View>
);

export const Chips: React.FC<{
  label?: string;
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (v: string) => void;
  error?: string;
}> = ({ label, options, value, onChange, error }) => (
  <View style={styles.group}>
    {label ? <Text style={styles.label}>{label}</Text> : null}
    <View style={styles.chipRow}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <TouchableOpacity key={o.value} style={[styles.chip, active && styles.chipActive]} onPress={() => onChange(o.value)}>
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
    {error ? <Text style={styles.error}>{error}</Text> : null}
  </View>
);

export const YesNo: React.FC<{ label: string; value: '' | 'yes' | 'no'; onChange: (v: 'yes' | 'no') => void; error?: string }> = ({ label, value, onChange, error }) => (
  <Chips
    label={label}
    value={value}
    onChange={(v) => onChange(v as 'yes' | 'no')}
    options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]}
    error={error}
  />
);

/** DD/MM/YYYY with the slashes added as you type. */
export const DateField: React.FC<{ label: string; value: string; onChange: (v: string) => void; error?: string; hint?: string }> = ({ label, value, onChange, error, hint }) => (
  <Field
    label={label}
    value={value}
    onChangeText={(t) => onChange(maskDmy(t))}
    placeholder="DD/MM/YYYY"
    keyboardType="number-pad"
    maxLength={10}
    error={error}
    hint={hint}
  />
);

export const StateField: React.FC<{ label?: string; value: string; onChange: (v: string) => void; error?: string }> = ({ label = 'State', value, onChange, error }) => {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity style={[styles.inputRow, styles.picker, !!error && styles.inputError]} onPress={() => setOpen(true)}>
        <Text style={[styles.input, !value && { color: Colors.textMuted }]}>{value || 'Choose a state'}</Text>
        <Text style={styles.caret}>▾</Text>
      </TouchableOpacity>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>Choose a state</Text>
              <TouchableOpacity onPress={() => setOpen(false)}>
                <Text style={styles.sheetClose}>Close</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={INDIAN_STATES}
              keyExtractor={(s) => s}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.stateRow}
                  onPress={() => {
                    onChange(item);
                    setOpen(false);
                  }}
                >
                  <Text style={[styles.stateText, item === value && { color: Colors.primary, fontWeight: '800' }]}>{item}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
};

export const SectionTitle: React.FC<{ children: string }> = ({ children }) => <Text style={styles.section}>{children}</Text>;

const styles = StyleSheet.create({
  group: { marginBottom: 14 },
  label: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', marginBottom: 6 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderWidth: 1,
    borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 14
  },
  input: { flex: 1, paddingVertical: 12, color: Colors.textPrimary, fontSize: 14 },
  prefix: { color: Colors.textSecondary, fontWeight: '700', marginRight: 8, fontSize: 14 },
  inputError: { borderColor: Colors.nonCompliant },
  error: { color: Colors.nonCompliant, fontSize: 11, marginTop: 4 },
  hint: { color: Colors.textMuted, fontSize: 11, marginTop: 4 },
  picker: { justifyContent: 'space-between' },
  caret: { color: Colors.textSecondary, fontSize: 14 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  chipTextActive: { color: '#FFFFFF' },
  section: { fontSize: 13, fontWeight: '900', color: Colors.textPrimary, marginTop: 8, marginBottom: 10, letterSpacing: 0.4 },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: '75%' },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  sheetTitle: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  sheetClose: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  stateRow: { paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  stateText: { fontSize: 14, color: Colors.textPrimary }
});
