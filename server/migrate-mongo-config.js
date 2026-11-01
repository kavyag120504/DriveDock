// migrate-mongo configuration.
// Migrations are TypeScript and run through ts-node so they share the app's types.
// The target database comes from MONGO_URI (same as the app), so dev/staging/prod
// each migrate their own database. NEVER point this at a database you can't lose in dev.

require('dotenv').config();
require('ts-node/register');

const url = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/drivedock';

module.exports = {
  mongodb: {
    url,
    options: {}
  },
  migrationsDir: 'migrations',
  changelogCollectionName: 'changelog',
  migrationFileExtension: '.ts',
  // Reversible, ordered migrations; useFileHash off so edits during review don't block.
  useFileHash: false,
  moduleSystem: 'commonjs'
};
