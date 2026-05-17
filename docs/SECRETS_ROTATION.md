# LandscapeHelper — Secrets Rotation

Where each secret lives, how to rotate it, and how often. Everything flows
through the `SecretOrEnv` helper in `Program.cs` &mdash; AWS Secrets Manager
is checked first, environment variables are the fallback. Never check a
secret into source.

## Inventory

| Secret | Storage | Consumer | Rotation cadence |
| --- | --- | --- | --- |
| `ConnectionStrings__Default` | AWS Secrets Manager (`landscapehelper/db`) | backend EF Core | rotate the per-app Postgres role password every 180 days, or immediately on staff change |
| `OPENAI_API_KEY` | AWS Secrets Manager (`landscapehelper/openai`) | AI endpoints (8) | every 90 days, or immediately on staff change |
| `ANTHROPIC_API_KEY` | AWS Secrets Manager (`landscapehelper/anthropic`) | AI endpoints (where applicable) | every 90 days |
| `WEATHER_API_KEY` | AWS Secrets Manager (`landscapehelper/weather`) | weather lookup | every 180 days |
| `JWT_SIGNING_KEY` | AWS Secrets Manager (`landscapehelper/jwt`) | auth middleware, `RequireAdmin` gate | every 180 days, **and immediately on any suspected admin-token leak** |
| `Sentry__Dsn` | env var on the host (non-secret in practice, but treat as low-sensitivity) | backend Sentry init | only when project is recreated |
| Mobile `EXPO_PUBLIC_SENTRY_DSN` | EAS secrets | mobile Sentry init | only when project is recreated |
| `AI_KILL_SWITCH` | env var | `FeatureFlags.AiKillSwitch` | toggle as needed; not a rotation target |
| `APP_KEY` (shared-secret header from mobile) | AWS Secrets Manager + EAS build env | `AppKeyMiddleware` | every major release; older clients sunset on schedule |
| GHCR token for deploys | GitHub Actions secret `GHCR_TOKEN` | `deploy.yml` | every 90 days |
| RDS master credentials | AWS Secrets Manager (shared infra) | DBA-only; LandscapeHelper does not read it directly | per infrastructure-shared rotation policy |

`SecretOrEnv` deduplicates: if a name appears in both Secrets Manager and as
an env var, Secrets Manager wins and the env var is ignored. To force the env
var, unset the Secrets Manager entry.

## Standard rotation procedure

1. Generate the new value (`openssl rand -hex 32` for JWT/APP_KEY, provider
   console for third-party API keys, new IAM-managed Postgres password for
   the DB role).
2. **Add** the new value to Secrets Manager as a new version, **without
   removing the old one**. The .NET app reads `AWSCURRENT` so the new version
   becomes the read target.
3. Trigger a rolling restart of the backend container on the shared host
   (`docker compose restart landscapehelper-api`). Health-check
   `https://api-landscape.diyhelper.org/healthz` afterward.
4. Confirm Sentry has no new auth/integration errors over the next 10
   minutes.
5. Move the previous version to `AWSPREVIOUS` (default) and after **24 h** of
   clean operation, schedule its deletion.

## Per-secret notes

### Postgres password (`ConnectionStrings__Default`)

The shared RDS cluster has one role per app. Rotate the role password via the
RDS console or the `infrastructure-shared` rotation script. Update the
Secrets Manager JSON's `Password` field; the connection string is rebuilt at
startup. Coordinate with the once-a-night RDS maintenance window if you can
&mdash; otherwise expect ~5 s of failed requests during the container
restart.

### `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`

Provider-side rotation. Create the new key, paste it into Secrets Manager,
restart, then delete the old key in the provider console. **Do not** delete
the old key before the restart and a smoke test against
`/api/whole-house-advice` &mdash; otherwise live users get 503s.

### `JWT_SIGNING_KEY`

This invalidates every existing token. Communicate the forced re-login in
release notes if you do it outside an incident.

If you rotate during an incident (e.g. suspected admin-token leak):

1. Generate a new key, push to Secrets Manager.
2. Restart the backend.
3. Verify in Sentry that the `RequireAdmin` policy now rejects pre-rotation
   admin tokens.
4. Force a fresh login on the affected admin accounts.

### `APP_KEY`

The mobile build embeds this as `EXPO_PUBLIC_APP_KEY`. Procedure:

1. Generate the new key, store in Secrets Manager.
2. Update `EXPO_PUBLIC_APP_KEY` in the EAS production env.
3. Cut a new mobile build via `eas build --platform android --profile production`
   (and iOS equivalent).
4. Once the new build is live in the stores and >90% of active users have it,
   delete the old key in Secrets Manager. Old installs will see
   `AppKeyMiddleware` reject them &mdash; this is intentional, and is the
   forced-upgrade mechanism for security-relevant releases.

### `WEATHER_API_KEY`

Provider-side rotation. No app-side code change. Restart picks it up.

### Sentry DSNs

Treated as non-secret (they're in the bundle) but rotate the project key if
you suspect it's been used for log injection. Update both backend env and
EAS secret, ship a mobile build, then revoke the old DSN in Sentry.

### GHCR deploy token

GitHub Actions &rarr; Settings &rarr; Secrets &rarr; rotate `GHCR_TOKEN`.
Verify the next `deploy.yml` run pushes successfully.

## On staff change

Rotate **all** of the following within 24 h of departure:

- All Anthropic / OpenAI / weather API keys.
- `JWT_SIGNING_KEY` and `APP_KEY`.
- Postgres role password.
- GHCR deploy token.
- AWS IAM user(s) the departing person had.

Tracking issue template lives at `docs/templates/staff-rotation.md` (TODO if
you need it &mdash; for now, keep a checklist in the incident channel).

## Audit

Every rotation should leave:

- A Secrets Manager version history entry (automatic).
- A line in the `#ops` log: "rotated `<name>` &mdash; reason &mdash; YYYY-MM-DD".
- If incident-driven, a link to the Sentry / CloudWatch evidence.

If anything in this file drifts from reality, that is itself a security bug
&mdash; fix the docs in the same PR as the code change.
