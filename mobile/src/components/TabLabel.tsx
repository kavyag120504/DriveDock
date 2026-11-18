import { Text, StyleSheet } from 'react-native';

/** Navigation uses short labels; page content continues to follow the full system font scale. */
export function TabLabel({ label, color }: { label: string; color: string }) {
  return (
    <Text numberOfLines={1} maxFontSizeMultiplier={1.4} style={[styles.label, { color }]}>
      {label}
    </Text>
  );
}
const styles = StyleSheet.create({ label: { fontSize: 12, fontWeight: '600', textAlign: 'center' } });
