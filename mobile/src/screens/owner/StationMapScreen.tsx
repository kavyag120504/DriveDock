import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, ScrollView, TextInput, Alert, Platform
} from 'react-native';
import MapView, { Marker, Circle, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Shadow, BorderRadius } from '../../theme/colors';
import { RoleHeader } from '../../components/RoleHeader';
import { StationsAPI } from '../../api/endpoints';

const SERVICE_FILTERS = [
  { key: 'all',       label: 'All Stations',  icon: 'grid-outline'          },
  { key: 'puc',       label: 'PUC',           icon: 'leaf-outline'          },
  { key: 'fitness',   label: 'Fitness',       icon: 'fitness-outline'       },
  { key: 'insurance', label: 'Insurance',     icon: 'shield-outline'        },
];

export const StationMapScreen = ({ navigation }: any) => {
  const mapRef = useRef<MapView>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [stations, setStations] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [locError, setLocError] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [radius, setRadius] = useState(10); // km
  const [selectedStation, setSelectedStation] = useState<any | null>(null);

  // -- Get real GPS location --------------------------------------------------
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocError('Location permission denied. Using Mumbai default.');
        // Default: Mumbai city centre
        setLocation({ lat: 19.0760, lng: 72.8777 });
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    })();
  }, []);

  // -- Fetch stations whenever location or filter changes --------------------
  useEffect(() => {
    if (!location) return;
    fetchStations();
  }, [location, activeFilter, radius]);

  const fetchStations = async () => {
    if (!location) return;
    setIsLoading(true);
    try {
      const res = await StationsAPI.nearby({
        lat: location.lat,
        lng: location.lng,
        radius,
        type: activeFilter === 'all' ? undefined : activeFilter
      });
      setStations(res.data.data || []);
    } catch (err) {
      console.error('Station fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleMarkerPress = (station: any) => {
    setSelectedStation(station);
    mapRef.current?.animateToRegion({
      latitude: station.location.coordinates[1],
      longitude: station.location.coordinates[0],
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    }, 400);
  };

  const getServiceIcon = (types: string[]): keyof typeof Ionicons.glyphMap => {
    if (types.includes('puc'))       return 'leaf';
    if (types.includes('fitness'))   return 'fitness';
    if (types.includes('insurance')) return 'shield-checkmark';
    return 'business';
  };

  const initialRegion = location ? {
    latitude: location.lat,
    longitude: location.lng,
    latitudeDelta: 0.12,
    longitudeDelta: 0.12,
  } : undefined;

  return (
    <View style={styles.container}>
      <RoleHeader
        title="Find Stations"
        subtitle="Approved PUC, Fitness & Insurance centres near you"
      />

      {/* Service type filter tabs */}
      <View style={styles.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {SERVICE_FILTERS.map(f => (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterPill, activeFilter === f.key && styles.filterPillActive]}
              onPress={() => { setActiveFilter(f.key); setSelectedStation(null); }}
            >
              <Ionicons
                name={f.icon as any}
                size={13}
                color={activeFilter === f.key ? '#fff' : Colors.textSecondary}
              />
              <Text style={[styles.filterText, activeFilter === f.key && styles.filterTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}

          {/* Radius selector */}
          <View style={styles.radiusPill}>
            <Ionicons name="radio-outline" size={13} color={Colors.primary} />
            <TouchableOpacity onPress={() => setRadius(r => Math.max(5, r - 5))}>
              <Text style={styles.radiusBtn}>-</Text>
            </TouchableOpacity>
            <Text style={styles.radiusVal}>{radius} km</Text>
            <TouchableOpacity onPress={() => setRadius(r => Math.min(50, r + 5))}>
              <Text style={styles.radiusBtn}>+</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>

      {/* Map */}
      <View style={styles.mapContainer}>
        {locError ? (
          <View style={styles.locErrorBanner}>
            <Ionicons name="warning-outline" size={14} color={Colors.warning} />
            <Text style={styles.locErrorText}>{locError}</Text>
          </View>
        ) : null}

        {initialRegion ? (
          <MapView
            ref={mapRef}
            style={StyleSheet.absoluteFillObject}
            provider={Platform.OS === 'web' ? undefined : PROVIDER_GOOGLE}
            initialRegion={initialRegion}
            showsUserLocation
            showsMyLocationButton={false}
          >
            {/* Radius circle */}
            {location && (
              <Circle
                center={{ latitude: location.lat, longitude: location.lng }}
                radius={radius * 1000}
                fillColor="rgba(23, 85, 232, 0.06)"
                strokeColor="rgba(23, 85, 232, 0.3)"
                strokeWidth={1}
              />
            )}

            {/* Station markers */}
            {stations.map(station => (
              <Marker
                key={station._id}
                coordinate={{
                  latitude: station.location.coordinates[1],
                  longitude: station.location.coordinates[0],
                }}
                onPress={() => handleMarkerPress(station)}
                pinColor={selectedStation?._id === station._id ? Colors.primary : Colors.officer}
                title={station.businessName}
                description={`${station.distanceKm ?? '?'} km · ? ${station.rating}`}
              />
            ))}
          </MapView>
        ) : (
          <View style={styles.mapLoading}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.mapLoadingText}>Getting your location...</Text>
          </View>
        )}

        {/* Locate me button */}
        {location && (
          <TouchableOpacity
            style={styles.locateBtn}
            onPress={() => mapRef.current?.animateToRegion({
              latitude: location.lat, longitude: location.lng,
              latitudeDelta: 0.06, longitudeDelta: 0.06
            }, 600)}
          >
            <Ionicons name="locate" size={20} color={Colors.primary} />
          </TouchableOpacity>
        )}

        {/* Station count badge */}
        {!isLoading && (
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{stations.length} stations found</Text>
          </View>
        )}
      </View>

      {/* Bottom sheet: selected station or list */}
      <View style={styles.bottomSheet}>
        {isLoading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={Colors.primary} size="small" />
            <Text style={styles.loadingText}>Searching nearby stations...</Text>
          </View>
        ) : selectedStation ? (
          /* Station detail mini-card */
          <View style={styles.stationCard}>
            <View style={styles.stationCardTop}>
              <View style={styles.stationIconWrap}>
                <Ionicons name={getServiceIcon(selectedStation.serviceTypes)} size={22} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.stationName}>{selectedStation.businessName}</Text>
                <Text style={styles.stationAddress} numberOfLines={1}>{selectedStation.address}</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedStation(null)}>
                <Ionicons name="close" size={20} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={styles.stationMeta}>
              <View style={styles.metaItem}>
                <Ionicons name="location-outline" size={13} color={Colors.textMuted} />
                <Text style={styles.metaText}>{selectedStation.distanceKm ?? '?'} km away</Text>
              </View>
              <View style={styles.metaItem}>
                <Ionicons name="star" size={13} color="#F59E0B" />
                <Text style={styles.metaText}>{selectedStation.rating ?? '4.8'}</Text>
              </View>
              <View style={styles.metaItem}>
                <Ionicons name="time-outline" size={13} color={Colors.textMuted} />
                <Text style={styles.metaText}>{selectedStation.workingHours ?? '9AM - 7PM'}</Text>
              </View>
            </View>

            <View style={styles.serviceTagRow}>
              {(selectedStation.serviceTypes || []).map((t: string) => (
                <View key={t} style={styles.serviceTag}>
                  <Text style={styles.serviceTagText}>{t.toUpperCase()}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={styles.bookBtn}
              onPress={() => navigation.navigate('BookSlot', { providerId: selectedStation._id })}
            >
              <Ionicons name="calendar-outline" size={15} color="#fff" />
              <Text style={styles.bookBtnText}>Book a Slot</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* Station list */
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.listScroll}>
            {stations.length === 0 ? (
              <View style={styles.emptyRow}>
                <Ionicons name="search-outline" size={20} color={Colors.textMuted} />
                <Text style={styles.emptyText}>No approved stations within {radius} km</Text>
              </View>
            ) : (
              stations.slice(0, 8).map(s => (
                <TouchableOpacity
                  key={s._id}
                  style={styles.listCard}
                  onPress={() => handleMarkerPress(s)}
                >
                  <View style={styles.listIconWrap}>
                    <Ionicons name={getServiceIcon(s.serviceTypes)} size={18} color={Colors.primary} />
                  </View>
                  <Text style={styles.listName} numberOfLines={1}>{s.businessName}</Text>
                  <View style={styles.listMeta}>
                    <Ionicons name="location-outline" size={11} color={Colors.textMuted} />
                    <Text style={styles.listDist}>{s.distanceKm ?? '?'} km</Text>
                    <Ionicons name="star" size={11} color="#F59E0B" />
                    <Text style={styles.listRating}>{s.rating ?? '4.8'}</Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  // Filter bar
  filterBar: {
    backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    paddingVertical: 8,
  },
  filterScroll: { paddingHorizontal: 12, gap: 8 },
  filterPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: BorderRadius.full,
    borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  filterPillActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  filterTextActive: { color: '#fff' },
  radiusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: BorderRadius.full,
    borderWidth: 1, borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  radiusBtn: { fontSize: 16, fontWeight: '900', color: Colors.primary, paddingHorizontal: 2 },
  radiusVal: { fontSize: 12, fontWeight: '700', color: Colors.primary, minWidth: 38, textAlign: 'center' },

  // Map
  mapContainer: { flex: 1, position: 'relative' },
  mapLoading: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  mapLoadingText: { fontSize: 13, color: Colors.textSecondary },
  locErrorBanner: {
    position: 'absolute', top: 8, left: 12, right: 12, zIndex: 10,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.warningBg,
    borderRadius: 8, borderWidth: 1, borderColor: Colors.warningBorder,
    padding: 8,
  },
  locErrorText: { fontSize: 11, color: Colors.warning, flex: 1 },
  locateBtn: {
    position: 'absolute', right: 12, bottom: 12,
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center',
    ...Shadow.elevated,
    borderWidth: 1, borderColor: Colors.border,
  },
  countBadge: {
    position: 'absolute', top: 12, right: 12,
    backgroundColor: Colors.surface,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: BorderRadius.full,
    borderWidth: 1, borderColor: Colors.border,
    ...Shadow.card,
  },
  countText: { fontSize: 11, fontWeight: '700', color: Colors.textPrimary },

  // Bottom sheet
  bottomSheet: {
    backgroundColor: Colors.surface,
    borderTopWidth: 1, borderTopColor: Colors.border,
    paddingVertical: 12, minHeight: 110,
  },
  loadingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  loadingText: { fontSize: 13, color: Colors.textSecondary },

  // Selected station card
  stationCard: { paddingHorizontal: 14, paddingBottom: 4 },
  stationCardTop: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10
  },
  stationIconWrap: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  stationName: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  stationAddress: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  stationMeta: { flexDirection: 'row', gap: 14, marginBottom: 10 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: Colors.textSecondary },
  serviceTagRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  serviceTag: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 4, borderWidth: 1, borderColor: Colors.primary,
  },
  serviceTagText: { fontSize: 9, fontWeight: '800', color: Colors.primary, letterSpacing: 0.5 },
  bookBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: Colors.primary,
    paddingVertical: 11, borderRadius: BorderRadius.md,
  },
  bookBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  // List cards
  listScroll: { paddingHorizontal: 12, gap: 10, alignItems: 'flex-start' },
  listCard: {
    width: 130,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border,
    padding: 10,
  },
  listIconWrap: {
    width: 36, height: 36, borderRadius: 8,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center', justifyContent: 'center', marginBottom: 6,
  },
  listName: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary, marginBottom: 6 },
  listMeta: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  listDist: { fontSize: 10, color: Colors.textMuted, marginRight: 6 },
  listRating: { fontSize: 10, color: Colors.textMuted },
  emptyRow: {
    paddingHorizontal: 24, paddingVertical: 16,
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  emptyText: { fontSize: 13, color: Colors.textMuted },
});
