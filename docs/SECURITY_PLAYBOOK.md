# LandscapeHelper — Security & Abuse Response Playbook

Operational runbook for security incidents, AI cost-runaway events, and the
rotation cadence for keys. A reader should be able to execute every step here
without tribal knowledge.

## Contact

- Disclosure: bursons@gmail.com (mirrored at `/.well-known/security.txt`).
- Primary responder: Stephen.

## Defense layers (current)

| Layer | Location | Toggle |
| --- | --- | --- |
| AI kill-switch (8 AI endpoints) | `Integrations/FeatureFlags.cs` &mdash; `AiKillSwitch` | `AI_KILL_SWITCH=true` env / Secrets Manager |
| Per-IP rate limit on help-request POST (20 / hour) | `Program.cs` &mdash; `AddRateLimiter` policy `help-requests` | hardcoded constant; change & redeploy |
| Per-email rate limit on `/api/account/delete` (5 / day) | account-delete endpoint in `Program.cs` | hardcoded constant |
| Image upload cap (8 MB base64 + MIME allowlist + max 12 photos) | photo-upload validators on AI endpoints | hardcoded |
| SSRF guard on `MediaItem.Url` (https-only; rejects loopback / link-local / RFC1918 / IMDS 169.254.169.254) | `Validation/MediaItemUrlGuard.cs` | always on |
| Weather ZIP validation (5-digit US only) | weather controller | always on |
| `RequireAdmin` JWT-claim gate | admin endpoints &mdash; checks `isAdmin != true` (fixed 2026-05-17) | claim issued at login |
| Security headers (X-Content-Type-Options, Referrer-Policy, X-Frame-Options, Permissions-Policy, COEP) | `Middleware/SecurityHeadersMiddleware.cs` | always on |
| Centralized secrets via `SecretOrEnv` helper (AWS Secrets Manager &rarr; env fallback, dedup) | `Program.cs` | always on |
| Sentry 6.5.0 (mobile + backend) | `Observability/SentrySetup.cs`, `app/src/services/sentry.js` | `SENTRY_DSN` env |
| Correlation / exception-handler / request-log middleware trio | `Middleware/` | always on |

## Immediate levers during an incident

### "OpenAI / Anthropic spend is spiking"

1. Set `AI_KILL_SWITCH=true` in the running container's environment (AWS
   Secrets Manager, or `docker compose` env on the shared host) and trigger a
   restart. All 8 AI endpoints (analyze, ask-helper, whole-house-advice,
   shrubbery-advice, diagnose, clarify, verify-step, plus the photo-batch
   analyzer) return 503 with `{ "error": "AI temporarily disabled" }`.
2. Open Sentry and the CloudWatch dashboard. Identify the top IP / device
   IDs in the last hour.
3. If the offender is narrow, leave the kill-switch on long enough to ship a
   tighter per-IP cap and a ban list, then re-enable.
4. If the offender is wide (distributed scrape), tighten the help-request rate
   limit (see below) and consider lowering the AI-endpoint per-IP cap from its
   default before flipping the switch back off.

### "Help-request POST spam"

The endpoint is rate-limited to **20 / hour / IP** (`Program.cs` policy
`help-requests`).

1. To tighten in-flight: lower the constant in `Program.cs`, commit, and
   redeploy. There is no env override for this number by design &mdash; a real
   change should leave a paper trail.
2. If you need an instant kill, flip `AI_KILL_SWITCH=true`; help-request POST
   triggers an AI call so the switch covers it.
3. After the storm, scan `help_requests` for entries from the offending IP
   and decide whether to purge them.

### "Image-upload abuse" (giant payloads, repeated uploads)

Caps are: **8 MB base64 per image, MIME allowlist (image/jpeg, image/png,
image/webp, image/heic), max 12 photos per request.**

1. To tighten the byte cap, edit the constant in the photo-upload validator
   and redeploy. Drop to 4 MB first; that covers any reasonable phone photo
   after the mobile-side downscale.
