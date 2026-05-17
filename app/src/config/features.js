// Feature flags — defaults below are the safest fallback if the backend is
// unreachable at boot: core landscaping features ON, social/community paths
// OFF. The fetcher overrides these once the network response lands.
//
// Implementation now lives in @sburson34/mobile-shared/feature-flags so the
// provider/hook plumbing is shared across apps; this file just supplies the
// app-specific defaults and the backend fetcher.

import { useContext } from 'react';
import { createFeatureFlags } from '@sburson34/mobile-shared/feature-flags';
import { getFeatures } from '../api/backendClient';

export const DEFAULT_FEATURES = {
  weatherForecast: true,
  wholeHouseAdvice: true,
  shrubberyAdvice: true,
  diagnose: true,
  community: false,
  quoteRequests: false,
  aiKillSwitch: false,
};

const {
  FeaturesProvider,
  useFeatures,
  FeaturesContext,
} = createFeatureFlags(DEFAULT_FEATURES, {
  fetcher: () => getFeatures(),
});

/**
 * Convenience hook for reading a single flag by name. Returns the boolean
 * value (or undefined if the flag name is unknown).
 */
export const useFeature = (name) => {
  const features = useContext(FeaturesContext);
  return features[name];
};

export { FeaturesProvider, useFeatures };
