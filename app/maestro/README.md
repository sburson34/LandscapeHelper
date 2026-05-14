# Maestro flows

End-to-end UI smoke flows for Landscape Helper. Run them locally via
[Maestro Studio](https://maestro.mobile.dev/) or against an Android emulator
in CI through `.github/workflows/e2e-maestro.yml`.

## Flow inventory

| File | Network | Purpose |
| --- | --- | --- |
| `smoke-launch.yaml` | offline | App launches without the error boundary triggering. Canary for build-time regressions. |
| `login.yaml` | live backend | Sign-in via Settings -> Account. Confirms the Delete-account button is rendered when signed in. |
| `settings.yaml` | offline | Drawer -> Settings -> nav back. Covers the dark-mode toggle round-trip. |
| `shrubbery-analyze.yaml` | live backend + OpenAI key | Drawer -> Shrubbery Helper -> ZIP + notes -> result screen. |
| `whole-house-analyze.yaml` | live backend + OpenAI key | New Project -> Whole House -> budget + ideas -> result screen. |

## Running locally

```bash
# One-time install
curl -Ls "https://get.maestro.mobile.dev" | bash

# From the app/ directory:
maestro test maestro/smoke-launch.yaml
```

For the network-dependent flows, either run the backend locally with
`run-backend.ps1` and use `adb reverse tcp:5232 tcp:5232`, or point
`API_BASE_URL` at the staging environment.

## CI

`smoke-launch`, `login`, and `settings` run on every manual `e2e-maestro`
dispatch. `shrubbery-analyze` and `whole-house-analyze` run only when the
workflow's `run_golden_path` input is set to `true`.

## Conventions

- One user intent per file. Keep files short — long flows are hard to debug
  when they fail mid-run.
- Prefer **text matchers** over index-based matchers so flows survive minor
  layout shifts.
- Use `optional: true` on `id:` matchers so we can wire test IDs gradually
  without breaking existing flows.
- Network-dependent flows use `extendedWaitUntil` with generous timeouts
  (90-120 s) because vision-model latency varies.
