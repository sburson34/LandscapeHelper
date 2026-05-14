// Global mocks for React Native and Expo modules used by Landscape Helper.

// AsyncStorage mock
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn((key) => Promise.resolve(store[key] || null)),
      setItem: jest.fn((key, value) => {
        store[key] = value;
        return Promise.resolve();
      }),
      removeItem: jest.fn((key) => {
        delete store[key];
        return Promise.resolve();
      }),
      clear: jest.fn(() => {
        Object.keys(store).forEach((key) => delete store[key]);
        return Promise.resolve();
      }),
      _store: store,
      _reset: () => {
        Object.keys(store).forEach((key) => delete store[key]);
      },
    },
  };
});

// React Native Platform mock — expose both default and named shapes.
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

// Expo Constants mock
jest.mock('expo-constants', () => ({
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

// Expo Notifications mock
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  setNotificationChannelAsync: jest.fn(() => Promise.resolve()),
  scheduleNotificationAsync: jest.fn(() => Promise.resolve('notif-id-123')),
  cancelScheduledNotificationAsync: jest.fn(() => Promise.resolve()),
  setNotificationHandler: jest.fn(),
  AndroidImportance: { DEFAULT: 3 },
}));

// expo-location mock
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  getCurrentPositionAsync: jest.fn(() => Promise.resolve({ coords: { latitude: 0, longitude: 0 } })),
  reverseGeocodeAsync: jest.fn(() => Promise.resolve([{ postalCode: '12345' }])),
}));

// Sentry mock — shape mirrors the @sentry/react-native API surface our
// services/sentry.js touches.
jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  setUser: jest.fn(),
  setTag: jest.fn(),
  setContext: jest.fn(),
  addBreadcrumb: jest.fn(),
  withScope: jest.fn((cb) => {
    const scope = {
      setLevel: jest.fn(),
      setTag: jest.fn(),
      setExtra: jest.fn(),
    };
    cb(scope);
  }),
  wrap: jest.fn((component) => component),
  reactNavigationIntegration: jest.fn(() => ({
    registerNavigationContainer: jest.fn(),
  })),
  Severity: { Warning: 'warning', Error: 'error', Info: 'info', Fatal: 'fatal' },
}));

// react-native-safe-area-context — stub to plain View / passthrough
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  const pass = ({ children, ...rest }) => React.createElement(View, rest, children);
  return {
    SafeAreaProvider: pass,
    SafeAreaView: pass,
    SafeAreaInsetsContext: {
      Consumer: ({ children }) => children({ top: 0, bottom: 0, left: 0, right: 0 }),
    },
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 390, height: 844 }),
  };
});

// @expo/vector-icons — render icons as accessible views so size/name are inert
jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { View } = require('react-native');
  const stub = (props) =>
    React.createElement(View, { accessibilityLabel: props.accessibilityLabel || 'icon' });
  return new Proxy({}, { get: () => stub });
});

// react-native-gesture-handler — minimal stub
jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const { View } = require('react-native');
  const pass = ({ children, ...rest }) => React.createElement(View, rest, children);
  return {
    GestureHandlerRootView: pass,
    Swipeable: pass,
    DrawerLayout: pass,
    ScrollView: pass,
    TouchableOpacity: require('react-native').TouchableOpacity,
    TouchableWithoutFeedback: require('react-native').TouchableWithoutFeedback,
    TouchableHighlight: require('react-native').TouchableHighlight,
    State: {},
    Directions: {},
    gestureHandlerRootHOC: (c) => c,
  };
});

// react-native-reanimated — use its provided mock when available.
try {
  jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
} catch {
  // ignore
}

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

// react-native-tts — mock to prevent runtime crashes in screen tests.
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

// expo-speech-recognition
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

// expo-audio
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

// expo-camera
jest.mock('expo-camera', () => ({
  CameraView: () => null,
  useCameraPermissions: () => [{ granted: true }, jest.fn()],
}));

// expo-image-picker
jest.mock('expo-image-picker', () => ({
  launchCameraAsync: jest.fn(() => Promise.resolve({ canceled: true })),
  launchImageLibraryAsync: jest.fn(() => Promise.resolve({ canceled: true })),
  MediaTypeOptions: { Images: 'Images' },
  requestCameraPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  requestMediaLibraryPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
}));

// Global fetch mock
global.fetch = jest.fn();

// __DEV__ global
global.__DEV__ = true;

// Silence console noise in tests
jest.spyOn(console, 'error').mockImplementation(() => {});
jest.spyOn(console, 'warn').mockImplementation(() => {});
jest.spyOn(console, 'log').mockImplementation(() => {});
jest.spyOn(console, 'debug').mockImplementation(() => {});

// Asset mock (for image imports via moduleNameMapper)
module.exports = 'test-asset-stub';
