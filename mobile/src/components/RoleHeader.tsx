import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors } from '../theme/colors';
import { useAuthStore, UserRole } from '../store/authStore';

interface RoleHeaderProps {
  title: string;
  subtitle?: string;
  onRefresh?: () => void;
}

export const RoleHeader: React.FC<RoleHeaderProps> = ({ title, subtitle, onRefresh }) => {
  const { user, role, logout, quickDemoLogin } = useAuthStore();

  const roleColors: Record<UserRole, string> = {
    owner: Colors.owner,
    provider: Colors.provider,
    officer: Colors.officer,
    government: Colors.government,
    admin: Colors.admin
  };

  const activeColor = role ? roleColors[role] : Colors.primary;

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <View style={styles.brandRow}>
          <Text style={styles.brandTitle}>DRIVEDOCK</Text>
          <View style={[styles.roleBadge, { backgroundColor: activeColor + '20', borderColor: activeColor }]}>
            <Text style={[styles.roleBadgeText, { color: activeColor }]}>{role?.toUpperCase()}</Text>
          </View>
        </View>

        <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.titleRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.pageTitle}>{title}</Text>
          {subtitle ? <Text style={styles.pageSubtitle}>{subtitle}</Text> : null}
        </View>
        {onRefresh && (
          <TouchableOpacity onPress={onRefresh} style={styles.refreshBtn}>
            <Text style={styles.refreshBtnText}>↻ Refresh</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  brandTitle: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1.5,
    color: Colors.textPrimary
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5
  },
  logoutBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: Colors.surfaceLight
  },
  logoutText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600'
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.textPrimary
  },
  pageSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2
  },
  refreshBtn: {
    backgroundColor: Colors.surfaceLight,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border
  },
  refreshBtnText: {
    color: Colors.primary,
    fontWeight: '700',
    fontSize: 12
  }
});
