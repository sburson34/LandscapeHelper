module.exports = {
  preset: 'react-native',
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-navigation|@sburson34|expo|@expo|@sentry/react-native|expo-constants|expo-notifications|expo-camera|expo-image-picker|expo-speech-recognition|expo-audio|expo-splash-screen|expo-print|expo-sharing|expo-location|react-native-gesture-handler|react-native-reanimated|react-native-screens|react-native-safe-area-context|react-native-tts|react-native-image-picker|react-native-vision-camera)/)',
  ],
  // `setupFilesAfterEnv` (not plain `setupFiles`) — the shared
  // setupSharedJestMocks() transitively imports
  // @testing-library/react-native, which calls expect.extend() at load
  // time. Running before the test framework is installed throws
  // `ReferenceError: expect is not defined`.
  setupFilesAfterEnv: ['./jest.setup.js'],
  testMatch: ['**/src/__tests__/**/*.test.js'],
  moduleNameMapper: {
    '\\.(png|jpg|jpeg|gif|svg)$': '<rootDir>/jest.setup.js',
  },
  // Coverage settings — only enabled when `npm run test:coverage` is used.
  collectCoverageFrom: [
    'src/api/**/*.{js,jsx}',
    'src/utils/**/*.{js,jsx}',
    'src/services/**/*.{js,jsx}',
    'src/i18n/**/*.{js,jsx}',
    'src/config/**/*.{js,jsx}',
    'src/ThemeContext.js',
    '!**/__tests__/**',
    '!**/__mocks__/**',
    '!**/index.{js,jsx}',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text-summary', 'lcov'],

  // Coverage gates. These reflect the baseline after the 2026-05-18 hardening
  // PR and represent the floor — NEVER lower these to make CI green. The
  // portfolio plan target is line >=85, branch >=78. We start at the current
  // baseline minus a small slack so a single test deletion fails CI; new
  // screens / utilities should bring the numbers UP toward the portfolio
  // targets.
  coverageThreshold: {
    global: {
      lines: 40,
      statements: 40,
      functions: 45,
      branches: 28,
    },
  },
};
