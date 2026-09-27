import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';

interface StatusPillProps {
  label: string;
  type?: 'compliant' | 'nonCompliant' | 'warning' | 'primary' | 'muted';
  verified?: boolean;
}

export const StatusPill: React.FC<StatusPillProps> = ({ label, type = 'primary', verified }) => {
  let bg = Colors.primaryLight;
  let text = Colors.primary;
  let border = Colors.primary;

  if (type === 'compliant' || verified === true || label.toLowerCase() === 'green' || label.toLowerCase() === 'valid' || label.toLowerCase() === 'completed') {
    bg = Colors.compliantBg;
    text = Colors.compliant;
    border = Colors.compliant;
  } else if (type === 'nonCompliant' || verified === false || label.toLowerCase() === 'red' || label.toLowerCase() === 'expired' || label.toLowerCase() === 'unverified') {
    bg = Colors.nonCompliantBg;
    text = Colors.nonCompliant;
    border = Colors.nonCompliant;
  } else if (type === 'warning' || label.toLowerCase() === 'expiring_soon' || label.toLowerCase() === 'pending') {
    bg = Colors.warningBg;
    text = Colors.warning;
    border = Colors.warning;
  } else if (type === 'muted') {
    bg = Colors.surfaceLight;
    text = Colors.textSecondary;
    border = Colors.border;
  }

  return (
    <View style={[styles.pill, { backgroundColor: bg, borderColor: border }]}>
      <Text style={[styles.text, { color: text }]}>{label.toUpperCase()}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    alignSelf: 'flex-start'
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5
  }
});
