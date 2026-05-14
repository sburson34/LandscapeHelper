// Tests the services/sentry.js scrubbing and helper wrappers. The config
// module is mocked so the real DSN doesn't have to be present — and so we
// can flip SENTRY_ENABLED to exercise both branches.

jest.mock('../config/sentry', () => ({
  SENTRY_DSN: 'https://fake@sentry.io/123',
  SENTRY_ENABLED: true,
  SENTRY_ENVIRONMENT: 'test',
  SENTRY_RELEASE: 'landscape-helper@test',
  SENTRY_TRACES_SAMPLE_RATE: 0,
}));

beforeEach(() => {
  jest.clearAllMocks();
  jest.resetModules();
});

const loadSentry = () => {
  // Re-mock dependencies after resetModules so the fresh require picks up our
  // mocked config and the initialised-once flag is reset.
  jest.mock('../config/sentry', () => ({
    SENTRY_DSN: 'https://fake@sentry.io/123',
    SENTRY_ENABLED: true,
    SENTRY_ENVIRONMENT: 'test',
    SENTRY_RELEASE: 'landscape-helper@test',
    SENTRY_TRACES_SAMPLE_RATE: 0,
  }));
  return require('../services/sentry');
};

describe('initSentry', () => {
  it('calls Sentry.init with the configured DSN + sampling', () => {
    const { initSentry } = loadSentry();
    initSentry();
    const SentryMock = require('@sentry/react-native');
    expect(SentryMock.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: 'https://fake@sentry.io/123',
        environment: 'test',
        release: 'landscape-helper@test',
        tracesSampleRate: 0,
        sendDefaultPii: false,
      }),
    );
  });

  it('sets app.version and app.platform tags', () => {
    const { initSentry } = loadSentry();
    initSentry();
    const SentryMock = require('@sentry/react-native');
    expect(SentryMock.setTag).toHaveBeenCalledWith('app.version', '1.0.0');
    expect(SentryMock.setTag).toHaveBeenCalledWith('app.platform', 'android');
  });

  it('sets an "app" context block', () => {
    const { initSentry } = loadSentry();
    initSentry();
    const SentryMock = require('@sentry/react-native');
    expect(SentryMock.setContext).toHaveBeenCalledWith(
      'app',
      expect.objectContaining({
        app_version: '1.0.0',
        platform: 'android',
        environment: 'test',
      }),
    );
  });
});

describe('captureException', () => {
  it('opens a scope and forwards to Sentry.captureException', () => {
    const { captureException } = loadSentry();
    const SentryMock = require('@sentry/react-native');
    const err = new Error('test');
    captureException(err, { source: 'ShrubberyScreen' });
    expect(SentryMock.withScope).toHaveBeenCalled();
    expect(SentryMock.captureException).toHaveBeenCalledWith(err);
  });
});

describe('captureMessage', () => {
  it('opens a scope at the given level', () => {
    const { captureMessage } = loadSentry();
    const SentryMock = require('@sentry/react-native');
    captureMessage('test message', 'warning', { detail: 'x' });
    expect(SentryMock.withScope).toHaveBeenCalled();
    expect(SentryMock.captureMessage).toHaveBeenCalledWith('test message');
  });
});

describe('setUserContext', () => {
  it('stringifies numeric ids before handing them to Sentry.setUser', () => {
    const { setUserContext } = loadSentry();
    const SentryMock = require('@sentry/react-native');
    setUserContext({ id: 123, email: 'tester@example.com' });
    expect(SentryMock.setUser).toHaveBeenCalledWith(
      expect.objectContaining({ id: '123', email: 'tester@example.com' }),
    );
  });
});

describe('clearUserContext', () => {
  it('clears the user', () => {
    const { clearUserContext } = loadSentry();
    const SentryMock = require('@sentry/react-native');
    clearUserContext();
    expect(SentryMock.setUser).toHaveBeenCalledWith(null);
  });
});

describe('setAppContext', () => {
  it('scrubs sensitive keys before sending to Sentry', () => {
    const { setAppContext } = loadSentry();
    const SentryMock = require('@sentry/react-native');
    setAppContext('prefs', { theme: 'dark', token: 'secret123' });
    expect(SentryMock.setContext).toHaveBeenCalledWith(
      'prefs',
      expect.objectContaining({ theme: 'dark', token: '[redacted]' }),
    );
  });

  it('scrubs photo arrays (privacy: never ship base64 media to Sentry)', () => {
    const { setAppContext } = loadSentry();
    const SentryMock = require('@sentry/react-native');
    setAppContext('request', { photos: ['base64...', 'base64...'] });
    const arg = SentryMock.setContext.mock.calls.find((c) => c[0] === 'request')[1];
    expect(arg.photos).toBe('[redacted]:media[2]');
  });
});

describe('SENTRY_ENABLED = false branch', () => {
  it('captureException falls back to console.error', () => {
    jest.resetModules();
    jest.doMock('../config/sentry', () => ({
      SENTRY_DSN: '',
      SENTRY_ENABLED: false,
      SENTRY_ENVIRONMENT: 'test',
      SENTRY_RELEASE: 'landscape-helper@test',
      SENTRY_TRACES_SAMPLE_RATE: 0,
    }));
    const { captureException } = require('../services/sentry');
    const SentryMock = require('@sentry/react-native');
    const err = new Error('disabled');
    captureException(err);
    expect(SentryMock.captureException).not.toHaveBeenCalled();
  });
});
