module.exports = ({ config }) => {
  const mapsKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY?.trim();
  const usesGoogleMaps = Boolean(mapsKey && !mapsKey.startsWith('YOUR_'));
  // Push on Android needs the Firebase google-services.json. In EAS Build it arrives as a file environment variable
  // (GOOGLE_SERVICES_JSON holds its path); the file itself is never committed.
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON?.trim();

  return {
    ...config,
    android: {
      ...config.android,
      ...(googleServicesFile ? { googleServicesFile } : {}),
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
      pushConfigured: Boolean(googleServicesFile),
    },
  };
};
