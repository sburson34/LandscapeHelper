// Global Jest setup. The bulk of the per-module mocks (AsyncStorage,
// expo-secure-store, expo-notifications, expo-constants, Sentry, safe-area,
// vector-icons, gesture-handler, reanimated) come from the shared package so
// every app in the portfolio gets the same baseline; LandscapeHelper-specific
// mocks (location services, camera, image-picker, tts, speech-recognition,
// audio, i18n) live below the marker.

const { setupSharedJestMocks } = require('@sburson34/mobile-shared/testing');

setupSharedJestMocks();

// React Native Platform — expose both default and named shapes so both
// `import Platform from '...'` and `require('...').OS` work. Not covered by
// setupSharedJestMocks because jest-expo's preset already rewires Platform
// at module-resolution time on RN ≥ 0.74; this stub is for tests that pull
// the path directly.
jest.mock('react-native/Libraries/Utilities/Platform', () => {
  const platform = {
    OS: 'android',
    Version: 33,
    constants: { reactNativeVersion: { major: 0, minor: 83, patch: 0 } },
    select: jest.fn((obj) => (obj ? obj.android ?? obj.native ?? obj.default : undefined)),
    isTV: false,
    isTesting: true,
  };
  return { __esModule: true, default: platform, ...platform };
});

// Global fetch mock — individual tests stub specific responses. The
// resilience helpers from `@sburson34/mobile-shared/testing/resilience`
// replace this on demand inside their `install()` wrapper.
global.fetch = jest.fn();

// __DEV__ global — RN gates dev-only paths on this.
global.__DEV__ = true;

// Silence noisy console during tests. Failing tests still surface via the
// jest reporter; this just keeps the green output readable.
jest.spyOn(console, 'error').mockImplementation(() => {});
jest.spyOn(console, 'warn').mockImplementation(() => {});
jest.spyOn(console, 'log').mockImplementation(() => {});
jest.spyOn(console, 'debug').mockImplementation(() => {});

// ── LandscapeHelper-specific mocks below this line ────────────────────────
// The shared setup covers AsyncStorage, expo-secure-store, expo-notifications,
// expo-constants, Sentry, react-native-safe-area-context, @expo/vector-icons,
// react-native-gesture-handler, and react-native-reanimated. Anything not in
// that list needs to be mocked here.

// expo-constants — the shared mock only sets `expoConfig.extra = {}`, but
// services/sentry.js reads `expoConfig.version` + `expoConfig.android.versionCode`
// + `expoConfig.ios.buildNumber` for the app.version / build tags it sends
// to Sentry. Extend with the LandscapeHelper shape so the sentry.test.js
// assertions (app.version === '1.0.0') keep passing. Use jest.doMock so this
// registration runs AFTER setupSharedJestMocks above — jest.mock would be
// hoisted to the top of the file and lose the race to the shared package's
// runtime jest.mock.
jest.doMock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      version: '1.0.0',
      android: { versionCode: 1 },
      ios: { buildNumber: '1' },
      extra: {},
    },
    manifest: null,
    nativeBuildVersion: '1',
  },
}));

// expo-location — outdoor "where are you gardening" lookups in HomeScreen.
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  getCurrentPositionAsync: jest.fn(() => Promise.resolve({ coords: { latitude: 0, longitude: 0 } })),
  reverseGeocodeAsync: jest.fn(() => Promise.resolve([{ postalCode: '12345' }])),
}));

// i18n — pass through translations.en, fall back to key name.
jest.mock('./src/i18n/I18nContext', () => {
  const React = require('react');
  let en = {};
  try {
    en = require('./src/i18n/translations').translations.en || {};
  } catch {
    en = {};
  }
  const ctx = {
    t: (k) => (en[k] !== undefined ? en[k] : k),
    language: 'en',
    setLanguage: () => {},
    isTranslating: false,
    translationError: null,
  };
  return {
    I18nProvider: ({ children }) => children,
    useTranslation: () => ctx,
    I18nContext: React.createContext(ctx),
  };
});

// react-native-tts — TTS for the "read aloud" buttons in the project steps
// and ask-helper flows. Prevent runtime crashes in screen tests.
jest.mock('react-native-tts', () => ({
  __esModule: true,
  default: {
    setDefaultLanguage: jest.fn(() => Promise.resolve()),
    setDefaultRate: jest.fn(() => Promise.resolve()),
    speak: jest.fn(() => Promise.resolve()),
    stop: jest.fn(() => Promise.resolve()),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    removeAllListeners: jest.fn(),
    pause: jest.fn(() => Promise.resolve()),
    resume: jest.fn(() => Promise.resolve()),
  },
}));

// expo-speech-recognition — voice input for ask-helper / diagnose flows.
jest.mock('expo-speech-recognition', () => ({
  useSpeechRecognitionEvent: jest.fn(),
  ExpoSpeechRecognitionModule: {
    start: jest.fn(),
    stop: jest.fn(),
    abort: jest.fn(),
    requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  },
  getSupportedLocales: jest.fn(() => Promise.resolve({ locales: [] })),
}));

// expo-audio — fallback recorder for the voice-input path.
jest.mock('expo-audio', () => ({
  useAudioRecorder: () => ({
    prepare: jest.fn(() => Promise.resolve()),
    record: jest.fn(() => Promise.resolve()),
    stop: jest.fn(() => Promise.resolve()),
    getURI: jest.fn(() => null),
  }),
  AudioModule: {
    requestRecordingPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  },
  RecordingPresets: { HIGH_QUALITY: {} },
}));

// expo-camera — analyze flow's Capture screen embeds CameraView.
jest.mock('expo-camera', () => ({
  CameraView: () => null,
  useCameraPermissions: () => [{ granted: true }, jest.fn()],
}));

// expo-image-picker — gallery fallback for the analyze flow.
jest.mock('expo-image-picker', () => ({
  launchCameraAsync: jest.fn(() => Promise.resolve({ canceled: true })),
  launchImageLibraryAsync: jest.fn(() => Promise.resolve({ canceled: true })),
  MediaTypeOptions: { Images: 'Images' },
  requestCameraPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  requestMediaLibraryPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
}));

// Asset mock (used by moduleNameMapper for image imports). Must be the
// module's *exports* — Jest substitutes this file's exported value for any
// matched image require. Keep this as the last line of the file.
module.exports = 'test-asset-stub';
