// Native map implementation. On web, Map.web.tsx is used instead because
// react-native-maps only runs on iOS and Android.
import MapView, { Marker, Circle, UrlTile, PROVIDER_GOOGLE } from 'react-native-maps';
import Constants from 'expo-constants';

export { Marker, Circle, UrlTile, PROVIDER_GOOGLE };

// Without a real Google Maps key the Google base map stays grey. In that case screens draw a free,
// key-less basemap (OpenStreetMap data, CARTO tiles) on top; attribution is shown by the screen.
// android.config is filtered out of Expo's runtime config. Pass only the mode flag.
export const USE_FREE_TILES = Constants.expoConfig?.extra?.usesGoogleMaps !== true;
export const FREE_TILE_URL = 'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png';
export const FREE_TILE_ATTRIBUTION = '© OpenStreetMap contributors © CARTO';
export default MapView;
