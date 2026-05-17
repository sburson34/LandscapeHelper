// Thin shim over @sburson34/mobile-shared/sentry. The shared package owns
// the scrubber (sensitive keys, base64 media, PII fields), the Sentry init
// call, and the safe helpers. This file just wires up Landscape Helper's
// app-specific config (DSN, release, app context, tags) and re-exports
// everything else so feature code can keep importing from
// '../services/sentry' unchanged.
//
// Anything Sentry-specific outside this file should still import from here
// (NOT from '@sburson34/mobile-shared/sentry' directly) so per-app
// composition stays in one place.

import Constants from 'expo-constants';
import { Platform } from 'react-native';
import {
  initSentry as sharedInit,
  captureException as sharedCapture,
  captureMessage as sharedCaptureMessage,
  setUserContext as sharedSetUser,
  clearUserContext as sharedClearUser,
  setAppContext as sharedSetAppContext,
  navigationIntegration as sharedNavIntegration,
  Sentry as SharedSentry,
} from '@sburson34/mobile-shared/sentry';
import {
  SENTRY_DSN,
  SENTRY_ENABLED,
  SENTRY_ENVIRONMENT,
  SENTRY_RELEASE,
  SENTRY_TRACES_SAMPLE_RATE,
} from '../config/sentry';

export const navigationIntegration = sharedNavIntegration;
export const Sentry = SharedSentry;

export const initSentry = () => {
  const C = Constants || {};
  const APP_VERSION =
    (C.expoConfig && C.expoConfig.version) ||
    (C.manifest && C.manifest.version) ||
    '0.0.0';
  const APP_PLATFORM = Platform.OS;
  const OS_VERSION = String(Platform.Version);
  const GIT_COMMIT =
    typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_GIT_COMMIT
      ? process.env.EXPO_PUBLIC_GIT_COMMIT
      : '';

  sharedInit({
    // Forward null when feature-flagged off so the shared init logs the
    // "disabled — no DSN configured" line and skips Sentry.init.
    dsn: SENTRY_ENABLED ? SENTRY_DSN : null,
    environment: SENTRY_ENVIRONMENT,
    release: SENTRY_RELEASE,
    tracesSampleRate: SENTRY_TRACES_SAMPLE_RATE,
    enableAutoSessionTracking: true,
    appContext: {
      app_version: APP_VERSION,
      platform: APP_PLATFORM,
      os_version: OS_VERSION,
      environment: SENTRY_ENVIRONMENT,
    },
    tags: {
      'app.version': APP_VERSION,
      'app.platform': APP_PLATFORM,
      ...(GIT_COMMIT ? { 'app.commit': GIT_COMMIT } : {}),
    },
  });
};

export const captureException = sharedCapture;
export const captureMessage = sharedCaptureMessage;
export const setUserContext = sharedSetUser;
export const clearUserContext = sharedClearUser;
export const setAppContext = sharedSetAppContext;
