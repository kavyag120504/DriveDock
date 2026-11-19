import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuthStore, UserRole } from '../store/authStore';
import { Colors } from '../theme/colors';
import { useResponsiveLayout } from '../theme/responsive';

interface RoleHeaderProps {
  title: string;
  subtitle?: string;
  onRefresh?: () => void;
}
const ROLE_COLORS: Record<UserRole, string> = {
  owner: Colors.owner,
  provider: Colors.provider,
  officer: Colors.officer,
  government: Colors.government,
  admin: Colors.admin,
};
const ROLE_LABELS: Record<UserRole, string> = {
  owner: 'Owner',
  provider: 'Service provider',
  officer: 'Officer',
  government: 'Government',
  admin: 'Administrator',
};

export const RoleHeader: React.FC<RoleHeaderProps> = ({ title, subtitle, onRefresh }) => {
  const { role, logout } = useAuthStore();
  const { compact, pagePadding } = useResponsiveLayout();
  const accent = role ? ROLE_COLORS[role] : Colors.primary;
  return (
    <View style={styles.header}>
      <View style={[styles.inner, { paddingHorizontal: pagePadding }, compact && styles.innerCompact]}>
        <View style={[styles.top, compact && styles.topCompact]}>
          <View style={styles.brand}>
            <View style={[styles.brandIcon, { backgroundColor: accent }]}>
              <Ionicons name="layers-outline" size={19} color="#FFFFFF" />
            </View>
            <Text maxFontSizeMultiplier={1.2} style={[styles.brandText, compact && styles.brandTextCompact]}>
              Drive<Text style={{ color: Colors.primary }}>Dock</Text>
            </Text>
          </View>
          <View style={styles.actions}>
            {onRefresh && (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Refresh screen"
                onPress={onRefresh}
                style={styles.iconButton}
              >
                <Ionicons name="refresh-outline" size={21} color={Colors.textSecondary} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Sign out"
              onPress={logout}
              style={styles.iconButton}
            >
              <Ionicons name="log-out-outline" size={21} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>
        {role && <Text style={[styles.role, { color: accent }]}>{ROLE_LABELS[role]} workspace</Text>}
        <Text accessibilityRole="header" style={[styles.title, compact && styles.titleCompact]}>
          {title}
        </Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
    </View>
  );
};
const styles = StyleSheet.create({
  header: { backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  innerCompact: { paddingBottom: 14 },
  topCompact: { marginBottom: 6 },
  brandTextCompact: { fontSize: 18 },
  titleCompact: { fontSize: 22, lineHeight: 29 },
  inner: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 22,
  },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, minWidth: 0 },
  brandIcon: { height: 32, width: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  brandText: { fontSize: 21, fontWeight: '800', letterSpacing: -0.7, color: Colors.textPrimary },
  actions: { flexDirection: 'row', gap: 4, flexShrink: 0 },
  iconButton: {
    height: 44,
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: Colors.surfaceAlt,
  },
  role: { fontSize: 12, fontWeight: '700', marginBottom: 6 },
  title: { fontSize: 27, fontWeight: '800', letterSpacing: -0.6, lineHeight: 34, color: Colors.textPrimary },
  subtitle: { fontSize: 14, lineHeight: 21, color: Colors.textSecondary, marginTop: 5 },
});
