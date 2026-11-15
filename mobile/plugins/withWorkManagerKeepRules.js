/**
 * Release APKs crashed at launch with
 *   "Failed to create an instance of class androidx.work.impl.WorkDatabase.canonicalName"
 * WorkManager (pulled in by react-native-maps) ends up with Room 2.5, which finds the generated
 * WorkDatabase_Impl by reflection but ships no shrinker rule for it, so R8 strips it in release
 * builds. These rules keep every Room database implementation and its constructor.
 */
const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MARKER = '# DriveDock: keep Room databases (WorkManager)';
const RULES = `
${MARKER}
-keep class * extends androidx.room.RoomDatabase { <init>(); }
-keep class androidx.work.impl.WorkDatabase_Impl { *; }
-keep class androidx.work.impl.** extends androidx.room.RoomDatabase { *; }
`;

module.exports = function withWorkManagerKeepRules(config) {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const file = path.join(cfg.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro');
      const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
      if (!current.includes(MARKER)) fs.writeFileSync(file, current + RULES);
      return cfg;
    }
  ]);
};
