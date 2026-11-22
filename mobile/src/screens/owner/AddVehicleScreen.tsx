import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { VehiclesAPI } from '../../api/endpoints';
import { Button, Field, FormScreen, Notice, PageHeading } from '../../components/UI';
import { checkRegNumber, normalizeRegNumber } from '../../utils/regNumber';
import { imageFilePart } from '../../utils/imageUpload';
import { Colors } from '../../theme/colors';
import { useResponsiveLayout } from '../../theme/responsive';

export const AddVehicleScreen = ({ navigation }: any) => {
  const { stackFields, choiceMinWidth } = useResponsiveLayout();
  const [regNumber, setRegNumber] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('2023');
  const [fuelType, setFuelType] = useState<'petrol' | 'diesel' | 'ev'>('petrol');
  const [vehicleType, setVehicleType] = useState<'car' | 'bike' | 'other'>('car');
  const [district, setDistrict] = useState('Mumbai');
  const [isLoading, setIsLoading] = useState(false);

  // RC scan: suggestions only. Fields filled from the RC are marked until the owner edits them.
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{ found: number; warning: string | null } | null>(null);
  const [fromRc, setFromRc] = useState<Set<string>>(new Set());
  // The photo that was scanned. Only used if the owner chooses to check the RC after saving; it is not uploaded otherwise.
  const [rcPhoto, setRcPhoto] = useState<{ uri: string; name: string; type: string } | null>(null);
  const edited = (field: string) =>
    setFromRc((prev) => {
      if (!prev.has(field)) return prev;
      const next = new Set(prev);
      next.delete(field);
      return next;
    });
  const rcHint = (field: string) => (fromRc.has(field) ? 'From your RC: please check' : undefined);

  // Live registration-number feedback while typing (same rule the server enforces)
  const regCheck = checkRegNumber(regNumber);
  const regError = regCheck.state === 'invalid' ? regCheck.message : undefined;
  const regHint =
    regCheck.state === 'valid'
      ? fromRc.has('regNumber') ? 'Valid format. From your RC: please check' : 'Valid format'
      : regCheck.state === 'incomplete' ? regCheck.message : 'State code + RTO number + series + 4 digits';
  const canSubmit = regCheck.state === 'valid' && !!make.trim() && !!model.trim() && !!year && !isScanning;

  const scanRc = async (asset: ImagePicker.ImagePickerAsset) => {
    const part = imageFilePart(asset, 'rc');
    setIsScanning(true);
    setScanResult(null);
    try {
      const formData = new FormData();
      // @ts-ignore React Native file part
      formData.append('file', part);
      const res = await VehiclesAPI.scanRc(formData);
      const d = res.data?.data ?? {};
      const filled = new Set<string>();
      if (d.regNumber) { setRegNumber(d.regNumber); filled.add('regNumber'); }
      if (d.make) { setMake(d.make); filled.add('make'); }
      if (d.model) { setModel(d.model); filled.add('model'); }
      if (d.year) { setYear(String(d.year)); filled.add('year'); }
      if (d.fuelType) { setFuelType(d.fuelType); filled.add('fuelType'); }
      if (d.vehicleType) { setVehicleType(d.vehicleType); filled.add('vehicleType'); }
      setFromRc(filled);
      setRcPhoto(part);
      setScanResult({ found: filled.size, warning: d.warning ?? null });
    } catch (err: any) {
      setScanResult({ found: 0, warning: err.response?.data?.message || 'Couldn\'t reach the server to read the RC. Enter the details manually.' });
    } finally {
      setIsScanning(false);
    }
  };

  const takeRcPhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Camera access needed', 'Allow camera access to photograph your RC, or choose a photo instead.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!result.canceled && result.assets[0]) await scanRc(result.assets[0]);
  };

  const chooseRcPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (!result.canceled && result.assets[0]) await scanRc(result.assets[0]);
  };

  const handleSubmit = async () => {
    if (!regNumber || !make || !model || !year) {
      Alert.alert('Required Fields', 'Please fill in registration number, make, model, and year');
      return;
    }

    const cleanedReg = normalizeRegNumber(regNumber);
    if (regCheck.state !== 'valid') {
      Alert.alert('Check the registration number', regError || regHint);
      return;
    }

    const yearNum = Number(year);
    if (isNaN(yearNum) || yearNum < 1980 || yearNum > new Date().getFullYear()) {
      Alert.alert('Invalid Year', `Year must be between 1980 and ${new Date().getFullYear()}`);
      return;
    }

    setIsLoading(true);
    try {
      const created = await VehiclesAPI.create({
        regNumber: cleanedReg,
        make,
        model,
        year: Number(year),
        type: vehicleType,
        fuelType,
        region: { state: 'Maharashtra', district },
      });
      const vehicleId: string | undefined = created.data?.data?._id;
      // Offer the registry check only after a scan, and only when this server can actually run one.
      let checkLabel: string | null = null;
      if (rcPhoto && vehicleId) {
        try {
          const status = await VehiclesAPI.getRcVerification(vehicleId);
          if (status.data?.data?.enabled) checkLabel = status.data.data.providerLabel ?? 'the RC registry';
        } catch { /* no offer if the status cannot be read */ }
      }
      if (rcPhoto && vehicleId && checkLabel) {
        Alert.alert(
          'Vehicle added',
          `Check this RC with ${checkLabel} now? Your RC photo is saved as an unverified document first, you confirm its dates, and you are asked for consent before anything is sent. It may use one verification credit.`,
          [
            { text: 'Not now', style: 'cancel', onPress: () => navigation.goBack() },
            {
              text: 'Check RC',
              onPress: () =>
                navigation.navigate('Dashboard', {
                  screen: 'VehicleDetail',
                  params: { vehicleId, rcPhoto, checkRcAfterUpload: true }
                })
            }
          ]
        );
      } else {
        Alert.alert('Success', 'Vehicle added to your passport successfully');
        navigation.goBack();
      }
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to register vehicle');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <FormScreen>
      <PageHeading
        title="Add a vehicle"
        subtitle="Start your vehicle passport with its registration details."
        onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
      />

      {/* Buying a used car: scan the seller's transfer QR, read its verified history, accept ownership */}
      <View style={styles.buyCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.buyTitle}>Buying a used car?</Text>
          <Text style={styles.buySub}>
            Scan the seller's transfer QR to review its history and request ownership.
          </Text>
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          style={styles.buyBtn}
          onPress={() => navigation.navigate('AddVehicleTab', { screen: 'BuyCar' })}
        >
          <Text style={styles.buyBtnText}>Scan QR</Text>
        </TouchableOpacity>
      </View>

      {/* Auto-fill from a photo of the RC */}
      <View style={styles.scanCard}>
        <View style={styles.scanHead}>
          <Ionicons name="scan-outline" size={22} color={Colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.scanTitle}>Auto-fill from your RC</Text>
            <Text style={styles.scanSub}>
              Photograph your registration certificate and we'll fill in the number, make, model, year and fuel.
              The photo isn't stored.
            </Text>
          </View>
        </View>
        {isScanning ? (
          <View style={styles.scanning}>
            <ActivityIndicator color={Colors.primary} />
            <Text style={styles.scanSub}>Reading your RC…</Text>
          </View>
        ) : (
          <View style={[styles.row, stackFields && { flexDirection: 'column', alignItems: 'stretch' }]}>
            <Button label="Take photo" icon="camera-outline" onPress={takeRcPhoto} style={{ flex: stackFields ? 0 : 1 }} />
            <Button label="Choose photo" icon="images-outline" variant="secondary" onPress={chooseRcPhoto} style={{ flex: stackFields ? 0 : 1 }} />
          </View>
        )}
      </View>
      {scanResult ? (
        scanResult.found > 0 ? (
          <Notice title={`Filled ${scanResult.found} detail${scanResult.found === 1 ? '' : 's'} from your RC`}>
            Check each one against your RC before saving. Anything it couldn't read is left for you to fill in.
          </Notice>
        ) : (
          <Notice title="Couldn't read the RC" tone="warning">
            {scanResult.warning || 'Try a sharper photo in good light, or enter the details manually.'}
          </Notice>
        )
      ) : null}

      {/* Fuel Type Selector */}
      <Text style={styles.label}>Fuel type</Text>
      <View style={[styles.toggleRow, { flexWrap: 'wrap' }]}>
        {(['petrol', 'diesel', 'ev'] as const).map((ft) => (
          <TouchableOpacity
            accessibilityRole="button"
            key={ft}
            style={[
              styles.toggleBtn,
              { minWidth: choiceMinWidth, minHeight: 44 },
              fuelType === ft && styles.toggleActive,
            ]}
            onPress={() => { setFuelType(ft); edited('fuelType'); }}
          >
            <Text style={[styles.toggleText, fuelType === ft && styles.toggleTextActive]}>
              {ft.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Vehicle Type */}
      <Text style={styles.label}>Vehicle Category</Text>
      <View style={[styles.toggleRow, { flexWrap: 'wrap' }]}>
        {(['car', 'bike', 'other'] as const).map((vt) => (
          <TouchableOpacity
            accessibilityRole="button"
            key={vt}
            style={[
              styles.toggleBtn,
              { minWidth: choiceMinWidth, minHeight: 44 },
              vehicleType === vt && styles.toggleActive,
            ]}
            onPress={() => { setVehicleType(vt); edited('vehicleType'); }}
          >
            <Text style={[styles.toggleText, vehicleType === vt && styles.toggleTextActive]}>
              {vt.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.inputGroup}>
        <Field
          label="Registration Number (Plate)"
          placeholder="e.g. MH01AB1234"
          placeholderTextColor={Colors.textMuted}
          value={regNumber}
          onChangeText={(t) => { setRegNumber(t.toUpperCase()); edited('regNumber'); }}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={14}
          error={regError}
          hint={regHint}
        />
      </View>

      <View style={[styles.row, stackFields && { flexDirection: 'column', alignItems: 'stretch' }]}>
        <View style={[styles.inputGroup, { flex: stackFields ? 0 : 1 }]}>
          <Field
            label="Manufacturer (Make)"
            placeholder="e.g. Tata / Hyundai"
            placeholderTextColor={Colors.textMuted}
            value={make}
            onChangeText={(t) => { setMake(t); edited('make'); }}
            hint={rcHint('make')}
          />
        </View>

        <View style={[styles.inputGroup, { flex: stackFields ? 0 : 1 }]}>
          <Field
            label="Model"
            placeholder="e.g. Nexon / Creta"
            placeholderTextColor={Colors.textMuted}
            value={model}
            onChangeText={(t) => { setModel(t); edited('model'); }}
            hint={rcHint('model')}
          />
        </View>
      </View>

      <View style={[styles.row, stackFields && { flexDirection: 'column', alignItems: 'stretch' }]}>
        <View style={[styles.inputGroup, { flex: stackFields ? 0 : 1 }]}>
          <Field
            label="Manufacture Year"
            placeholder="2023"
            placeholderTextColor={Colors.textMuted}
            value={year}
            onChangeText={(t) => { setYear(t); edited('year'); }}
            hint={rcHint('year')}
            keyboardType="numeric"
          />
        </View>

        <View style={[styles.inputGroup, { flex: stackFields ? 0 : 1 }]}>
          <Field
            label="RTO District"
            placeholder="Mumbai"
            placeholderTextColor={Colors.textMuted}
            value={district}
            onChangeText={setDistrict}
          />
        </View>
      </View>

      <TouchableOpacity
        accessibilityRole="button"
        style={[styles.submitBtn, (isLoading || !canSubmit) && styles.btnDisabled]}
        onPress={handleSubmit}
        disabled={isLoading || !canSubmit}
        accessibilityState={{ disabled: isLoading || !canSubmit }}
      >
        {isLoading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.submitBtnText}>Add Vehicle to Passport</Text>
        )}
      </TouchableOpacity>
    </FormScreen>
  );
};

const styles = StyleSheet.create({
  buyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 4,
    borderLeftColor: Colors.compliant,
    borderRadius: 14,
    padding: 14,
    marginBottom: 24,
  },
  buyTitle: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  buySub: { fontSize: 12, color: Colors.textSecondary, marginTop: 3, lineHeight: 16 },
  buyBtn: { backgroundColor: Colors.compliant, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  buyBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  scanCard: {
    backgroundColor: Colors.primaryLight,
    borderRadius: 14,
    padding: 14,
    gap: 12,
    marginBottom: 16,
  },
  scanHead: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  scanTitle: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  scanSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 3, lineHeight: 17 },
  scanning: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  toggleActive: {
    backgroundColor: Colors.primary,
  },
  toggleText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  toggleTextActive: {
    color: '#FFFFFF',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  inputGroup: {
    marginBottom: 14,
  },
  submitBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
});
