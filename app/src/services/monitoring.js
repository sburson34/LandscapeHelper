// Production-ready error reporting & monitoring utility.
//
// This is the public API that feature code should import. It delegates to
// Sentry (via ./sentry.js) when available and falls back to console logging
// when the DSN isn't configured or in local __DEV__ builds.
//
// Usage:
//   import { reportError, addBreadcrumb, mark, measure } from '../services/monitoring';
//
// Do NOT import from '@sentry/react-native' or './sentry' directly in
// feature code — always go through this module so scrubbing, guards, and
// future provider swaps happen in one place.

import {
  captureException,
  captureMessage,
  setUserContext,
  clearUserContext,
  Sentry,
} from './sentry';
import { SENTRY_ENABLED } from '../config/sentry';

const log = (method, ...args) => {
  // eslint-disable-next-line no-console
  (console[method] || console.log)(...args);
};

// ── Error reporting ──────────────────────────────────────────────────────

/**
 * Report an unhandled or unexpected error.
 * options: { source, operation, extra, level }
 */
export function reportError(error, options = {}) {
  const { source, operation, extra, level } = options;

  const context = {
    ...(source && { source }),
    ...(operation && { operation }),
    ...extra,
  };

  if (level === 'fatal' && SENTRY_ENABLED) {
    try {
      Sentry.withScope((scope) => {
        if (typeof scope.setLevel === 'function') scope.setLevel('fatal');
        for (const [k, v] of Object.entries(context)) scope.setExtra(k, v);
        Sentry.captureException(error);
      });
    } catch {
      // telemetry must never crash the app
    }
    return;
  }

  captureException(error, context);
}

/**
 * Report an error that was caught and handled (the app recovered).
 * Distinct from reportError so you can filter handled vs unhandled in Sentry.
 */
export function reportHandledError(name, error, extra) {
  captureException(error, {
    handled: true,
    handlerName: name,
    ...extra,
  });
}

/**
 * Report a warning-level message (not an Error object).
 */
export function reportWarning(message, extra) {
  captureMessage(message, 'warning', extra);
}

/**
 * Add a breadcrumb that will be attached to the next error/event.
 * Use this before risky operations so the timeline shows what the user did.
 */
export function addBreadcrumb(message, category = 'app', data) {
  if (SENTRY_ENABLED) {
    try {
      Sentry.addBreadcrumb({
        message,
        category,
        level: 'info',
        ...(data && { data }),
      });
    } catch {
      // ignore
    }
  }
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    log('debug', `[breadcrumb:${category}]`, message, data || '');
  }
}

// ── User / tag / context ─────────────────────────────────────────────────

/** Set the current user for monitoring. Call on login / profile load. */
export function setMonitoringUser(userInfo) {
  setUserContext(userInfo);
}

/** Clear the monitoring user (e.g. on logout). */
export function clearMonitoringUser() {
  clearUserContext();
}

/** Set a global tag on all future events. Tags are indexed in Sentry. */
export function setMonitoringTag(key, value) {
  if (!SENTRY_ENABLED) return;
  try {
    Sentry.setTag(key, value);
  } catch {
    // ignore
  }
}

// ── Performance marks ────────────────────────────────────────────────────
// Lightweight client-side perf timers. Persist a Map keyed by mark name; on
// `measure()` we compute the delta and emit a breadcrumb so the duration shows
// up alongside the rest of the user's session in Sentry. No Sentry transaction
// dependency — the navigation integration handles those separately.

const _marks = new Map();

/**
 * Record a performance mark.
 *   mark('analyze:start')
 */
export function mark(name) {
  if (typeof name !== 'string' || !name) return;
  _marks.set(name, Date.now());
}

/**
 * Measure the duration since `startName` and return the elapsed ms.
 * Emits a breadcrumb so the timing shows up next to the user's actions.
 *   const ms = measure('analyze:done', 'analyze:start');
 */
export function measure(name, startName) {
  if (typeof name !== 'string' || typeof startName !== 'string') return null;
  const start = _marks.get(startName);
  if (start == null) return null;
  const elapsed = Date.now() - start;
  _marks.delete(startName);
  addBreadcrumb(`${name} (${elapsed}ms)`, 'perf', { name, startName, elapsed });
  return elapsed;
}

/**
 * Clear all stored marks. Mostly useful between test cases.
 */
export function clearMarks() {
  _marks.clear();
}
