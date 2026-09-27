import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme/colors';

type PillType = 'compliant' | 'nonCompliant' | 'warning' | 'pending';

interface StatusPillProps {
  label: string;
  type: PillType;
}

const CONFIG: Record<PillType, { bg: string; border: string; text: string; icon: keyof typeof Ionicons.glyphMap }> = {
  compliant:    { bg: Colors.compliantBg,    border: Colors.compliantBorder,    text: Colors.compliant,    icon: 'checkmark-circle' },
  nonCompliant: { bg: Colors.nonCompliantBg, border: Colors.nonCompliantBorder, text: Colors.nonCompliant, icon: 'close-circle' },
  warning:      { bg: Colors.warningBg,      border: Colors.warningBorder,      text: Colors.warning,      icon: 'alert-circle' },
  pending:      { bg: '#EFF6FF',             border: '#BFDBFE',                 text: Colors.primary,      icon: 'time-outline' },
};

export const StatusPill: React.FC<StatusPillProps> = ({ label, type }) => {
  const cfg = CONFIG[type] ?? CONFIG.pending;
  return (
    <View style={[styles.pill, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
      <Ionicons name={cfg.icon} size={12} color={cfg.text} />
      <Text style={[styles.text, { color: cfg.text }]}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  text: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
