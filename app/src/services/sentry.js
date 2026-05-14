// Centralized Sentry helper.
//
// Why this file exists:
//   - One place to call Sentry.init so App.js stays small.
//   - One place that scrubs sensitive payloads (auth tokens, API keys,
//     base64 image bodies, user free-text) before anything is sent.
//   - Safe wrappers (captureException / captureMessage / setUserContext /
//     setAppContext) that no-op when the DSN isn't configured, so feature
//     code can call them unconditionally.
//
// Anything Sentry-specific outside of this file should import from here, NOT
// from '@sentry/react-native' directly. That keeps scrubbing/guards in one
// place and makes it easy to swap providers later.

import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import {
  SENTRY_DSN,
  SENTRY_ENABLED,
  SENTRY_ENVIRONMENT,
  SENTRY_RELEASE,
  SENTRY_TRACES_SAMPLE_RATE,
} from '../config/sentry';

// Single shared navigation integration instance. App.js hands its
// `registerNavigationContainer` method to NavigationContainer's `onReady`
// callback so route changes become breadcrumbs.
export const navigationIntegration =
  typeof Sentry.reactNavigationIntegration === 'function'
    ? Sentry.reactNavigationIntegration({ enableTimeToInitialDisplay: false })
    : { registerNavigationContainer: () => {} };

// ── Scrubbing ─────────────────────────────────────────────────────────────
// Keys whose values should never leave the device. Compared case-insensitively
// against header names, body keys, and breadcrumb data keys.
const SENSITIVE_KEYS = [
  'authorization',
  'auth',
  'token',
  'access_token',
  'refresh_token',
  'api_key',
  'apikey',
  'x-api-key',
  'openai_api_key',
  'password',
  'secret',
  'cookie',
  'set-cookie',
];

// Body fields that may carry raw user media (base64 photos the app sends to
// /api/analyze, /api/shrubbery-advice, /api/whole-house-advice). These are
// large and privacy-sensitive — strip.
const MEDIA_KEYS = ['media', 'image', 'images', 'photo', 'photos', 'video', 'videos', 'base64', 'data'];

// Free-text user input and contact fields. Breadcrumbs already log only length
// for these, but this scrubs any future code path that ends up routing a body
// through beforeSend so raw user text never reaches Sentry.
const USER_TEXT_KEYS = [
  'description',
  'userdescription',
  'ideas',
  'overallnotes',
  'notes',
  'question',
  'steptext',
  'prompt',
  'customername',
  'customeremail',
  'customerphone',
  'name',
  'email',
  'phone',
];

const REDACTED = '[redacted]';

const isSensitiveKey = (key) => {
  if (typeof key !== 'string') return false;
  const k = key.toLowerCase();
  return SENSITIVE_KEYS.some((s) => k === s || k.includes(s));
};

const isMediaKey = (key) => {
  if (typeof key !== 'string') return false;
  return MEDIA_KEYS.includes(key.toLowerCase());
};

const isUserTextKey = (key) => {
  if (typeof key !== 'string') return false;
  return USER_TEXT_KEYS.includes(key.toLowerCase());
};

// Recursively scrub an arbitrary object. Bounded depth so we never blow the
// stack on a circular structure.
const scrub = (value, depth = 0) => {
  if (value == null || depth > 6) return value;
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  if (typeof value === 'string') {
    if (value.length > 2000 && /^[A-Za-z0-9+/=]+$/.test(value.slice(0, 64))) {
      return `${REDACTED}:base64(${value.length}b)`;
    }
    return value;
  }
  if (typeof value !== 'object') return value;

  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (isSensitiveKey(k)) {
      out[k] = REDACTED;
    } else if (isMediaKey(k)) {
      out[k] = Array.isArray(v) ? `${REDACTED}:media[${v.length}]` : REDACTED;
    } else if (isUserTextKey(k) && typeof v === 'string') {
      out[k] = `${REDACTED}:text(${v.length}c)`;
    } else {
      out[k] = scrub(v, depth + 1);
    }
  }
  return out;
};

