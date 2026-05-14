// Sentry runtime configuration.
//
// IMPORTANT: nothing in this file is a secret. The DSN is a public client key
// that Sentry expects to be embedded in the app. Auth tokens used for source
// map uploads must NEVER be put here — those live in sentry.properties or the
// SENTRY_AUTH_TOKEN env var, which are read only at build time.
//
// DSN resolution order:
//   1. process.env.EXPO_PUBLIC_SENTRY_DSN  (works because babel-preset-expo
//      inlines EXPO_PUBLIC_* vars at build time)
//   2. expo.extra.sentryDsn from app.json / app.config.* (via expo-constants)
//   3. The hardcoded fallback below (the project DSN for the Sentry project
//      Landscape Helper reports to). DSNs are public client keys; safe to ship.
//
// If none of those produce a string, Sentry is disabled and the app behaves
// exactly as before.

import Constants from 'expo-constants';

const C = Constants || {};
const fromEnv = typeof process !== 'undefined' ? process.env?.EXPO_PUBLIC_SENTRY_DSN : null;
const fromExtra =
  (C.expoConfig && C.expoConfig.extra && C.expoConfig.extra.sentryDsn) ||
  (C.manifest && C.manifest.extra && C.manifest.extra.sentryDsn) ||
  null;

// Project DSN — safe to embed.
// See https://docs.sentry.io/concepts/key-terms/dsn-explainer/
const HARDCODED_DSN =
  'https://a09c3051dd18ff07932f8d747a4ba32d@o4511185009049600.ingest.us.sentry.io/4511388150005760';

export const SENTRY_DSN = fromEnv || fromExtra || HARDCODED_DSN;

// Environment marker. The mobile EAS build sets EXPO_PUBLIC_APP_ENV; otherwise
// we infer "development" from the __DEV__ global.
export const SENTRY_ENVIRONMENT = (() => {
  const fromEnvVar = typeof process !== 'undefined' ? process.env?.EXPO_PUBLIC_APP_ENV : null;
  if (fromEnvVar) return fromEnvVar;
  if (typeof __DEV__ !== 'undefined' && __DEV__) return 'development';
  return 'production';
})();

// Release tag. EAS Build sets the version; we append the git commit when
// available so source maps line up with what's running.
export const SENTRY_RELEASE = (() => {
  const version =
    (C.expoConfig && C.expoConfig.version) ||
    (C.manifest && C.manifest.version) ||
    '0.0.0';
  const commit = typeof process !== 'undefined' ? process.env?.EXPO_PUBLIC_GIT_COMMIT : null;
  return commit ? `landscape-helper@${version}+${commit}` : `landscape-helper@${version}`;
})();

// Conservative sampling for beta. Drops to 0 in dev so reloads don't
// flood the project; bumps to 5% in production until we know the volume.
export const SENTRY_TRACES_SAMPLE_RATE = (() => {
  if (SENTRY_ENVIRONMENT === 'beta') return 0.2;
  if (SENTRY_ENVIRONMENT === 'production') return 0.05;
  return 0.0;
})();

export const SENTRY_ENABLED = !!SENTRY_DSN;
