// Native map implementation. On web, Map.web.tsx is used instead because
// react-native-maps only runs on iOS and Android.
import MapView, { Marker, Circle, PROVIDER_GOOGLE } from 'react-native-maps';

export { Marker, Circle, PROVIDER_GOOGLE };
export default MapView;
