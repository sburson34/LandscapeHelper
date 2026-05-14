// Feature flags — a tiny context that fetches GET /api/features at mount
// time and exposes the current flag set + a useFeature hook.
//
// Defaults below are the safest fallback if the backend is unreachable at
// boot: core landscaping features ON, social/community paths OFF. The
// useEffect fetch overrides these once the network response lands.

import React, { createContext, useContext, useEffect, useState } from 'react';
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

const FeaturesContext = createContext(DEFAULT_FEATURES);

export const FeaturesProvider = ({ children }) => {
  const [features, setFeatures] = useState(DEFAULT_FEATURES);

  useEffect(() => {
    let mounted = true;
    getFeatures()
      .then((f) => {
        if (mounted && f && typeof f === 'object') {
          setFeatures({ ...DEFAULT_FEATURES, ...f });
        }
      })
      .catch(() => {
        // Keep defaults — getFeatures already returns {} on failure but we
        // catch defensively in case the underlying client ever changes.
      });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <FeaturesContext.Provider value={features}>
      {children}
    </FeaturesContext.Provider>
  );
};

/**
 * Convenience hook for reading a single flag by name. Returns the boolean
 * value (or undefined if the flag name is unknown).
 */
export const useFeature = (name) => {
  const features = useContext(FeaturesContext);
  return features[name];
};

/** Hook for reading the whole flag bag. */
export const useFeatures = () => useContext(FeaturesContext);
