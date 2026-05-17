// Thin wrapper around the shared ScreenErrorBoundary that injects this
// app's theme. The shared boundary reports via captureException from
// @sburson34/mobile-shared/sentry, which is the same path our local
// monitoring.reportError ultimately uses — so telemetry is preserved.

import React from 'react';
import { ScreenErrorBoundary as SharedScreenErrorBoundary } from '@sburson34/mobile-shared/error-boundary';
import theme from '../theme';

// The previous local boundary hardcoded a red icon (#DC2626) instead of
// using theme.colors.danger. Preserve that intent (red icon reads as
// "error" universally even though the LandscapeHelper danger color is
// the burnt-orange #D84315) by passing #DC2626 explicitly.
const boundaryTheme = {
  background: theme.colors.background,
  text: theme.colors.text,
  textSecondary: theme.colors.textSecondary,
  danger: '#DC2626',
  primary: theme.colors.primary,
  buttonText: '#FFFFFF',
  roundness: theme.roundness.medium,
};

export default function ScreenErrorBoundary(props) {
  return <SharedScreenErrorBoundary theme={boundaryTheme} {...props} />;
}
