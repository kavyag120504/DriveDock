/**
 * GeocodingProvider — forward geocoding (city name → coordinates). Real impl uses
 * Google Maps Platform (key gated at the adapter). Sandbox returns a small built-in
 * table for common NCR/metro cities so the stations flow works offline in dev.
 */

import { AdapterMode, AdapterError } from './types';

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface GeocodingProvider {
  readonly mode: AdapterMode;
  geocodeCity(city: string): Promise<GeoPoint>;
}

const CITY_TABLE: Record<string, GeoPoint> = {
  mumbai: { lat: 19.076, lng: 72.8777 },
  delhi: { lat: 28.6139, lng: 77.209 },
  gurugram: { lat: 28.4595, lng: 77.0266 },
  noida: { lat: 28.5355, lng: 77.391 },
  bengaluru: { lat: 12.9716, lng: 77.5946 },
  pune: { lat: 18.5204, lng: 73.8567 }
};

export class SandboxGeocodingProvider implements GeocodingProvider {
  readonly mode: AdapterMode = 'sandbox';
  async geocodeCity(city: string): Promise<GeoPoint> {
    const hit = CITY_TABLE[city.trim().toLowerCase()];
    if (!hit) throw new AdapterError('maps', `Unknown city '${city}' in sandbox table`, undefined, false);
    return hit;
  }
}
