const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { mockModules, src } = require('./helpers/tsRequire.cjs');

// The store only needs AppState from react-native, the inbox API and the push listener.
const calls = { list: 0, markRead: [] };
let inbox = [];
let failMarkRead = false;
mockModules({
  'react-native': { AppState: { addEventListener: () => ({ remove() {} }) } },
  [src('api/endpoints')]: {
    NotificationsAPI: {
      list: async () => { calls.list += 1; return { data: { data: { items: inbox.map((i) => ({ ...i })), unreadCount: inbox.filter((i) => !i.readAt).length } } }; },
      markRead: async (ids) => {
        calls.markRead.push(ids);
        if (failMarkRead) throw new Error('offline');
        return { data: { success: true } };
      }
    }
  },
  [src('utils/notifications')]: { onPushReceived: async () => () => {} }
});

const { useNotificationStore } = require(src('store/notificationStore.ts'));
const store = () => useNotificationStore.getState();

const item = (id, readAt = null) => ({ _id: id, title: `t${id}`, body: 'b', kind: 'test', createdAt: '2026-11-23T10:00:00Z', readAt });

beforeEach(() => {
  inbox = [item('a'), item('b'), item('c', '2026-11-23T11:00:00Z')];
  calls.list = 0; calls.markRead = []; failMarkRead = false;
  store().reset();
});

test('refresh loads the inbox and the unread count from the server', async () => {
  await store().refresh();
  assert.equal(store().items.length, 3);
  assert.equal(store().unread, 2);
  assert.equal(store().error, null);
  assert.equal(store().loading, false);
});

test('a failed refresh keeps what is shown and reports the error', async () => {
  await store().refresh();
  const original = require(src('api/endpoints')).NotificationsAPI.list;
  require(src('api/endpoints')).NotificationsAPI.list = async () => { throw new Error('offline'); };
  await store().refresh();
  require(src('api/endpoints')).NotificationsAPI.list = original;
  assert.equal(store().items.length, 3);
  assert.equal(store().error, 'Could not load notifications.');
});

test('marking one entry read is immediate and tells the server', async () => {
  await store().refresh();
  await store().markRead('a');
  assert.equal(store().unread, 1);
  assert.ok(store().items.find((i) => i._id === 'a').readAt);
  assert.deepEqual(calls.markRead, [['a']]);
});

test('marking an already-read or unknown entry does nothing', async () => {
  await store().refresh();
  await store().markRead('c');
  await store().markRead('nope');
  assert.equal(store().unread, 2);
  assert.deepEqual(calls.markRead, []);
});

test('mark all read clears the badge with one request, and does nothing when nothing is unread', async () => {
  await store().refresh();
  await store().markAllRead();
  assert.equal(store().unread, 0);
  assert.equal(store().items.every((i) => i.readAt), true);
  assert.equal(calls.markRead.length, 1);
  await store().markAllRead();
  assert.equal(calls.markRead.length, 1);
});

test('when the server call fails the next refresh restores the true state', async () => {
  await store().refresh();
  failMarkRead = true;
  await store().markRead('a');
  // markRead falls back to a refresh; the server still holds "a" as unread
  assert.equal(store().unread, 2);
  assert.equal(store().items.find((i) => i._id === 'a').readAt, null);
});

test('reset empties the inbox (used on logout so the next person sees nothing of the last)', async () => {
  await store().refresh();
  store().reset();
  assert.deepEqual([store().items.length, store().unread, store().error], [0, 0, null]);
});
