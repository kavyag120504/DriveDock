import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Shadow } from '../theme/colors';
import { useAuthStore, UserRole } from '../store/authStore';

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

export const RoleHeader: React.FC<RoleHeaderProps> = ({ title, subtitle, onRefresh }) => {
  const { role, logout } = useAuthStore();
  const activeColor = role ? ROLE_COLORS[role] : Colors.primary;

  return (
    <View style={styles.container}>
      {/* Top bar */}
      <View style={styles.topRow}>
        <View style={styles.brandRow}>
          <Text style={styles.brandDrive}>DRIVE</Text>
          <Text style={styles.brandDock}>DOCK</Text>
        </View>
        <View style={styles.topRight}>
          {onRefresh && (
            <TouchableOpacity onPress={onRefresh} style={styles.iconBtn}>
              <Ionicons name="refresh-outline" size={18} color={Colors.textSecondary} />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
            <Ionicons name="log-out-outline" size={14} color={Colors.primary} />
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Page title row */}
      <View style={styles.titleRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.pageTitle}>{title.toUpperCase()}</Text>
          {subtitle ? <Text style={styles.pageSubtitle}>{subtitle}</Text> : null}
        </View>
        <View style={[styles.rolePill, { borderColor: activeColor, backgroundColor: activeColor + '12' }]}>
          <Text style={[styles.rolePillText, { color: activeColor }]}>{role?.toUpperCase()}</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    ...Shadow.card,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 0,
  },
  brandDrive: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 1,
    color: Colors.textPrimary,
  },
  brandDock: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 1,
    color: Colors.primary,
  },
  topRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceAlt,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceAlt,
  },
  logoutText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.divider,
    marginBottom: 10,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0.5,
    color: Colors.textPrimary,
  },
  pageSubtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
    fontWeight: '400',
  },
  rolePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1.5,
  },
  rolePillText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
});
