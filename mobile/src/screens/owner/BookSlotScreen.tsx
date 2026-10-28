import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput
} from 'react-native';
import { Colors } from '../../theme/colors';
import { ProvidersAPI, BookingsAPI, PaymentsAPI, VehiclesAPI, DocumentsAPI } from '../../api/endpoints';

export const BookSlotScreen = ({ route, navigation }: any) => {
  const initialVehicleId = route.params?.vehicleId;
  const initialDocType = route.params?.documentType || 'puc';

  const [vehicles, setVehicles] = useState<any[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState(initialVehicleId || '');
  const [selectedDocType, setSelectedDocType] = useState(initialDocType);

  const [providers, setProviders] = useState<any[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<any>(null);
  const [slots, setSlots] = useState<any[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<any>(null);
  const [slotDateFilter, setSlotDateFilter] = useState('');

  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1); // 1: Pick Provider, 2: Pick Slot, 3: Razorpay Payment
  const [serviceFee, setServiceFee] = useState<number | null>(null);
  const [myBookings, setMyBookings] = useState<any[]>([]);

  // One active (unpaid or confirmed) booking per vehicle and document; the server enforces the same rule
  const activeBooking = myBookings.find(
    (b) =>
      (b.vehicleId?._id || b.vehicleId) === selectedVehicleId &&
      b.documentType === selectedDocType &&
      (b.status === 'pending' || b.status === 'confirmed')
  );

  // Same rule as the server: a verified, unexpired document can only be renewed within
  // RENEWAL_WINDOW_DAYS of expiry; missing, unverified or expired documents can always be booked
  const RENEWAL_WINDOW_DAYS = 30;
  const [vehicleDocs, setVehicleDocs] = useState<any[]>([]);

  useEffect(() => {
    if (!selectedVehicleId) return;
    DocumentsAPI.getByVehicle(selectedVehicleId)
      .then((res) => setVehicleDocs(res.data.data || []))
      .catch(() => setVehicleDocs([]));
  }, [selectedVehicleId]);

  const currentDoc = vehicleDocs
    .filter((d) => d.type === selectedDocType)
    .sort((a, b) => new Date(b.expiryDate).getTime() - new Date(a.expiryDate).getTime())[0];
  const renewalOpensOn = (() => {
    if (!currentDoc || !currentDoc.verified || currentDoc.status === 'expired') return null;
    const expiry = new Date(currentDoc.expiryDate).getTime();
    if (expiry < Date.now()) return null;
    const opens = expiry - RENEWAL_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    return opens > Date.now() ? new Date(opens) : null;
  })();
  const formatDate = (d: Date | string) =>
    new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  const refreshMyBookings = async () => {
    try {
      const res = await BookingsAPI.list();
      setMyBookings(res.data.data || []);
    } catch (err) {
      console.error('Error loading bookings:', err);
    }
  };

  const loadInitialData = async () => {
    try {
      const [vRes, pRes, bRes] = await Promise.all([
        VehiclesAPI.list(),
        ProvidersAPI.search({ type: selectedDocType }), // Trust Rule 3: ONLY approved providers returned
        BookingsAPI.list()
      ]);
      setMyBookings(bRes.data.data || []);
      setVehicles(vRes.data.data || []);
      if (!selectedVehicleId && vRes.data.data?.length > 0) {
        setSelectedVehicleId(vRes.data.data[0]._id);
      }
      setProviders(pRes.data.data || []);
    } catch (err) {
      console.error('Error loading providers:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, [selectedDocType]);

  const handleSelectProvider = async (provider: any) => {
    setSelectedProvider(provider);
    setIsProcessing(true);
    try {
      const res = await ProvidersAPI.getSlots(provider._id);
      setSlots(res.data.data || []);
      setStep(2);
    } catch (err) {
      Alert.alert('Error', 'Failed to load slots for this provider');
    } finally {
      setIsProcessing(false);
    }
  };

  // Creates the payment order and verifies it. TEST MODE: uses the simulated payment id the
  // server signed; real Razorpay checkout replaces this. Returns the fee in rupees.
  const payForBooking = async (bookingId: string): Promise<number> => {
    // Amount comes from the server, not the client
    const orderRes = await PaymentsAPI.createOrder({ bookingId });
    const { orderId, amount, testPaymentId, testSignatureHelper } = orderRes.data.data;
    const feeInRupees = amount / 100; // the order amount is in paise
    setServiceFee(feeInRupees);

    // Verify with the HMAC signature check (Trust Rule 6)
    await PaymentsAPI.verify({
      razorpayOrderId: orderId,
      razorpayPaymentId: testPaymentId,
      razorpaySignature: testSignatureHelper,
      bookingId
    });
    return feeInRupees;
  };

  const handleClaimSlotAndPay = async (slot: any) => {
    setSelectedSlot(slot);
    setIsProcessing(true);

    try {
      // Step A: Atomic Slot Claim (Trust Rule 5)
      const claimRes = await BookingsAPI.create({
        vehicleId: selectedVehicleId,
        providerId: selectedProvider._id,
        slotId: slot._id,
        documentType: selectedDocType
      });

      const booking = claimRes.data.data.booking;

      // Step B + C: payment order and verification
      const feeInRupees = await payForBooking(booking._id);

      Alert.alert(
        'Booking & Payment Confirmed!',
        `Service fee: ₹${feeInRupees}. Your slot with ${selectedProvider.businessName} is locked. The provider will issue your verified certificate at inspection.`,
        [{ text: 'View Dashboard', onPress: () => navigation.navigate('Dashboard') }]
      );
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Slot claim failed. Please select another slot.';
      Alert.alert('Booking Notice (Trust Rule 5)', msg);
    } finally {
      setIsProcessing(false);
      setStep(1);
      // Shows the booking just made (or the one that already existed) instead of the station list
      refreshMyBookings();
    }
  };

  const handlePayExistingBooking = async () => {
    if (!activeBooking) return;
    setIsProcessing(true);
    try {
      const feeInRupees = await payForBooking(activeBooking._id);
      Alert.alert('Payment Confirmed', `Service fee: ₹${feeInRupees}. Your booking is confirmed.`);
    } catch (err: any) {
      Alert.alert('Payment Notice', err.response?.data?.message || 'Payment could not be completed.');
    } finally {
      setIsProcessing(false);
      refreshMyBookings();
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
        <Text style={styles.backText}>← Cancel</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Book Certified Renewal</Text>
      <Text style={styles.subtitle}>
        Trust Rule 3: Only Admin-approved certified stations appear here.
      </Text>

      {/* Document Type Picker */}
      <Text style={styles.label}>Select Service / Renewal</Text>
      <View style={styles.toggleRow}>
        {(['puc', 'insurance', 'fitness', 'rc'] as const).map((dt) => (
          <TouchableOpacity
            key={dt}
            style={[styles.toggleBtn, selectedDocType === dt && styles.toggleActive]}
            onPress={() => setSelectedDocType(dt)}
          >
            <Text style={[styles.toggleText, selectedDocType === dt && styles.toggleTextActive]}>
              {dt.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Target Vehicle Picker */}
      <Text style={styles.label}>Select Vehicle</Text>
      <View style={styles.vehiclePicker}>
        {vehicles.map((v) => (
          <TouchableOpacity
            key={v._id}
            style={[styles.vChip, selectedVehicleId === v._id && styles.vChipActive]}
            onPress={() => setSelectedVehicleId(v._id)}
          >
            <Text style={[styles.vChipText, selectedVehicleId === v._id && styles.vChipTextActive]}>
              {v.regNumber} ({v.model})
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 30 }} />
      ) : activeBooking ? (
        <View style={styles.bookedCard}>
          <Text style={styles.bookedLabel}>ALREADY BOOKED</Text>
          <Text style={styles.pName}>{activeBooking.providerId?.businessName || 'Service station'}</Text>
          {activeBooking.providerId?.address ? (
            <Text style={styles.pAddress}>{activeBooking.providerId.address}</Text>
          ) : null}
          <View style={styles.bookedDetails}>
            <Text style={styles.bookedDetailText}>
              {selectedDocType.toUpperCase()} renewal
              {activeBooking.slotId ? ` · ${activeBooking.slotId.date} · ${activeBooking.slotId.startTime} - ${activeBooking.slotId.endTime}` : ''}
            </Text>
            <Text
              style={[
                styles.bookedStatus,
                { color: activeBooking.status === 'confirmed' ? Colors.compliant : Colors.warning }
              ]}
            >
              {activeBooking.status === 'confirmed'
                ? 'Confirmed and paid'
                : 'Awaiting payment (released automatically if unpaid for 30 minutes)'}
            </Text>
          </View>
          {activeBooking.status === 'pending' && (
            <TouchableOpacity style={styles.payNowBtn} onPress={handlePayExistingBooking} disabled={isProcessing}>
              {isProcessing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.payNowBtnText}>Complete Payment</Text>
              )}
            </TouchableOpacity>
          )}
          <Text style={styles.bookedNote}>
            This vehicle can't be booked for {selectedDocType.toUpperCase()} at another station until this booking is completed or cancelled.
          </Text>
        </View>
      ) : renewalOpensOn ? (
        <View style={styles.bookedCard}>
          <Text style={[styles.bookedLabel, { color: Colors.compliant }]}>NO RENEWAL NEEDED YET</Text>
          <Text style={styles.pName}>
            {selectedDocType.toUpperCase()} is verified and valid until {formatDate(currentDoc.expiryDate)}
          </Text>
          {currentDoc.issuedByProviderId?.businessName ? (
            <Text style={styles.pAddress}>Certified by {currentDoc.issuedByProviderId.businessName}</Text>
          ) : null}
          <View style={styles.bookedDetails}>
            <Text style={styles.bookedDetailText}>Renewal opens on {formatDate(renewalOpensOn)}</Text>
            <Text style={[styles.bookedStatus, { color: Colors.textSecondary }]}>
              Renewals can be booked {RENEWAL_WINDOW_DAYS} days before expiry. You'll get a reminder.
            </Text>
          </View>
        </View>
      ) : step === 1 ? (
        <View style={styles.providersList}>
          <Text style={styles.sectionHeader}>APPROVED SERVICE PROVIDERS ({providers.length})</Text>

          {providers.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No approved providers found for {selectedDocType.toUpperCase()}.</Text>
            </View>
          ) : (
            providers.map((p) => (
              <View key={p._id} style={styles.providerCard}>
                <View style={styles.pHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pName}>{p.businessName}</Text>
                    <Text style={styles.pAddress}>{p.address}</Text>
                  </View>
                  <View style={styles.ratingBadge}>
                    <Text style={styles.ratingText}>{p.rating || 4.8}</Text>
                  </View>
                </View>

                <View style={styles.pFooter}>
                  <Text style={styles.pMeta}>Hours: {p.workingHours || '9am - 7pm'}</Text>
                  <TouchableOpacity
                    style={styles.selectProvBtn}
                    onPress={() => handleSelectProvider(p)}
                    disabled={isProcessing}
                  >
                    <Text style={styles.selectProvBtnText}>Select Station →</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>
      ) : (
        <View style={styles.slotsSection}>
          <View style={styles.providerSelectedBanner}>
            <View style={{ flex: 1 }}>
              <Text style={styles.selProvName}>{selectedProvider.businessName}</Text>
              <Text style={styles.selProvSub}>Atomic Slot Claim Engine (Trust Rule 5)</Text>
            </View>
            <TouchableOpacity onPress={() => setStep(1)} style={styles.changeBtn}>
              <Text style={styles.changeBtnText}>Change</Text>
            </TouchableOpacity>
          </View>

          {/* Date filter */}
          <View style={styles.dateFilterRow}>
            <Text style={styles.label}>Filter by date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.dateFilterInput}
              value={slotDateFilter}
              onChangeText={setSlotDateFilter}
              placeholder="All dates"
              placeholderTextColor={Colors.textMuted}
              keyboardType="numbers-and-punctuation"
            />
          </View>

          {(() => {
            const available = slots.filter(
              (s) => !s.isBooked && (!slotDateFilter || s.date === slotDateFilter)
            );
            return (
              <>
          <Text style={styles.sectionHeader}>AVAILABLE TIME SLOTS ({available.length})</Text>

          {available.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>
                {slotDateFilter ? `No available slots on ${slotDateFilter}.` : 'All slots are booked for this provider.'}
              </Text>
            </View>
          ) : (
            available.map((s) => (
                <View key={s._id} style={styles.slotCard}>
                  <View>
                    <Text style={styles.slotTime}>{s.startTime} - {s.endTime}</Text>
                    <Text style={styles.slotDate}>
                      {s.date}
                      {(s.capacity ?? 1) > 1 ? `  ·  ${(s.capacity ?? 1) - (s.bookedCount ?? 0)} of ${s.capacity} bays free` : ''}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={styles.bookSlotBtn}
                    onPress={() => handleClaimSlotAndPay(s)}
                    disabled={isProcessing}
                  >
                    {isProcessing && selectedSlot?._id === s._id ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <Text style={styles.bookSlotBtnText}>Book & Pay →</Text>
                    )}
                  </TouchableOpacity>
                </View>
              ))
          )}
              </>
            );
          })()}
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background
  },
  content: {
    padding: 16,
    paddingTop: 16,
    paddingBottom: 60
  },
  backBtn: {
    marginBottom: 16
  },
  backText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '700'
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: Colors.textPrimary
  },
  subtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 4,
    marginBottom: 16
  },
  label: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textSecondary,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8
  },
  toggleActive: {
    backgroundColor: Colors.primary
  },
  toggleText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary
  },
  toggleTextActive: {
    color: '#FFFFFF'
  },
  vehiclePicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20
  },
  vChip: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border
  },
  vChipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight
  },
  vChipText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '700'
  },
  vChipTextActive: {
    color: Colors.primary
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.textMuted,
    letterSpacing: 1,
    marginBottom: 10
  },
  providersList: {
    gap: 12
  },
  providerCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14
  },
  pHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10
  },
  pName: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary
  },
  pAddress: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2
  },
  ratingBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6
  },
  ratingText: {
    color: Colors.warning,
    fontSize: 11,
    fontWeight: '800'
  },
  pFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 10
  },
  pMeta: {
    fontSize: 11,
    color: Colors.textMuted
  },
  selectProvBtn: {
    backgroundColor: Colors.primaryLight,
    borderWidth: 1,
    borderColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8
  },
  selectProvBtnText: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '800'
  },
  providerSelectedBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(29, 100, 242, 0.12)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.primary,
    padding: 12,
    marginBottom: 16
  },
  selProvName: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.textPrimary
  },
  selProvSub: {
    fontSize: 11,
    color: Colors.primary,
    marginTop: 2
  },
  changeBtn: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6
  },
  changeBtnText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '700'
  },
  slotsSection: {
    gap: 10
  },
  slotCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14
  },
  slotTime: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.textPrimary
  },
  slotDate: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2
  },
  bookSlotBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8
  },
  bookSlotBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12
  },
  emptyCard: {
    backgroundColor: Colors.surface,
    padding: 24,
    borderRadius: 12,
    alignItems: 'center'
  },
  emptyText: {
    color: Colors.textSecondary,
    fontSize: 13
  },
  dateFilterRow: {
    marginBottom: 12,
  },
  bookedCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
    padding: 16,
    marginTop: 8,
  },
  bookedLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.primary,
    letterSpacing: 1,
    marginBottom: 8,
  },
  bookedDetails: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: 4,
  },
  bookedDetailText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  bookedStatus: {
    fontSize: 12,
    fontWeight: '700',
  },
  payNowBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 14,
  },
  payNowBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  bookedNote: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 12,
  },
  dateFilterInput: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: Colors.textPrimary,
    fontSize: 13,
    marginTop: 4,
  },
});
