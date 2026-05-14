module.exports = {
  preset: 'react-native',
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-navigation|expo|@expo|@sentry/react-native|expo-constants|expo-notifications|expo-camera|expo-image-picker|expo-speech-recognition|expo-audio|expo-splash-screen|expo-print|expo-sharing|expo-location|react-native-gesture-handler|react-native-reanimated|react-native-screens|react-native-safe-area-context|react-native-tts|react-native-image-picker|react-native-vision-camera)/)',
  ],
  setupFiles: ['./jest.setup.js'],
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
};
