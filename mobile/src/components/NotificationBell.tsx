import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { startNotificationSync, useNotificationStore, InboxItem } from '../store/notificationStore';
import { Colors } from '../theme/colors';
import { timeAgo } from '../utils/timeAgo';

/** Bell with an unread badge for the shared header; opens the in-app inbox (every push is also stored there). */
export const NotificationBell: React.FC = () => {
  const { items, unread, loading, error, refresh, markRead, markAllRead } = useNotificationStore();
  const [open, setOpen] = useState(false);

  useEffect(() => startNotificationSync(), []);

  const openInbox = () => { setOpen(true); void refresh(); };

  const renderItem = ({ item }: { item: InboxItem }) => (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`${item.readAt ? '' : 'Unread. '}${item.title}. ${item.body}`}
      onPress={() => void markRead(item._id)}
      style={[styles.item, !item.readAt && styles.itemUnread]}
    >
      <View style={styles.itemTop}>
        <Text style={styles.itemTitle}>{item.title}</Text>
        <Text style={styles.itemTime}>{timeAgo(item.createdAt)}</Text>
      </View>
      <Text style={styles.itemBody}>{item.body}</Text>
    </TouchableOpacity>
  );

  return (
    <>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        onPress={openInbox}
        style={styles.iconButton}
      >
        <Ionicons name="notifications-outline" size={21} color={Colors.textSecondary} />
        {unread > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
          </View>
        )}
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text accessibilityRole="header" style={styles.sheetTitle}>Notifications</Text>
            <View style={styles.sheetActions}>
              {unread > 0 && (
                <TouchableOpacity accessibilityRole="button" onPress={() => void markAllRead()}>
                  <Text style={styles.link}>Mark all read</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close notifications" onPress={() => setOpen(false)}>
                <Ionicons name="close" size={24} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>
          {loading && items.length === 0 ? (
            <ActivityIndicator style={styles.loading} color={Colors.primary} />
          ) : (
            <FlatList
              data={items}
              keyExtractor={(i) => i._id}
              renderItem={renderItem}
              refreshing={loading}
              onRefresh={() => void refresh()}
              contentContainerStyle={items.length === 0 ? styles.emptyWrap : styles.list}
              ListEmptyComponent={<Text style={styles.empty}>{error ?? 'Nothing here yet. Booking, payment, challan and transfer updates will appear here.'}</Text>}
            />
          )}
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  iconButton: { padding: 6 },
  badge: { position: 'absolute', top: 0, right: 0, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: Colors.nonCompliant, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  sheet: { flex: 1, backgroundColor: Colors.background, paddingTop: 48 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  sheetTitle: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary },
  sheetActions: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  link: { color: Colors.primary, fontWeight: '600' },
  loading: { marginTop: 40 },
  list: { padding: 16, gap: 10 },
  emptyWrap: { flexGrow: 1, justifyContent: 'center', padding: 32 },
  empty: { textAlign: 'center', color: Colors.textSecondary, lineHeight: 20 },
  item: { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border },
  itemUnread: { borderColor: Colors.primary, backgroundColor: '#EFF6FF' },
  itemTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  itemTitle: { flex: 1, fontWeight: '700', color: Colors.textPrimary },
  itemTime: { color: Colors.textSecondary, fontSize: 12 },
  itemBody: { marginTop: 4, color: Colors.textSecondary, lineHeight: 19 }
});