const beforeSend = (event) => {
  try {
    if (event?.request) {
      if (event.request.headers) event.request.headers = scrub(event.request.headers);
      if (event.request.data) event.request.data = scrub(event.request.data);
      if (event.request.cookies) event.request.cookies = REDACTED;
    }
    if (event?.extra) event.extra = scrub(event.extra);
    if (event?.contexts) event.contexts = scrub(event.contexts);
    if (event?.tags) event.tags = scrub(event.tags);
  } catch {
    // Never let scrubbing errors block delivery.
  }
  return event;
};

const beforeBreadcrumb = (breadcrumb) => {
  try {
    if (breadcrumb?.data) breadcrumb.data = scrub(breadcrumb.data);
    if (breadcrumb?.category === 'console' && breadcrumb?.level === 'debug') return null;
  } catch {
    // ignore
  }
  return breadcrumb;
};

// ── Init ──────────────────────────────────────────────────────────────────
let initialized = false;

export const initSentry = () => {
  if (initialized) return;
  if (!SENTRY_ENABLED) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      // eslint-disable-next-line no-console
      console.log('[sentry] disabled — no DSN configured');
    }
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: SENTRY_ENVIRONMENT,
    release: SENTRY_RELEASE,
    tracesSampleRate: SENTRY_TRACES_SAMPLE_RATE,
    attachStacktrace: true,
    sendDefaultPii: false,
    integrations: [navigationIntegration],
    beforeSend,
    beforeBreadcrumb,
    enableAutoSessionTracking: true,
  });

  // Persistent tags — indexed and searchable on every event.
  const version =
    (Constants?.expoConfig && Constants.expoConfig.version) ||
    (Constants?.manifest && Constants.manifest.version) ||
    '0.0.0';
  Sentry.setTag('app.version', version);
  Sentry.setTag('app.platform', Platform.OS);
  if (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_GIT_COMMIT) {
    Sentry.setTag('app.commit', process.env.EXPO_PUBLIC_GIT_COMMIT);
  }

  Sentry.setContext('app', {
    app_version: version,
    platform: Platform.OS,
    os_version: String(Platform.Version),
    environment: SENTRY_ENVIRONMENT,
  });

  initialized = true;
};

// ── Public helpers (safe to call before init or with no DSN) ─────────────

export const captureException = (error, context) => {
  if (!SENTRY_ENABLED) {
    // eslint-disable-next-line no-console
    console.error('[captureException]', error, context || '');
    return;
  }
  try {
    Sentry.withScope((scope) => {
      if (context && typeof context === 'object') {
        for (const [k, v] of Object.entries(context)) scope.setExtra(k, v);
      }
      Sentry.captureException(error);
    });
  } catch {
    // swallow — telemetry must never crash the app
  }
};

export const captureMessage = (message, level = 'info', extra) => {
  if (!SENTRY_ENABLED) {
    // eslint-disable-next-line no-console
    console.log(`[captureMessage:${level}]`, message, extra || '');
    return;
  }
  try {
    Sentry.withScope((scope) => {
      if (typeof scope.setLevel === 'function') scope.setLevel(level);
      if (extra && typeof extra === 'object') {
        for (const [k, v] of Object.entries(extra)) scope.setExtra(k, v);
      }
      Sentry.captureMessage(message);
    });
  } catch {
    // ignore
  }
};

export const setUserContext = (info = {}) => {
  if (!SENTRY_ENABLED) return;
  const { id, email, username, ...rest } = info;
  try {
    Sentry.setUser({
      id: id != null ? String(id) : undefined,
      email,
      username,
      ...rest,
    });
  } catch {
    // ignore
  }
};

export const clearUserContext = () => {
  if (!SENTRY_ENABLED) return;
  try {
    Sentry.setUser(null);
  } catch {
    // ignore
  }
};

export const setAppContext = (key, value) => {
  if (!SENTRY_ENABLED) return;
  try {
    Sentry.setContext(key, scrub(value));
  } catch {
    // ignore
  }
};

// Re-export the underlying SDK for the few cases (Sentry.wrap, breadcrumbs)
// where we need direct access. Prefer the helpers above for normal feature
// code so scrubbing happens in one place.
export { Sentry };
