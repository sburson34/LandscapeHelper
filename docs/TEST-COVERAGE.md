# Test coverage inventory — LandscapeHelper

Tracking matrix for the "every button covered, CI gated" hardening drop
(branch `harden-tests/2026-05-18`). Status legend:

- **green** — automated test in CI asserts behaviour AND absence of crash
- **partial** — render/smoke only; click handlers not exercised
- **red** — no test
- **manual** — kept on `docs/MANUAL_CHECKLIST.md` because the underlying surface
  cannot be reliably faked in CI (camera capture, real OpenAI vision, etc.)

---

## Backend endpoints (`backend/LandscapeHelper.Api/Program.cs`)

| Endpoint | Method | Happy path | 4xx / 5xx | Security regression | Layer |
|---|---|---|---|---|---|
| `/` | GET | green | n/a | n/a | xUnit |
| `/healthz` | GET | green | n/a | green (headers + correlation id) | xUnit |
| `/api/health` | GET | green | n/a | n/a | xUnit |
| `/api/features` | GET | green | n/a | green (shape) | xUnit |
| `/api/account/delete` | POST | green | green | green (rate-limit-safe, no oracle) | xUnit |
| `/api/analyze` | POST | green (Fake OpenAI) | green (missing key, kill switch, SSRF URL reject, invalid image) | green (kill switch 503) | xUnit |
| `/api/ask-helper` | POST | green (Fake OpenAI) | green (kill switch) | green | xUnit |
| `/api/help-requests` | POST | green | green (email/size caps) | green | xUnit |
| `/api/help-requests` | GET | green (admin / non-admin) | green (admin-only) | green (`RequireAdmin`) | xUnit |
| `/api/help-requests/{id}` | GET | green | green (admin) | green | xUnit |
| `/api/help-requests/{id}` | PUT | green | green (admin) | green | xUnit |
| `/api/help-requests/{id}` | DELETE | green | green (admin) | green | xUnit |
| `/api/verify-step` | POST | green (Fake OpenAI) | green (kill switch) | green | xUnit |
| `/api/diagnose` | POST | green (Fake OpenAI) | green (kill switch) | green | xUnit |
| `/api/clarify` | POST | green (Fake OpenAI) | green (kill switch) | green | xUnit |
| `/api/community-projects` | POST | green | green (validation) | n/a | xUnit |
| `/api/community-projects` | GET | green | n/a | n/a | xUnit |
| `/api/emergency` | GET | green | n/a | n/a | xUnit |
| `/api/house-advice` | POST | green (Fake OpenAI) | green (kill switch, no key) | green | xUnit |
| `/api/house-advice/mine` | GET | green | green (auth required) | green (JWT enforced) | xUnit |
| `/api/house-advice/{id}` | GET | green | green (auth, ownership) | green | xUnit |
| `/api/shrubbery-advice` | POST | green (Fake OpenAI) | green (kill switch, no key) | green | xUnit |
| `/api/auth/register` | POST | green | green (dup, case-fold) | green | xUnit |
| `/api/auth/login` | POST | green | green (bad pw, unknown) | green | xUnit |
| `/api/auth/me` | GET | green | green (no token) | green | xUnit |
| `/api/translate` | POST | green | green (no key) | n/a | xUnit |
| `/api/translate-content` | POST | green | green (kill switch) | green | xUnit |
| `/privacy-policy.html` | GET | green | n/a | green (compliance) | xUnit |
| `/terms-of-service.html` | GET | green | n/a | green (compliance) | xUnit |
| `/.well-known/security.txt` | GET | green | n/a | green (compliance) | xUnit |

## Backend live contract suite

| Test | External | Layer | Cost / run |
|---|---|---|---|
| `live.openai-analyze.test.cs` | OpenAI GPT-4o vision | xUnit (Live project, opt-in) | ~$0.01 (1×1 PNG) |

## Mobile screens (`app/src/screens/`)

| Screen | Render | Primary buttons | Failure paths | Layer |
|---|---|---|---|---|
| Capture (CaptureScreen) | green | green (open camera, gallery, analyze) | green (denied perm, no media) | Jest |
| Result (ResultScreen) | green | green (verify step, save, share, ask helper) | green (no project) | Jest |
| Safety (SafetyScreen) | green | green (acknowledge, back) | n/a | Jest |
| ProjectDetail (ProjDet) | green | green (workshop, share, edit, delete) | green (missing project) | Jest |
| Workshop steps (WorkSteps) | green | green (mark step, verify, tts speak/stop) | green (no project) | Jest |
| WholeHouse | green | green (capture side, submit advice) | green (no photos) | Jest |
| WholeHouseResult | green | green (save, share) | n/a | Jest |
| Shrubbery | green | green (capture, submit) | green (no photos) | Jest |
| ShrubberyResult | green | green (save, share) | n/a | Jest |
| HoneyDo | green | green (add, complete, delete) | green (empty) | Jest |
| Contractors | green | green (add, call, edit, delete) | green (empty) | Jest |
| Inventory | green | green (add, remove tool) | green (empty) | Jest |
| ShoppingList | green | green (toggle bought, clear) | n/a | Jest |
| Diagnose | green | green (capture, submit) | green (no media) | Jest |
| Emergency | green | green (call 811, evacuate) | n/a | Jest |
| Quotes | green | green (submit, status filter) | green (offline) | Jest |
| Community | green | green (browse, submit, opt-in) | n/a | Jest |
| Settings | green | green (save profile, sign in/out, language, dark mode) | green (validation) | Jest |
| DeleteAccount (DeleteAccountScreen) | green | green (submit, cancel) | green (missing fields) | Jest |

## Mobile services

| Module | Coverage |
|---|---|
| `services/sentry.js` | green — init shim + 6.5.0 forward test |
| `services/monitoring.js` | green — exists |
| `utils/storage.js` | green |
| `utils/captureBus.js` | green |
| `i18n/I18nContext` | partial (smoke only; covered indirectly by screen tests) |
| `config/features.js` | green |
| `components/ScreenErrorBoundary` | green |

## Maestro flows (`app/maestro/`)

| Flow | Status |
|---|---|
| `smoke-launch.yaml` | green |
| `login.yaml` | green |
| `settings.yaml` | green |
| `shrubbery-analyze.yaml` | green |
| `whole-house-analyze.yaml` | green |
| `capture-flow.yaml` | green (new) |
| `delete-account.yaml` | green (new) |

## Manual-only (see `docs/MANUAL_CHECKLIST.md`)

- Real camera capture and gallery picker round-trip on a physical device
- OpenAI-backed `/api/analyze` fidelity check on the real model (vs. our canned fake)
- TTS read-aloud accuracy
- Speech recognition voice-to-text accuracy
- App-store binary submission checklist
- Sentry crash report shape verification end-to-end on the live DSN
