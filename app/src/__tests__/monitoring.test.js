// The universal-core monitoring helpers (reportError / reportHandledError /
// reportWarning / addBreadcrumb / setMonitoringUser / clearMonitoringUser /
// setMonitoringTag) come from @sburson34/mobile-shared/monitoring now and
// are covered by upstream tests, so we only verify:
//   (a) the re-exports are wired up (smoke check on identity)
//   (b) the LOCAL mark()/measure()/clearMarks() perf API still behaves as
//       LandscapeHelper expects

const shared = require('@sburson34/mobile-shared/monitoring');
const monitoring = require('../services/monitoring');

describe('monitoring re-exports the shared universal-core API', () => {
  it.each([
    'reportError',
    'reportHandledError',
    'reportWarning',
    'addBreadcrumb',
    'setMonitoringUser',
    'clearMonitoringUser',
    'setMonitoringTag',
    'startPerfMark',
    'endPerfMark',
    'measureAsync',
  ])('re-exports %s from @sburson34/mobile-shared/monitoring', (name) => {
    expect(monitoring[name]).toBe(shared[name]);
  });
});

describe('local string-label perf marks', () => {
  const { mark, measure, clearMarks } = monitoring;

  beforeEach(() => {
    clearMarks();
  });

  it('mark + measure returns elapsed ms', () => {
    mark('analyze:start');
    const elapsed = measure('analyze:done', 'analyze:start');
    expect(typeof elapsed).toBe('number');
    expect(elapsed).toBeGreaterThanOrEqual(0);
  });

  it('measure without a matching mark returns null', () => {
    const res = measure('done', 'never-started');
    expect(res).toBeNull();
  });

  it('mark ignores invalid names', () => {
    mark('');
    mark(undefined);
    mark(123);
    // No matching mark exists, so measure should be null
    expect(measure('done', '')).toBeNull();
  });

  it('measure consumes the start mark (subsequent measure with same start returns null)', () => {
    mark('once:start');
    expect(measure('once:done', 'once:start')).not.toBeNull();
    expect(measure('once:done', 'once:start')).toBeNull();
  });

  it('clearMarks wipes pending marks', () => {
    mark('foo:start');
    clearMarks();
    expect(measure('foo:done', 'foo:start')).toBeNull();
  });
});
