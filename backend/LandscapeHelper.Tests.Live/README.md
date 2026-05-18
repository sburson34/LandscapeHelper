# LandscapeHelper.Tests.Live

Real-network contract tests for the external APIs LandscapeHelper depends on
(currently: OpenAI GPT-4o vision via `/api/analyze`). These tests verify the
production code's expectations against the live service, not against a fake.

## When this runs

- **Weekly** via `.github/workflows/contract.yml` (cron: Mondays 06:00 UTC)
- **Manual** via `gh workflow run contract.yml`

**Never** on PRs. The project is excluded from `LandscapeHelper.slnx` so a
plain `dotnet test` will not pick these up.

## Cost per run

| Test | API | Cost |
|---|---|---|
| `AnalyzeLiveTests.OpenAi_ReturnsValidJson_ForCannedLandscapePrompt` | OpenAI GPT-4o vision | ~$0.01 |

Total: **&lt; $0.05 per scheduled run**, **&lt; $3/yr**.

## Skip semantics

Each test uses `Skip.IfNot(HasCreds, ...)` so the suite passes (with skipped
results) when secrets are absent. A workflow run with no creds is a
**no-op pass**, not a failure.

## Running locally

```bash
export OPENAI_API_KEY=sk-...
cd backend
dotnet test LandscapeHelper.Tests.Live/LandscapeHelper.Tests.Live.csproj
```
