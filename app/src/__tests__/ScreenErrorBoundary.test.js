// Verify the local ScreenErrorBoundary wrapper passes the app's theme to
// the shared boundary and forwards other props. The shared boundary's
// internal behavior (componentDidCatch, fallback rendering, reset) is
// tested in @sburson34/mobile-shared and not re-tested here.

jest.mock('@sburson34/mobile-shared/error-boundary', () => ({
  ScreenErrorBoundary: jest.fn(({ children }) => children ?? null),
}));
jest.mock('../theme', () => ({
  __esModule: true,
  default: {
    colors: {
      background: '#F1F8E9',
      text: '#1B5E20',
      textSecondary: '#6D4C41',
      primary: '#2E7D32',
      danger: '#D84315',
    },
    roundness: { medium: 16 },
  },
}));

const React = require('react');
const { render } = require('@testing-library/react-native');
const ScreenErrorBoundary = require('../components/ScreenErrorBoundary').default;
const { ScreenErrorBoundary: SharedScreenErrorBoundary } = require('@sburson34/mobile-shared/error-boundary');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ScreenErrorBoundary (wrapper)', () => {
  it('renders the shared ScreenErrorBoundary with theme derived from app theme', () => {
    render(
      React.createElement(ScreenErrorBoundary, { screenName: 'ShrubberyScreen' }, 'child'),
    );

    expect(SharedScreenErrorBoundary).toHaveBeenCalled();
    const props = SharedScreenErrorBoundary.mock.calls[0][0];
    expect(props.screenName).toBe('ShrubberyScreen');
    expect(props.theme).toEqual({
      background: '#F1F8E9',
      text: '#1B5E20',
      textSecondary: '#6D4C41',
      danger: '#DC2626',
      primary: '#2E7D32',
      buttonText: '#FFFFFF',
      roundness: 16,
    });
  });

  it('forwards onReset and fallback props', () => {
    const onReset = jest.fn();
    const fallback = jest.fn();
    render(
      React.createElement(ScreenErrorBoundary, { onReset, fallback }, 'child'),
    );

    const props = SharedScreenErrorBoundary.mock.calls[0][0];
    expect(props.onReset).toBe(onReset);
    expect(props.fallback).toBe(fallback);
  });

  it('forwards children', () => {
    render(
      React.createElement(ScreenErrorBoundary, {}, 'hello'),
    );

    const props = SharedScreenErrorBoundary.mock.calls[0][0];
    expect(props.children).toBe('hello');
  });
});
