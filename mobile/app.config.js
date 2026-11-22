module.exports = ({ config }) => {
  const mapsKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY?.trim();
  const usesGoogleMaps = Boolean(mapsKey && !mapsKey.startsWith('YOUR_'));

  return {
    ...config,
    android: {
      ...config.android,
      config: {
        ...config.android?.config,
        googleMaps: {
          ...config.android?.config?.googleMaps,
          apiKey: usesGoogleMaps ? mapsKey : 'YOUR_GOOGLE_MAPS_API_KEY',
        },
      },
    },
    extra: {
      ...config.extra,
      usesGoogleMaps,
    },
  };
};
