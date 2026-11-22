import { AppState } from 'react-native';
import { create } from 'zustand';
import { NotificationsAPI } from '../api/endpoints';
import { onPushReceived } from '../utils/notifications';

export interface InboxItem {
  _id: string;
  title: string;
  body: string;
  kind: string;
  createdAt: string;
  readAt: string | null;
}

interface NotificationState {
  items: InboxItem[];
  unread: number;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  reset: () => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  items: [],
  unread: 0,
  loading: false,
  error: null,

  refresh: async () => {
    set({ loading: true });
    try {
      const res = await NotificationsAPI.list();
      set({ items: res.data.data.items, unread: res.data.data.unreadCount, error: null, loading: false });
    } catch {
      set({ error: 'Could not load notifications.', loading: false });
    }
  },

  // Optimistic: the entry reads as read at once; the next refresh corrects it if the request failed.
  markRead: async (id) => {
    const target = get().items.find((i) => i._id === id);
    if (!target || target.readAt) return;
    set({
      items: get().items.map((i) => (i._id === id ? { ...i, readAt: new Date().toISOString() } : i)),
      unread: Math.max(0, get().unread - 1)
    });
    try { await NotificationsAPI.markRead([id]); } catch { await get().refresh(); }
  },

  markAllRead: async () => {
    if (get().unread === 0) return;
    const now = new Date().toISOString();
    set({ items: get().items.map((i) => ({ ...i, readAt: i.readAt ?? now })), unread: 0 });
    try { await NotificationsAPI.markRead(); } catch { await get().refresh(); }
  },

  reset: () => set({ items: [], unread: 0, loading: false, error: null })
}));

// One shared sync for every screen header: every minute, when the app returns to the foreground, and when a push arrives.
let watchers = 0;
let stop: (() => void) | null = null;

export const startNotificationSync = (): (() => void) => {
  watchers += 1;
  if (watchers === 1) {
    const refresh = () => { void useNotificationStore.getState().refresh(); };
    refresh();
    const timer = setInterval(refresh, 60_000);
    const appState = AppState.addEventListener('change', (state) => { if (state === 'active') refresh(); });
    let offPush: () => void = () => {};
    let cancelled = false;
    void onPushReceived(refresh).then((off) => { if (cancelled) off(); else offPush = off; });
    stop = () => { cancelled = true; clearInterval(timer); appState.remove(); offPush(); };
  }
  return () => {
    watchers = Math.max(0, watchers - 1);
    if (watchers === 0 && stop) { stop(); stop = null; }
  };
};
