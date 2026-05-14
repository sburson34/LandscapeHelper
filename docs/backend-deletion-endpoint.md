# Backend contract: `POST /api/account/delete`

The privacy policy commits to deleting server-side user data within 30 days
of a verified request. The app calls this endpoint from
**Settings -> Delete account**, which routes to `DeleteAccountScreen`.

## Request

```
POST /api/account/delete
Content-Type: application/json
X-Correlation-ID: <uuid>           (added by CorrelationIdMiddleware if missing)
X-App-Version: landscapehelper@1.0.0 (commit)
Authorization: Bearer <jwt>        (optional — present if the user was signed in)

{
  "name":  "optional string",
  "email": "optional string",
  "phone": "optional string"
}
```

At least one of `email` or `phone` must be present. The app refuses to call
this endpoint without contact info (there would be no identifier to match on).

## Response

Success (request recorded, queued for verification):
```json
{ "status": "pending_verification", "requestId": "uuid" }
```
Status: `200 OK`.

Rejection (malformed input, no contact info):
```json
{ "error": "email or phone required" }
```
Status: `400 Bad Request`.

Any other failure is treated by the client as "endpoint unreachable" — the
user is shown a generic error and asked to retry. Don't rely on specific 5xx codes.

## Expected backend behavior

1. **Persist.** Write a `DataDeletionRequests` row with status
   `pending_verification`, the supplied contact info, the inferred user-id
   (from the JWT `sub` claim if signed in), the client IP, and the correlation
   ID. The schema is created idempotently in the provider-aware DDL block in
   `Program.cs` for both Postgres and SQLite.
2. **Verification.** Anyone can type any email — treat the request as
   unauthenticated. Out-of-band, email the supplied `email` a one-time
   confirmation link before any wipe runs. Only perform deletion after the
   user clicks through.
3. **Deletion scope.** Once verified, delete every row, file, log, and backup
   entry keyed by the verified email/phone/userId. At minimum:
   - `HouseAdviceSessions` and their `HouseAdvicePhotos` rows for the user.
   - `HelpRequests` rows where `CustomerEmail` / `CustomerPhone` match.
   - The `Users` row itself.
   - Any stored media objects referenced by those rows.
4. **Backup propagation.** Backups contain older copies — purge them on the
   same cadence or rotate within the 30-day SLA.
5. **Audit.** The `DataDeletionRequests` row itself is the audit trail.
   Set `CompletedAt` + `Status='completed'` when the wipe finishes; never
   delete the audit row itself.

## Rate limiting / abuse

- Per-IP cap of 20 requests/day. Over the cap -> silently return a fake
  `requestId` with `status=pending_verification`. The endpoint must not
  become a DoS amplifier or an email-existence oracle.
- (Future) Add a per-email cap of 3/day. Currently only the IP cap is
  enforced; a per-email cap requires that the verification mailer be live
  first so the user has a way to recover from an attacker spamming their
  inbox with deletion-confirmation emails.

## Privacy policy alignment

- SLA: **30 days from verification** (not from submission). Matches the policy.
- The verification step itself isn't disclosed in the policy — that's expected;
  it's industry standard and not something you need to call out.
