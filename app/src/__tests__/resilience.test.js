// Resilience-pattern smoke tests for the shared fetch-failure helpers from
// `@sburson34/mobile-shared/testing/resilience`. These don't render any of
// LandscapeHelper's screens — they pin that the helpers actually replace
// `global.fetch` with the targeted failure shape so downstream tests (and
// the real `backendClient` retry/abort logic) can lean on them.
//
// As the LandscapeHelper screens grow more fetch-driven UI (offline banners
// on Settings, "sign in again" prompts when a 401 lands on /api/auth/me,
// rate-limit messaging on /api/analyze etc.), replace the helper-level
// checks here with screen-integration assertions per the pattern in the
// TODO block at the bottom of this file.

const {
  offlineFetch,
  authExpiredFetch,
  rateLimitedFetch,
  server503Fetch,
  staleCacheFetch,
} = require('@sburson34/mobile-shared/testing/resilience');

describe('resilience helpers — fetch failure shapes', () => {
  // Each test installs the failure, exercises one fetch call, and asserts
  // the response shape. `restore()` runs in `finally` so an exception in
  // the body of one test can't leak a poisoned `global.fetch` into the
  // next. (Jest's beforeEach/afterEach would also work, but `try/finally`
  // is what the shared package's own README recommends.)

  let originalFetch;
  beforeAll(() => {
    originalFetch = global.fetch;
  });
  afterAll(() => {
    global.fetch = originalFetch;
  });

  test('offlineFetch — first call rejects with a network error', async () => {
    const handle = offlineFetch();
    try {
      await expect(global.fetch('https://api.landscapehelper.test/api/analyze')).rejects.toThrow(
        /network/i,
      );
      expect(handle.calls).toBe(1);
    } finally {
      handle.restore();
    }
  });

  test('authExpiredFetch — returns 401 with unauthorized body for /api/auth/me', async () => {
    const handle = authExpiredFetch();
    try {
      const resp = await global.fetch('https://api.landscapehelper.test/api/auth/me');
      expect(resp.status).toBe(401);
      const body = await resp.json();
      expect(body.error).toBe('unauthorized');
    } finally {
      handle.restore();
    }
  });

  test('rateLimitedFetch — returns 429 + Retry-After for /api/help-requests', async () => {
    // /api/help-requests has a documented 20/hr per-IP rate limit; UI must
    // present a "try again in N seconds" prompt rather than a generic
    // failure when the server pushes back.
    const handle = rateLimitedFetch({ retryAfter: 60 });
    try {
      const resp = await global.fetch('https://api.landscapehelper.test/api/help-requests', {
        method: 'POST',
      });
      expect(resp.status).toBe(429);
      expect(resp.headers.get('Retry-After')).toBe('60');
    } finally {
      handle.restore();
    }
  });

  test('server503Fetch — returns 503 for /api/analyze', async () => {
    const handle = server503Fetch();
    try {
      const resp = await global.fetch('https://api.landscapehelper.test/api/analyze', {
        method: 'POST',
      });
      expect(resp.status).toBe(503);
    } finally {
      handle.restore();
    }
  });

  test('staleCacheFetch — returns 200 with an Age header so UI can flag stale data', async () => {
    // For the offline-tolerant flows (e.g. saved projects on the Home tab),
    // the shared client serves a cached body with the upstream Age header
    // preserved. UI can choose to badge "Showing last-known data" when
    // Age > N.
    const handle = staleCacheFetch({ ageSeconds: 180 });
    try {
      const resp = await global.fetch('https://api.landscapehelper.test/api/projects');
      expect(resp.status).toBe(200);
      expect(resp.headers.get('Age')).toBe('180');
    } finally {
      handle.restore();
    }
  });
});

// TODO(LandscapeHelper): once a screen actually calls fetch (e.g. the
// Settings screen fetching /api/auth/me on focus, or the analyze flow's
// retry path), replace the helper-level checks above with
// screen-integration tests:
//
//   const { renderWithNav } = require('@sburson34/mobile-shared/testing');
//   const { offlineFetch, expectGracefulOfflineHandling } =
//       require('@sburson34/mobile-shared/testing/resilience');
//   const Settings = require('../screens/Settings').default;
//
//   test('Settings screen — shows offline banner when /api/auth/me errors', async () => {
//     const handle = offlineFetch();
//     try {
//       const screen = renderWithNav(Settings);
//       await waitFor(() => expectGracefulOfflineHandling(screen));
//     } finally {
//       handle.restore();
//     }
//   });
