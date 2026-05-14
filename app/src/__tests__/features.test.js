// We don't have @testing-library/react-hooks here so we test the default
// shape + that the backendClient export exists. The FeaturesProvider's
// useEffect-driven fetch is exercised by the screens.smoke test path
// (those tests render the provider for real).

jest.mock('../api/backendClient', () => ({
  getFeatures: jest.fn(() => Promise.resolve({})),
}));

const { getFeatures } = require('../api/backendClient');
const { DEFAULT_FEATURES } = require('../config/features');

describe('FeaturesProvider defaults', () => {
  it('matches the documented default flag set', () => {
    expect(DEFAULT_FEATURES).toEqual({
      weatherForecast: true,
      wholeHouseAdvice: true,
      shrubberyAdvice: true,
      diagnose: true,
      community: false,
      quoteRequests: false,
      aiKillSwitch: false,
    });
  });

  it('core landscaping features are ON by default', () => {
    expect(DEFAULT_FEATURES.shrubberyAdvice).toBe(true);
    expect(DEFAULT_FEATURES.wholeHouseAdvice).toBe(true);
    expect(DEFAULT_FEATURES.diagnose).toBe(true);
  });

  it('social paths are OFF by default until moderation is live', () => {
    expect(DEFAULT_FEATURES.community).toBe(false);
    expect(DEFAULT_FEATURES.quoteRequests).toBe(false);
  });

  it('getFeatures is callable', () => {
    expect(typeof getFeatures).toBe('function');
  });
});
