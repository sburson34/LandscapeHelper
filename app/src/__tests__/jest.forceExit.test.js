// Regression: a leaked react-native Animated.timing setTimeout callback that
// never drains in the jest mock environment caused a 20-minute CI stall
// (PianoHelper #20). The fix is `forceExit: true` in jest.config.js. These
// tests pin that config and prove an un-drained animation does not block the
// test from completing.

const React = require('react');
const { Animated } = require('react-native');
const { render } = require('@testing-library/react-native');

const config = require('../../jest.config.js');

describe('jest forceExit guard against leaked Animated timers', () => {
  it('jest.config.js sets forceExit so leaked timers cannot hang the suite', () => {
    expect(config.forceExit).toBe(true);
  });

  it('keeps setupFilesAfterEnv (not setupFiles) and the test glob intact', () => {
    expect(config.setupFilesAfterEnv).toEqual(['./jest.setup.js']);
    expect(config.setupFiles).toBeUndefined();
    expect(config.testMatch).toEqual(['**/src/__tests__/**/*.test.js']);
  });

  it('a rendered Animated.timing that is started but never drained still lets the test finish', () => {
    const opacity = new Animated.Value(0);
    const onDone = jest.fn();

    function Fader() {
      React.useEffect(() => {
        // Deliberately long and never awaited: the timer is leaked on purpose.
        Animated.timing(opacity, {
          toValue: 1,
          duration: 60 * 60 * 1000,
          useNativeDriver: false,
        }).start(onDone);
      }, []);
      return React.createElement(Animated.View, { testID: 'fader', style: { opacity } });
    }

    const { getByTestId } = render(React.createElement(Fader));

    expect(getByTestId('fader')).toBeTruthy();
    // The animation has not completed (its timer is still pending), yet the
    // test body returns synchronously rather than waiting on it.
    expect(onDone).not.toHaveBeenCalled();
  });
});
