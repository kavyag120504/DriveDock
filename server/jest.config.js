/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/src/__tests__/**/*.test.ts'],
  globals: {
    'ts-jest': {
      tsconfig: {
        // Relax rootDir constraint for tests — src is still the source root for prod builds
        rootDir: '.',
        esModuleInterop: true,
        strict: false
      }
    }
  },
  testTimeout: 30000
};
