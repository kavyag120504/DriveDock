// Web stand-in for react-native-maps, which only runs on iOS and Android.
// Shows a placeholder so screens that use the map still work in the browser.
import React, { forwardRef, useImperativeHandle } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';

export const PROVIDER_GOOGLE = undefined;
export const Marker = (_props: any) => null;
export const Circle = (_props: any) => null;

const MapView = forwardRef<any, any>(({ style }, ref) => {
  useImperativeHandle(ref, () => ({ animateToRegion: () => {} }));

  return (
    <View style={[style, styles.placeholder]}>
      <Text style={styles.text}>Map view is available in the mobile app.</Text>
      <Text style={styles.text}>Stations are listed below.</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceLight
  },
  text: {
    color: Colors.textSecondary,
    fontSize: 13
  }
});

export default MapView;
