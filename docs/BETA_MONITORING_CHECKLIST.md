# Beta monitoring checklist

## What's installed

### Mobile app (React Native)

| Component | What it does |
|---|---|
| `@sentry/react-native` | Native crash capture, unhandled JS exceptions, session tracking |
| `src/services/sentry.js` | Sentry init with `beforeSend`/`beforeBreadcrumb` scrubbing |
| `src/services/monitoring.js` | Public API: `reportError`, `reportHandledError`, `reportWarning`, `addBreadcrumb` |
| `src/config/sentry.js` | DSN resolution (env var -> app.json extra -> hardcoded fallback) |
| `src/components/ScreenErrorBoundary.js` | Per-screen React error boundaries |
| `src/config/features.js` | Feature-flag context, fetched from `GET /api/features` |

### Backend (.NET)

| Component | What it does |
|---|---|
| `CorrelationIdMiddleware` | Reads `X-Correlation-ID` from mobile app, generates one if missing, pushes to log scope, echoes in response |
| `RequestLoggingMiddleware` | Structured log per API request: method, path, status, duration |
| `ExceptionHandlerMiddleware` | Classifies exceptions, logs full details, returns safe JSON with correlation ID |
| `Observability/SentrySetup.cs` | Wires `Sentry.AspNetCore` with DSN from the `Sentry__Dsn` env var |
| `Integrations/FeatureFlags.cs` | Env-driven flag registry, exposed at `GET /api/features` |

---

## Required environment variables

### Mobile app (build-time)

| Variable | Required? | Purpose |
|---|---|---|
| `EXPO_PUBLIC_SENTRY_DSN` | No (hardcoded fallback in app.json) | Sentry DSN override |
| `EXPO_PUBLIC_APP_ENV` | Yes for beta builds | Set to `beta` for 20% trace sample rate |
| `EXPO_PUBLIC_GIT_COMMIT` | Optional | `$(git rev-parse --short HEAD)` — tagged in Sentry release |
| `SENTRY_AUTH_TOKEN` | Yes for release builds | Uploads source maps. Scopes: `project:releases`, `org:read` |
| `SENTRY_ORG` | Yes for release builds | Sentry organization slug |
| `SENTRY_PROJECT` | Yes for release builds | Sentry project slug |

### Backend (runtime)

| Variable | Required? | Purpose |
|---|---|---|
| `ASPNETCORE_ENVIRONMENT` | Yes | Set to `Production` on the shared host |
| `Sentry__Dsn` | Yes | Backend Sentry DSN (already present in the shared host's `secrets/landscapehelper.env`) |
| `ConnectionStrings__Default` | Yes | Postgres connection string in prod |
| `Database__Provider` | Yes | `postgresql` in prod, `sqlite` locally |
| `SECRET_ARN` or `OPENAI_API_KEY` | Yes | OpenAI API key |

---

## Sensitive data exclusions

The following are intentionally never sent to Sentry, logs, or telemetry:

| Data | Where excluded |
|---|---|
| OpenAI API key | Never referenced in any log or telemetry call |
| JWT auth tokens | Scrubbed by mobile `sentry.js` `beforeSend`; never logged in backend middleware |
| Base64 photo payloads | Replaced with `[redacted]:base64(Nb)` in Sentry; backend logs only `imageCount` |
| Full user descriptions / vision text | Backend logs only `descriptionLength`; Sentry scrubs large strings |
| Full AI response text | Backend logs only `responseLength` |
| Raw request/response bodies | Not captured in HTTP breadcrumbs |
| User email / phone | Hashed (first 12 hex) before being logged from `/api/account/delete` |
| Stack traces in client responses | Backend returns safe `{ error, code, correlationId }` in beta/prod; debug block only in Development |

---

## Test plan

### 1. Handled client exception

1. Open the app in dev mode.
2. Throw a handled exception via the debug entry point.
3. In Sentry -> Issues, verify the event has `extra.handled = true` and the expected `source`.

### 2. Unhandled client exception

1. Force an unhandled throw from a render path.
2. The screen's `ScreenErrorBoundary` should show "Something went wrong" with a Try again button.
3. In Sentry, verify breadcrumbs leading up to the throw and `extra.componentStack` are present.

### 3. Failed API request

1. Stop the backend or unplug `adb reverse`.
2. Attempt a Shrubbery or Whole House analysis.
3. The app shows a network error; Sentry should record the failure with the correlation ID echoed in the request header.

### 4. Verify correlation IDs

1. Start the backend with the middleware trio wired in.
2. Submit a Shrubbery analysis.
3. In backend logs, look for the `HTTP POST /api/shrubbery-advice` line with `CorrelationId=<ID>`.
4. Confirm `response.headers['X-Correlation-ID']` matches.

### 5. Error boundary test

1. Temporarily add `throw new Error('boundary test')` to a screen's render.
2. Navigate to that screen; the boundary should render its fallback.
3. In Sentry, verify the event has the screen's `source` and a `componentStack`.

### 6. Backend exception classification

1. Send a malformed JSON body to a real endpoint:
   ```bash
   curl -X POST https://api.landscapehelper.app/api/analyze \
     -H "Content-Type: application/json" -d "not json"
   ```
2. Expect `{ "error": "The request was malformed...", "code": "bad_request", "correlationId": "..." }`.
3. Confirm backend logs include `ErrorCode=bad_request` plus the same correlation ID.

### 7. Account-deletion endpoint

1. POST to `/api/account/delete` with `{ "email": "test@example.com" }`.
2. Verify the response is `{ "status": "pending_verification", "requestId": "<uuid>" }`.
3. POST with no email/phone and expect `400`.
4. Confirm a row in `DataDeletionRequests` is present in the DB with the matching `RequestId`.

---

## Manual setup still needed

### Sentry

- [ ] Confirm the mobile DSN in `app.json` (`expo.extra.sentryDsn`) matches the Sentry project for Landscape Helper.
- [ ] Confirm the backend `Sentry__Dsn` env var is set on the shared host (already noted in the brief).
- [ ] Create an internal auth token with `project:releases` + `org:read` scopes for source map uploads.
- [ ] (Optional) Set up Sentry alert rules.

### Shared host

- [ ] Verify `Database__Provider=postgresql` and `ConnectionStrings__Default` are set.
- [ ] Confirm the new `DataDeletionRequests` table exists after the first deploy (the provider-aware DDL in `Program.cs` creates it idempotently).
- [ ] Set `ASPNETCORE_ENVIRONMENT=Production` in the unit's environment file.

### Source maps (per release)

Build beta APKs with the Sentry env vars exported so the Gradle plugin uploads sourcemaps automatically:
```bash
EXPO_PUBLIC_APP_ENV=beta \
EXPO_PUBLIC_GIT_COMMIT=$(git rev-parse --short HEAD) \
SENTRY_AUTH_TOKEN=... \
SENTRY_ORG=burson-properties \
SENTRY_PROJECT=landscape-helper \
cd app/android && ./gradlew assembleRelease
```
