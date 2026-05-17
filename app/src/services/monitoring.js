// Thin shim over @sburson34/mobile-shared/monitoring plus a small
// LandscapeHelper-specific mark()/measure() perf API.
//
// Universal helpers (reportError / reportHandledError / reportWarning /
// addBreadcrumb / setMonitoringUser / clearMonitoringUser /
// setMonitoringTag) are re-exported from the shared package. The
// token-based startPerfMark / endPerfMark / measureAsync helpers are
// also re-exported for code that wants to opt in to the new API.
//
// The legacy string-label mark()/measure()/clearMarks() API stays local
// because the shared 0.2.0 package only ships the token-based variant
// and existing call sites in this app use the string-label form.
//
// Feature code should still import from '../services/monitoring' (NOT
// from '@sburson34/mobile-shared/monitoring' directly) so this app's
// composition stays in one place.

export {
  reportError,
  reportHandledError,
  reportWarning,
  addBreadcrumb,
  setMonitoringUser,
  clearMonitoringUser,
  setMonitoringTag,
  startPerfMark,
  endPerfMark,
  measureAsync,
} from '@sburson34/mobile-shared/monitoring';

import { addBreadcrumb } from '@sburson34/mobile-shared/monitoring';

// ── Legacy string-label perf marks (LandscapeHelper-specific) ───────────
// Lightweight client-side perf timers. Persist a Map keyed by mark name;
// on `measure()` we compute the delta and emit a breadcrumb via the
// shared addBreadcrumb so the duration shows up alongside the rest of
// the user's session in Sentry.

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
