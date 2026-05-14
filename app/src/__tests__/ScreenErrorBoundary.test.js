// Direct unit test for ScreenErrorBoundary's state machine — we test the
// class methods rather than the rendered tree because the public contract is
// (a) reportError fires on catch and (b) reset clears state and triggers the
// onReset callback. Rendering is incidental to those behaviors.

jest.mock('../services/monitoring', () => ({
  reportError: jest.fn(),
}));
jest.mock('../theme', () => ({
  colors: {
    background: '#FFF',
    text: '#000',
    textSecondary: '#666',
    primary: '#FCA004',
  },
  roundness: { medium: 8 },
}));

const ScreenErrorBoundary = require('../components/ScreenErrorBoundary').default;
const { reportError } = require('../services/monitoring');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ScreenErrorBoundary', () => {
  it('is a class component with the React error-boundary statics', () => {
    expect(typeof ScreenErrorBoundary).toBe('function');
    expect(ScreenErrorBoundary.getDerivedStateFromError).toBeDefined();
  });

  it('getDerivedStateFromError returns the error in state', () => {
    const error = new Error('test');
    const state = ScreenErrorBoundary.getDerivedStateFromError(error);
    expect(state).toEqual({ error });
  });

  it('componentDidCatch reports the error with screenName', () => {
    const instance = new ScreenErrorBoundary({ screenName: 'ShrubberyScreen' });
    const error = new Error('render crash');
    const info = { componentStack: 'at Foo\nat Bar' };

    instance.componentDidCatch(error, info);

    expect(reportError).toHaveBeenCalledWith(error, {
      source: 'ShrubberyScreen',
      operation: 'render',
      extra: { componentStack: 'at Foo\nat Bar' },
    });
  });

  it('componentDidCatch falls back to a default screen name', () => {
    const instance = new ScreenErrorBoundary({});
    instance.componentDidCatch(new Error('test'), {});
    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ source: 'ScreenErrorBoundary' }),
    );
  });

  it('truncates very long componentStack strings to 1000 chars', () => {
    const instance = new ScreenErrorBoundary({ screenName: 'Test' });
    const longStack = 'x'.repeat(2000);
    instance.componentDidCatch(new Error('test'), { componentStack: longStack });
    const reported = reportError.mock.calls[0][1].extra.componentStack;
    expect(reported.length).toBe(1000);
  });

  it('reset clears error state and fires onReset when provided', () => {
    const onReset = jest.fn();
    const instance = new ScreenErrorBoundary({ onReset });
    instance.setState = jest.fn();
    instance.reset();
    expect(instance.setState).toHaveBeenCalledWith({ error: null });
    expect(onReset).toHaveBeenCalled();
  });

  it('reset works without an onReset prop', () => {
    const instance = new ScreenErrorBoundary({});
    instance.setState = jest.fn();
    instance.reset();
    expect(instance.setState).toHaveBeenCalledWith({ error: null });
  });

  it('starts in error: null state', () => {
    const instance = new ScreenErrorBoundary({});
    expect(instance.state).toEqual({ error: null });
  });
});
