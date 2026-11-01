import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator, Alert, Linking } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, BorderRadius } from '../../theme/colors';
import { TwinAPI } from './api';
import { FORMS } from './paperwork/constants';
import { DateField } from './paperwork/fields';
import { BuyerDetailsModal } from './paperwork/BuyerDetailsModal';
import { SellerDetailsModal } from './paperwork/SellerDetailsModal';
import { downloadAndOpenForm, FormKind } from './paperwork/download';
import { dmyToIso, isoToDmy, partyFromServer, sellerFromServer, serverMessages, todayIso } from './paperwork/validators';

const DAY = 24 * 60 * 60 * 1000;

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

interface LoadError {
  code?: string;
  message: string;
}

/** Both people's checklist after a transfer is approved: sale date, deadlines, worksheets, and their details. */
export const TransferChecklistScreen = ({ route, navigation }: any) => {
  const { transferId } = route.params;
  const [view, setView] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<LoadError | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dateDraft, setDateDraft] = useState('');
  const [dateBusy, setDateBusy] = useState(false);
  const [downloading, setDownloading] = useState<FormKind | null>(null);

  const accept = (data: any) => {
    setView(data);
    setDateDraft(isoToDmy(data?.saleDate?.value));
  };

  const load = useCallback(async () => {
    try {
      const res = await TwinAPI.getPaperwork(transferId);
      accept(res.data.data);
      setError(null);
    } catch (err: any) {
      const body = err.response?.data;
      setError({ code: body?.code, message: body?.message ?? 'Could not load your paperwork. Check your connection.' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [transferId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const isSeller = view?.role === 'seller';

  const setStep = async (key: string, status: 'done' | 'skipped' | null) => {
    setBusyKey(key);
    try {
      const res = await TwinAPI.setChecklistStep(transferId, key, status);
      accept(res.data.data);
    } catch (err: any) {
      Alert.alert('Could not update', serverMessages(err));
    } finally {
      setBusyKey(null);
    }
  };

  const saveSaleDate = async () => {
    const iso = dmyToIso(dateDraft);
    if (!iso || iso > todayIso()) {
      Alert.alert('Check the date', 'Enter the handover date as DD/MM/YYYY. It cannot be in the future.');
      return;
    }
    setDateBusy(true);
    try {
      const res = await TwinAPI.savePaperwork(transferId, { sale: { date: iso } });
      accept(res.data.data);
    } catch (err: any) {
      Alert.alert('Could not save the date', serverMessages(err));
    } finally {
      setDateBusy(false);
    }
  };

  const confirmDate = async () => {
    setDateBusy(true);
    try {
      const res = await TwinAPI.confirmSaleDate(transferId, view.saleDate.value);
      accept(res.data.data);
    } catch (err: any) {
      if (err.response?.data?.code === 'DATE_CHANGED') {
        Alert.alert('The date changed', 'The seller changed the sale date. Check the new date and confirm again.');
        load();
      } else {
        Alert.alert('Could not confirm', serverMessages(err));
      }
    } finally {
      setDateBusy(false);
    }
  };

  const saveDetails = async (payload: Record<string, any>) => {
    setSaving(true);
    try {
      const res = await TwinAPI.savePaperwork(transferId, payload);
      accept(res.data.data);
      setEditing(false);
    } catch (err: any) {
      Alert.alert('Could not save', serverMessages(err));
    } finally {
      setSaving(false);
    }
  };

  const openForm = async (kind: FormKind) => {
    setDownloading(kind);
    try {
      await downloadAndOpenForm(transferId, kind);
    } catch (err: any) {
      Alert.alert('Could not open the worksheet', err.response?.data?.message ?? err.message ?? 'Please try again.');
    } finally {
      setDownloading(null);
    }
  };

  const deleteDetails = () => {
    Alert.alert(
      'Delete my details',
      'This removes the personal details you entered for this transfer. Your worksheets will have blanks where they were, and you can enter them again later.',
      [
        { text: 'Keep them', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await TwinAPI.deleteMyDetails(transferId);
              await load();
            } catch (err: any) {
              Alert.alert('Could not delete', serverMessages(err));
            }
          }
        }
      ]
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const header = (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={styles.back}>← Back</Text>
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Transfer paperwork</Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        {header}
        <ActivityIndicator style={{ marginTop: 40 }} size="large" color={Colors.primary} />
      </View>
    );
  }

  if (error || !view) {
    const locked = error?.code === 'PAPERWORK_UNAVAILABLE';
    return (
      <View style={styles.container}>
        {header}
        <View style={[styles.card, { margin: 16 }]}>
          <Text style={styles.cardTitle}>{locked ? 'Your saved details cannot be read' : 'Paperwork unavailable'}</Text>
          <Text style={styles.body}>{error?.message}</Text>
          {locked ? (
            <TouchableOpacity style={styles.dangerBtn} onPress={deleteDetails}>
              <Text style={styles.dangerText}>Delete my details</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.primaryBtn} onPress={load}>
              <Text style={styles.primaryText}>Try again</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  const steps: any[] = view.checklist ?? [];
  const byDue = (a: any, b: any) => (a.dueAt ? new Date(a.dueAt).getTime() : Infinity) - (b.dueAt ? new Date(b.dueAt).getTime() : Infinity);
  const open = steps.filter((s) => s.status === 'open').sort(byDue);
  const finished = steps.filter((s) => s.status !== 'open');
  const dueSoon = open.filter((s) => s.overdue || (s.dueAt && new Date(s.dueAt).getTime() - Date.now() < 7 * DAY));
  const todo = open.filter((s) => !dueSoon.includes(s));
  const other = isSeller ? 'Buyer' : 'Seller';

  const renderStep = (s: any) => (
    <View key={s.key} style={styles.step}>
      <View style={styles.stepHead}>
        <Text style={styles.stepTitle}>{s.title}</Text>
        {s.optional && s.status === 'open' ? <Text style={styles.tag}>IF NEEDED</Text> : null}
      </View>
      <Text style={styles.why}>{s.why}</Text>
      <Text style={[styles.due, s.overdue && { color: Colors.nonCompliant }, !s.dueAt && s.status === 'open' && { color: Colors.warning }]}>
        {s.status !== 'open'
          ? s.status === 'done' ? 'Done' : 'Marked not needed'
          : s.dueAt
            ? `${s.overdue ? 'Overdue, was due' : 'Due'} ${fmtDate(s.dueAt)}`
            : s.dueNote}
      </Text>
      <View style={styles.stepActions}>
        {busyKey === s.key ? (
          <ActivityIndicator size="small" color={Colors.primary} />
        ) : s.status === 'open' ? (
          <>
            <TouchableOpacity style={styles.ghostBtn} onPress={() => setStep(s.key, 'skipped')}>
              <Text style={styles.ghostText}>Not needed</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.doneBtn} onPress={() => setStep(s.key, 'done')}>
              <Text style={styles.doneText}>Mark done</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity style={styles.ghostBtn} onPress={() => setStep(s.key, null)}>
            <Text style={styles.ghostText}>Undo</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {header}
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        <View style={styles.card}>
          <Text style={styles.regNo}>{view.vehicle?.regNumber}</Text>
          <Text style={styles.body}>
            {view.vehicle?.make} {view.vehicle?.model} · you are the {isSeller ? 'seller' : 'buyer'}
          </Text>
          {view.counterparty?.fullName ? (
            <Text style={styles.meta}>
              {other}: {view.counterparty.fullName}
              {view.counterparty.mobile ? ` · ${view.counterparty.mobile}` : ''}
              {view.counterparty.city || view.counterparty.state ? ` · ${[view.counterparty.city, view.counterparty.state].filter(Boolean).join(', ')}` : ''}
            </Text>
          ) : null}
        </View>

        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            DriveDock cannot file anything for you. This list and the worksheets help you fill in the official forms yourself. Confirm each
            step with your RTO and insurer.
          </Text>
          <TouchableOpacity onPress={() => Linking.openURL(view.officialFormsUrl)}>
            <Text style={styles.link}>Get the official forms</Text>
          </TouchableOpacity>
        </View>

        {/* Sale date: nothing below gets a deadline until both of you agree on it */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sale date</Text>
          {isSeller ? (
            <>
              <DateField label="Date the vehicle was handed over" value={dateDraft} onChange={setDateDraft} />
              <TouchableOpacity style={[styles.primaryBtn, dateBusy && { opacity: 0.6 }]} onPress={saveSaleDate} disabled={dateBusy}>
                {dateBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{view.saleDate?.value ? 'Update date' : 'Save date'}</Text>}
              </TouchableOpacity>
              <Text style={styles.meta}>
                {view.saleDate?.confirmed
                  ? `Confirmed by the buyer. Changing it asks them to confirm again and resets your deadlines.`
                  : view.saleDate?.value
                    ? 'Waiting for the buyer to confirm this date.'
                    : 'Enter the date to see your deadlines.'}
              </Text>
            </>
          ) : view.saleDate?.value ? (
            <>
              <Text style={styles.body}>The seller says the vehicle was handed over on {isoToDmy(view.saleDate.value)}.</Text>
              {view.saleDate.confirmed ? (
                <Text style={[styles.meta, { color: Colors.compliant }]}>You confirmed this date.</Text>
              ) : (
                <TouchableOpacity style={[styles.primaryBtn, dateBusy && { opacity: 0.6 }]} onPress={confirmDate} disabled={dateBusy}>
                  {dateBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Yes, confirm {isoToDmy(view.saleDate.value)}</Text>}
                </TouchableOpacity>
              )}
            </>
          ) : (
            <Text style={styles.body}>Waiting for the seller to enter the sale date. You will see your deadlines once you have both agreed on it.</Text>
          )}
        </View>

        {view.ownMissing?.length > 0 ? (
          <View style={[styles.card, { borderColor: Colors.warningBorder, backgroundColor: Colors.warningBg }]}>
            <Text style={[styles.cardTitle, { color: Colors.warning }]}>Details still needed</Text>
            <Text style={styles.body}>{view.ownMissing.join(', ')}</Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => setEditing(true)}>
              <Text style={styles.primaryText}>Add my details</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {dueSoon.length > 0 ? <Text style={styles.section}>DUE SOON</Text> : null}
        {dueSoon.map(renderStep)}
        {todo.length > 0 ? <Text style={styles.section}>TO DO</Text> : null}
        {todo.map(renderStep)}
        {finished.length > 0 ? <Text style={styles.section}>DONE</Text> : null}
        {finished.map(renderStep)}

        <Text style={styles.section}>WORKSHEETS</Text>
        <View style={styles.card}>
          <Text style={styles.body}>Prefilled from what you both entered. They are not the official forms.</Text>
          {FORMS.map((f) => {
            const gaps: string[] = (f.key === 'form29' ? view.missing?.form29 : f.key === 'form30' ? view.missing?.form30 : view.missing?.insurerLetter) ?? [];
            return (
              <TouchableOpacity key={f.key} style={styles.formRow} onPress={() => openForm(f.key)} disabled={!!downloading}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formTitle}>{f.title}</Text>
                  <Text style={styles.meta}>{f.sub}{gaps.length ? ` · ${gaps.length} detail${gaps.length === 1 ? '' : 's'} missing` : ''}</Text>
                </View>
                {downloading === f.key ? <ActivityIndicator size="small" color={Colors.primary} /> : <Text style={styles.open}>Open</Text>}
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.footerRow}>
          <TouchableOpacity onPress={() => setEditing(true)}>
            <Text style={styles.link}>Edit my details</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={deleteDetails}>
            <Text style={[styles.link, { color: Colors.nonCompliant }]}>Delete my details</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.footnote}>{view.footnote}</Text>
      </ScrollView>

      {isSeller ? (
        <SellerDetailsModal visible={editing} initial={sellerFromServer(view)} submitLabel="Save details" busy={saving} onCancel={() => setEditing(false)} onSubmit={saveDetails} />
      ) : (
        <BuyerDetailsModal
          visible={editing}
          initial={partyFromServer(view.me, view.prefill)}
          initialPlan={view.shared?.insurance?.buyerPlan}
          submitLabel="Save details"
          busy={saving}
          onCancel={() => setEditing(false)}
          onSubmit={saveDetails}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { padding: 16, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  back: { color: Colors.primary, fontWeight: '700', fontSize: 14, marginBottom: 6 },
  headerTitle: { fontSize: 20, fontWeight: '900', color: Colors.textPrimary },
  content: { padding: 16, paddingBottom: 50, gap: 12 },
  card: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.border, padding: 16, gap: 10 },
  cardTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
  regNo: { fontSize: 20, fontWeight: '900', color: Colors.textPrimary },
  body: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19 },
  meta: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },
  notice: { backgroundColor: Colors.primaryLight, borderRadius: 12, padding: 14, gap: 8 },
  noticeText: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },
  link: { color: Colors.primary, fontWeight: '800', fontSize: 13 },
  section: { fontSize: 11, fontWeight: '800', color: Colors.textMuted, letterSpacing: 1, marginTop: 6 },
  step: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.border, padding: 14, gap: 6 },
  stepHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  stepTitle: { flex: 1, fontSize: 14, fontWeight: '800', color: Colors.textPrimary, lineHeight: 19 },
  tag: { fontSize: 9, fontWeight: '800', color: Colors.textSecondary, backgroundColor: Colors.surfaceAlt, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4, overflow: 'hidden' },
  why: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },
  due: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary },
  stepActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 4 },
  ghostBtn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: Colors.border },
  ghostText: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  doneBtn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8, backgroundColor: Colors.compliant },
  doneText: { fontSize: 12, fontWeight: '800', color: '#fff' },
  primaryBtn: { paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: Colors.primary },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  dangerBtn: { paddingVertical: 12, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: Colors.nonCompliant },
  dangerText: { color: Colors.nonCompliant, fontWeight: '800', fontSize: 14 },
  formRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderTopWidth: 1, borderTopColor: Colors.divider },
  formTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
  open: { color: Colors.primary, fontWeight: '800', fontSize: 13 },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4, marginTop: 4 },
  footnote: { fontSize: 11, color: Colors.textMuted, textAlign: 'center', marginTop: 6 }
});
