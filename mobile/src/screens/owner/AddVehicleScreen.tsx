import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert
} from 'react-native';
import { Colors } from '../../theme/colors';
import { VehiclesAPI } from '../../api/endpoints';

export const AddVehicleScreen = ({ navigation }: any) => {
  const [regNumber, setRegNumber] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('2023');
  const [fuelType, setFuelType] = useState<'petrol' | 'diesel' | 'ev'>('petrol');
  const [vehicleType, setVehicleType] = useState<'car' | 'bike' | 'other'>('car');
  const [district, setDistrict] = useState('Mumbai');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    if (!regNumber || !make || !model || !year) {
      Alert.alert('Required Fields', 'Please fill in registration number, make, model, and year');
      return;
    }

    setIsLoading(true);
    try {
      await VehiclesAPI.create({
        regNumber,
        make,
        model,
        year: Number(year),
        type: vehicleType,
        fuelType,
        region: { state: 'Maharashtra', district }
      });
      Alert.alert('Success', 'Vehicle added to your passport successfully');
      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to register vehicle');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
        <Text style={styles.backText}>← Cancel</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Register Vehicle</Text>
      <Text style={styles.subtitle}>Enrolls vehicle in the tamper-proof dynamic QR verification system</Text>

      {/* Fuel Type Selector */}
      <Text style={styles.label}>Fuel / Powertrain (EV Hook Ready)</Text>
      <View style={styles.toggleRow}>
        {(['petrol', 'diesel', 'ev'] as const).map((ft) => (
          <TouchableOpacity
            key={ft}
            style={[styles.toggleBtn, fuelType === ft && styles.toggleActive]}
            onPress={() => setFuelType(ft)}
          >
            <Text style={[styles.toggleText, fuelType === ft && styles.toggleTextActive]}>
              {ft === 'ev' ? '⚡ EV' : ft.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Vehicle Type */}
      <Text style={styles.label}>Vehicle Category</Text>
      <View style={styles.toggleRow}>
        {(['car', 'bike', 'other'] as const).map((vt) => (
          <TouchableOpacity
            key={vt}
            style={[styles.toggleBtn, vehicleType === vt && styles.toggleActive]}
            onPress={() => setVehicleType(vt)}
          >
            <Text style={[styles.toggleText, vehicleType === vt && styles.toggleTextActive]}>
              {vt.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Registration Number (Plate)</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. MH01AB1234"
          placeholderTextColor={Colors.textMuted}
          value={regNumber}
          onChangeText={(t) => setRegNumber(t.toUpperCase())}
          autoCapitalize="characters"
        />
      </View>

      <View style={styles.row}>
        <View style={[styles.inputGroup, { flex: 1 }]}>
          <Text style={styles.label}>Manufacturer (Make)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Tata / Hyundai"
            placeholderTextColor={Colors.textMuted}
            value={make}
            onChangeText={setMake}
          />
        </View>

        <View style={[styles.inputGroup, { flex: 1 }]}>
          <Text style={styles.label}>Model</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Nexon / Creta"
            placeholderTextColor={Colors.textMuted}
            value={model}
            onChangeText={setModel}
          />
        </View>
      </View>

      <View style={styles.row}>
        <View style={[styles.inputGroup, { flex: 1 }]}>
          <Text style={styles.label}>Manufacture Year</Text>
          <TextInput
            style={styles.input}
            placeholder="2023"
            placeholderTextColor={Colors.textMuted}
            value={year}
            onChangeText={setYear}
            keyboardType="numeric"
          />
        </View>

        <View style={[styles.inputGroup, { flex: 1 }]}>
          <Text style={styles.label}>RTO District</Text>
          <TextInput
            style={styles.input}
            placeholder="Mumbai"
            placeholderTextColor={Colors.textMuted}
            value={district}
            onChangeText={setDistrict}
          />
        </View>
      </View>

      <TouchableOpacity
        style={[styles.submitBtn, isLoading && styles.btnDisabled]}
        onPress={handleSubmit}
        disabled={isLoading}
      >
        {isLoading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitBtnText}>Add Vehicle to Passport</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background
  },
  content: {
    padding: 20,
    paddingTop: 48,
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
    fontSize: 26,
    fontWeight: '900',
    color: Colors.textPrimary
  },
  subtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 4,
    marginBottom: 20
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: 6,
    textTransform: 'uppercase'
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
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary
  },
  toggleTextActive: {
    color: '#FFFFFF'
  },
  row: {
    flexDirection: 'row',
    gap: 12
  },
  inputGroup: {
    marginBottom: 14
  },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Colors.textPrimary,
    fontSize: 14
  },
  submitBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16
  },
  btnDisabled: {
    opacity: 0.6
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15
  }
});
