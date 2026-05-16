# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LandscapeHelper is a full-stack mobile app for AI-powered landscaping / outdoor-project assistance. Users capture photos of an outdoor area, describe what they want (via voice or text), and receive AI-generated step-by-step plans (powered by OpenAI GPT-4o). The app also covers a few adjacent flows: shrubbery recommendations, whole-house exterior advice, contractor quote tracking, a tool inventory, a shopping list, and a "what's wrong?" diagnostic mode.

## Architecture

**Monorepo with two independent projects:**

- **`app/`** — React Native 0.83 + Expo SDK 55 mobile app (JavaScript, not TypeScript)
- **`backend/LandscapeHelper.Api/`** — ASP.NET Core 10.0 minimal API (C#) with EF Core
- **`backend/LandscapeHelper.Tests/`** — xUnit integration tests using `WebApplicationFactory`

The frontend sends base64-encoded images + text descriptions to the backend, which forwards them to OpenAI's GPT-4o vision model and returns structured JSON (title, steps, tools, difficulty, cost, YouTube links, shopping links, safety tips).

### Frontend Architecture (app/)

- **Entry:** `index.js` → `App.js`. Sentry is initialised before any React render via `src/services/sentry.js → initSentry()`.
- **Providers (outermost → in):** `GestureHandlerRootView` → `ThemeProvider` (light/dark, `src/ThemeContext.js`) → `I18nProvider` (`src/i18n/I18nContext.js`) → `NavigationContainer` → `Drawer.Navigator`.
- **Navigation:** Drawer (root) containing a Stack navigator for the capture flow. Drawer routes: `NewProject` (CaptureStack), `HoneyDoList`, `ContractorList`, `Inventory`, `ShoppingList`, `Diagnose`, `ShrubberyHelper`, `Quotes`, `Community`, `Emergency`, `Settings`. Stack routes inside CaptureStack: `Capture → Result → Safety → ProjectDetail → WorkshopSteps → WholeHouse → WholeHouseResult → Shrubbery → ShrubberyResult → DeleteAccount`.
- **Error boundaries:** every top-level screen is wrapped with `ScreenErrorBoundary` (see `withBoundary()` helper in `App.js`) so an unhandled render in one screen shows a "Try again" fallback instead of red-boxing the whole app.
- **API layer:** `src/api/backendClient.js` is the main HTTP client (named exports for each endpoint). `src/config/api.js` resolves `API_BASE_URL` from `__DEV__` — dev uses `http://localhost:5206`, prod uses `https://landscape.diyhelper.org`.
- **Storage:** AsyncStorage with the keys defined at the top of `src/utils/storage.js` — `@honey_do_list`, `@contractor_list`, `@user_profile`, `@tool_inventory`, `@shopping_bought`, `@app_prefs`, `@analyze_cache`, `@help_requests_local`, `@community_opt_in`, `@auth_token`, `@auth_user`. All CRUD helpers live in that one file.
- **Theme:** `src/theme.js` exports `lightTheme` / `darkTheme` and a default `theme` (= light) for legacy imports. Palette is forest-green primary `#2E7D32`, earthy-brown secondary `#5D4037`, lime accent `#C0CA33`. `ThemeContext` switches between the two based on `getAppPrefs().darkMode`.
- **Media:** `expo-camera` (`CameraView`) for in-app capture, `expo-image-picker` for gallery, `expo-speech-recognition` for voice-to-text, `expo-audio` for recording, `react-native-tts` for read-aloud. `react-native-vision-camera` is also installed for advanced capture flows.
- **Observability:** `src/services/sentry.js` (init + nav integration), `src/services/monitoring.js` (perf marks). Sentry's `navigationIntegration` is registered from `App.js`'s `NavigationContainer.onReady`.
- **i18n:** `src/i18n/I18nContext.js` exposes `useTranslation()` returning `{ t, language }`. Strings live in `src/i18n/translations.js`.

### Backend Architecture (backend/LandscapeHelper.Api/)

- **Mostly single-file API:** `Program.cs` contains all minimal-API route handlers (~2050 lines). The only conventional controller is `Controllers/HealthController.cs`.
- **Endpoints (selected):**
  - `GET /healthz`, `GET /api/features`, `GET /` (banner)
  - `POST /api/analyze` (image+text → AI guide), `POST /api/ask-helper` (contextual follow-ups), `POST /api/verify-step`, `POST /api/diagnose`, `POST /api/clarify`
  - `POST /api/help-requests` + `GET/PUT/DELETE /api/help-requests/{id}` (contractor request inbox)
  - `POST /api/house-advice`, `GET /api/house-advice/mine`, `GET /api/house-advice/{id}`
  - `POST /api/shrubbery-advice`
  - `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me` (JWT, used by the optional website history feature)
  - `POST /api/account/delete` (App Store / Play Store compliance — persists a `DataDeletionRequests` row, actual wipe is out-of-band)
  - `POST /api/community-projects`, `GET /api/community-projects`, `GET /api/emergency`
  - `POST /api/translate`, `POST /api/translate-content` (Google Translate, with in-memory cache)
- **Middleware trio** (order matters, see `Program.cs` ~line 374): `CorrelationIdMiddleware` → `ExceptionHandlerMiddleware` → `RequestLoggingMiddleware`. Then `UseCors("MobilePolicy")` → `UseAuthentication` → `UseAuthorization` → `MapControllers`.
- **Database:** EF Core via `Data/AppDbContext.cs`. Provider is chosen at startup from `Database__Provider` env (`sqlite` default, `postgresql` for the shared host). Connection string from `ConnectionStrings__Default`. **Schema is not managed via EF migrations** — `Program.cs` calls `db.Database.EnsureCreated()` then issues raw `CREATE TABLE IF NOT EXISTS` for post-v1 tables (`Users`, `HouseAdviceSessions`, `HouseAdvicePhotos`, `DataDeletionRequests`), with separate SQLite and Postgres branches because the dialects disagree on `AUTOINCREMENT` vs `SERIAL`. Any new table needs both branches.
- **Secrets:** prod reads a single AWS Secrets Manager secret (ARN in `SECRET_ARN` env var) that is a JSON blob with keys `OPENAI_API_KEY`, `GOOGLE_API_KEY`, `JWT_SIGNING_KEY`, `ADMIN_EMAILS`. Each falls back to a same-named env var for local dev. JWT key falls back further to an ephemeral random key (sessions reset on restart).
- **Observability:** `Observability/SentrySetup.cs` registered via `builder.WebHost.UseLandscapeHelperSentry()` (reads `Sentry__Dsn`, no-op when empty).
- **Static content:** `wwwroot/privacy-policy.html`, `wwwroot/terms-of-service.html`, plus `wwwroot/account/` and `wwwroot/admin/` web pages served by `UseDefaultFiles()` + `UseStaticFiles()`.
- **Deployment:** Docker container (`backend/LandscapeHelper.Api/Dockerfile`, multi-stage `sdk:10.0-alpine` → `aspnet:10.0-alpine`, non-root `app` user, EXPOSE 8080). Runs on the shared-host EC2 behind Caddy; image pushed to GHCR by `.github/workflows/deploy.yml`. `infrastructure/cloudformation.yaml` is app-specific resources only.

## Common Commands

### Frontend (run from `app/`)

```bash
npm install                    # install dependencies
npm start                      # start Metro bundler (kills 8081 first)
npm run android                # build and run on Android
npm run ios                    # build and run on iOS
npm test                       # run Jest tests
npm run test:coverage          # Jest with coverage
npm run lint                   # run ESLint
```

There is no top-level `npm` script — work happens inside `app/` or `backend/LandscapeHelper.Api/`.

### Backend (run from `backend/LandscapeHelper.Api/`)

```bash
dotnet run                     # start API on http://localhost:5206
dotnet build                   # build without running
```

### Backend tests (run from `backend/`)

```bash
dotnet test                    # runs LandscapeHelper.Tests (xUnit + WebApplicationFactory)
```

Test fixtures live in `LandscapeHelper.Tests/Infrastructure/ApiFactory.cs`; one integration file per controller in `LandscapeHelper.Tests/Integration/`.

### Phone Proxy for Local Dev

```bash
adb reverse tcp:5206 tcp:5206  # forward phone's localhost:5206 to PC
# or run setup-phone-proxy.ps1 / setup-phone-proxy.bat from the repo root
```

## API Response Shape

`/api/analyze` returns this JSON structure (important when modifying screens that display results):

```json
{
  "title": "", "steps": [], "tools_and_materials": [],
  "difficulty": "easy|medium|hard", "estimated_time": "", "estimated_cost": "",
  "youtube_links": [], "shopping_links": [{"item": "", "url": ""}],
  "safety_tips": [], "when_to_call_pro": []
}
```

`backendClient.analyzeProject()` enriches the request with `skillLevel`, `zip`, and `ownedTools` pulled from AsyncStorage, and on success writes the result to the `@analyze_cache` AsyncStorage key for offline-mode fallback (capped at 30 entries, oldest evicted). On network failure it falls back to that cache and adds `_fromCache: true` to the returned object.

## Key Patterns

- **Navigation params carry data between screens** (e.g., analysis results from Capture → Result → Safety). Avoid storing large media payloads in nav state.
- **Projects saved to AsyncStorage** include a `checkedSteps` map for tracking workshop progress and a `lastActivityAt` ISO timestamp updated on every write — used by `getMostRecentProject()` to power the "Resume" card on the Capture screen.
- **Capture reset is event-driven**: drawer items and the logo header call `requestCaptureReset()` from `src/utils/captureBus.js`; the Capture screen subscribes and decides whether to prompt (focused + dirty) or just clear.
- **The backend extracts JSON from GPT-4o responses by finding first `{` to last `}`** (handles markdown code fences).
- **Video media items are skipped in analysis** (OpenAI vision API limitation) — strip or warn in any new flow that accepts video.
- **Never check `appsettings.Production.json` secrets into source.** Use `SECRET_ARN` (one shared JSON secret) in prod and env vars locally; the loaders in `Program.cs` handle both transparently.
- **Don't add EF migrations.** Until the project switches to a migrations workflow, new tables go in the two raw-SQL branches in `Program.cs` (SQLite + Postgres) so `EnsureCreated` + the idempotent `CREATE TABLE IF NOT EXISTS` block keeps both providers in sync.
- **Affiliate IDs** (Amazon Associate tag, Home Depot Impact ID) are read from env at startup with placeholder defaults — replace via env, not source.
