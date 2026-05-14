jest.mock('../config/sentry', () => ({ SENTRY_ENABLED: true }));
jest.mock('../services/sentry', () => ({
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  setUserContext: jest.fn(),
  clearUserContext: jest.fn(),
  setAppContext: jest.fn(),
  Sentry: {
    addBreadcrumb: jest.fn(),
    setTag: jest.fn(),
    withScope: jest.fn((cb) => {
      const scope = { setLevel: jest.fn(), setExtra: jest.fn() };
      cb(scope);
    }),
    captureException: jest.fn(),
  },
}));

const {
  reportError,
  reportHandledError,
  reportWarning,
  addBreadcrumb,
  setMonitoringUser,
  clearMonitoringUser,
  setMonitoringTag,
  mark,
  measure,
  clearMarks,
} = require('../services/monitoring');
const {
  captureException,
  captureMessage,
  setUserContext,
  clearUserContext,
  Sentry,
} = require('../services/sentry');

beforeEach(() => {
  jest.clearAllMocks();
  clearMarks();
});

describe('reportError', () => {
  it('forwards source/operation/extra to captureException', () => {
    const err = new Error('test');
    reportError(err, { source: 'ShrubberyScreen', operation: 'load', extra: { foo: 'bar' } });
    expect(captureException).toHaveBeenCalledWith(
      err,
      expect.objectContaining({ source: 'ShrubberyScreen', operation: 'load', foo: 'bar' }),
    );
  });

  it('uses Sentry.withScope for fatal-level errors', () => {
    const err = new Error('fatal');
    reportError(err, { level: 'fatal', source: 'App' });
    expect(Sentry.withScope).toHaveBeenCalled();
    expect(Sentry.captureException).toHaveBeenCalledWith(err);
  });
});

describe('reportHandledError', () => {
  it('includes handled flag and handlerName', () => {
    const err = new Error('handled');
    reportHandledError('CacheFallback', err, { cacheAge: 100 });
    expect(captureException).toHaveBeenCalledWith(
      err,
      expect.objectContaining({ handled: true, handlerName: 'CacheFallback', cacheAge: 100 }),
    );
  });
});

describe('reportWarning', () => {
  it('calls captureMessage with warning level', () => {
    reportWarning('something odd', { detail: 'x' });
    expect(captureMessage).toHaveBeenCalledWith('something odd', 'warning', { detail: 'x' });
  });
});

describe('addBreadcrumb', () => {
  it('forwards to Sentry.addBreadcrumb with category + data', () => {
    addBreadcrumb('user clicked button', 'user.action', { screen: 'Home' });
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'user clicked button',
        category: 'user.action',
        level: 'info',
        data: { screen: 'Home' },
      }),
    );
  });

  it('defaults category to "app"', () => {
    addBreadcrumb('test');
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'app' }),
    );
  });
});

describe('user / tag wrappers', () => {
  it('setMonitoringUser delegates to setUserContext', () => {
    setMonitoringUser({ id: '123', email: 'test@t.com' });
    expect(setUserContext).toHaveBeenCalledWith({ id: '123', email: 'test@t.com' });
  });

  it('clearMonitoringUser delegates to clearUserContext', () => {
    clearMonitoringUser();
    expect(clearUserContext).toHaveBeenCalled();
  });

  it('setMonitoringTag forwards to Sentry.setTag', () => {
    setMonitoringTag('skillLevel', 'advanced');
    expect(Sentry.setTag).toHaveBeenCalledWith('skillLevel', 'advanced');
  });
});

describe('perf marks', () => {
  it('mark + measure returns elapsed ms and drops a breadcrumb', () => {
    mark('analyze:start');
    const elapsed = measure('analyze:done', 'analyze:start');
    expect(typeof elapsed).toBe('number');
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'perf' }),
    );
  });

  it('measure without a matching mark returns null', () => {
    const res = measure('done', 'never-started');
    expect(res).toBeNull();
  });
});