2. The MIME allowlist rejects unknown types at the boundary &mdash; do not
   loosen it without re-reviewing the AI provider's image limits.
3. Confirm Sentry isn't holding photo bytes (it isn't by default; verify the
   `beforeSend` scrubber if you've touched it).

### "Someone is hitting `/api/account/delete` with a script"

Per-email cap is **5 / day**. The endpoint also requires a valid verification
email click before any data is removed.

1. Inspect `data_deletion_requests` for unverified rows from the abuser's
   email pattern.
2. Tighten the constant if needed and redeploy.
3. Verified-but-not-completed rows older than 30 days are an SLA violation
   &mdash; audit weekly.

### "Suspicious outbound URL coming through `MediaItem.Url`"

The SSRF guard rejects non-https schemes, loopback (`127.0.0.0/8`, `::1`),
link-local (`169.254.0.0/16`, including IMDS `169.254.169.254`), and all
RFC1918 ranges (`10/8`, `172.16/12`, `192.168/16`). If you see a bypass in
Sentry:

1. Capture the URL and the request's correlation ID.
2. Add a test reproducing the bypass in
   `backend/LandscapeHelper.Tests/Unit/MediaItemUrlGuardTests.cs`.
3. Patch the guard, deploy, then close the loop in Sentry.

### "Prompt-injection that leaks the system prompt"

1. Update the affected endpoint's `systemPrompt` in `Program.cs` (or the
   helper service) to add an explicit refusal block.
2. Add a regression test in `LandscapeHelper.Tests/Integration/`.
3. While preparing the fix, `AI_KILL_SWITCH=true` is the blast-radius limiter.

### "Admin endpoint accessed by a non-admin"

The `RequireAdmin` policy was previously `== true` against a nullable bool
&mdash; effectively allow-all on legitimate-looking tokens. It is now
`!= true` (fixed 2026-05-17). If you suspect pre-fix abuse:

1. Audit the admin endpoints' access logs (correlation IDs in CloudWatch).
2. Re-issue JWT signing keys (see SECRETS_ROTATION.md &mdash; "JWT signing
   key").

## Layered cost & abuse controls (summary)

```
Mobile client --(rate limit per IP)--> help-request POST
            --(image caps + MIME)----> photo upload
            --(SSRF guard)----------> external URL fetch
            --(AI_KILL_SWITCH gate)--> AI provider
            --(per-email cap)-------> account/delete
```

If any one layer fails open, the next layer should still bound spend. The
kill-switch is the last-resort hard stop.

## New-release checklist (security-relevant)

- [ ] `AI_KILL_SWITCH` defaults to `false` in production env &mdash; documented.
- [ ] `/.well-known/security.txt` `Expires:` is >60 days in the future.
- [ ] `npm audit` and `dotnet list package --vulnerable` are clean.
- [ ] Sentry receives a synthetic crash from both mobile and backend after
      deploy.
- [ ] Privacy policy + ToS effective date matches the release date if the
      data flows changed.
- [ ] Rate-limit constants in `Program.cs` reviewed; if loosened, justified
      in the PR description.

## Auditing deletion receipts

```sql
-- Pending verifications >30 min old (cruft to clean up)
SELECT "Id", "RequestId", "CreatedAt"
FROM "DataDeletionRequests"
WHERE "Status" = 'pending_verification'
  AND "VerificationCodeExpiresAt" < now();

-- Verified but not completed (30-day SLA clock is ticking)
SELECT "Id", "RequestId", "VerifiedAt"
FROM "DataDeletionRequests"
WHERE "Status" = 'verified';
```

The 30-day SLA starts at `VerifiedAt`.

## When to escalate

- AI spend in 24 h exceeds **2x rolling 7-day average**: kill-switch on, then
  diagnose.
- Any successful read of an admin endpoint by a non-admin token: rotate JWT
  signing key immediately (see SECRETS_ROTATION.md).
- SSRF bypass evidence in Sentry: kill-switch on AI endpoints that accept
  `MediaItem.Url` until patched.
