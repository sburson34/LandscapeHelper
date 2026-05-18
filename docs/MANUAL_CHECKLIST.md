# Manual pre-release checklist — LandscapeHelper

The automated suite (`pr.yml` + `nightly.yml` + `contract.yml`) covers every
endpoint and every primary button. This list captures the surface that
**cannot** be reliably automated, plus the one-time checks every store release
must pass.

Run through this before each App Store / Play Console submission and append a
new dated row at the bottom.

## Camera + media

- [ ] Cold-launch -> **Capture** screen. Tap "Take Photo" — phone camera opens,
      photo is captured, returned to Capture screen with a thumbnail.
- [ ] Tap "Choose from Gallery" — `expo-image-picker` opens, photo selected,
      thumbnail appears.
- [ ] On iOS specifically: verify the privacy-manifest copy in
      `PrivacyInfo.xcprivacy` matches what the system permission dialogs show.

## Voice + speech-recognition

- [ ] Capture screen -> mic button — `expo-speech-recognition` starts listening
      (Android-only path). Speak a sentence; verify the description text
      input populates.
- [ ] Verify TTS read-aloud on WorkSteps screen reads steps correctly via
      `react-native-tts`.

## Real OpenAI analyze

The fake-AI tests (`backend/LandscapeHelper.Tests/Integration/AnalyzeEndpointFakeAiTests.cs`)
pin the post-processing path. They do **not** verify that GPT-4o vision still
returns the JSON shape we expect — provider drift will eventually break us.

- [ ] On a non-prod build with `OPENAI_API_KEY` configured, run a real analyze
      against a real backyard photo. Confirm:
  - `title`, `steps`, `tools_and_materials`, `shopping_links` are all populated
  - `shopping_links` get enriched with `amazon_url` + `homedepot_url` by the
    backend's affiliate-link post-processor
  - The result screen renders without overflow
- [ ] Repeat with `language=es`. Confirm fields are returned in Spanish.

The weekly `contract.yml` job covers a 1×1-pixel canned shot — that pins the
SDK + endpoint compatibility but is too small to catch model-quality regress.

## BLE / location / camera (none, but cross-cutting)

- [ ] **No** stale Location permission prompts on launch. Location is only
      requested when a screen explicitly needs zip-code reverse-geocode.

## Compliance + store metadata

- [ ] `wwwroot/privacy-policy.html` opens from in-app Settings (web link) and
      matches the App Store / Play Console privacy summary.
- [ ] `wwwroot/terms-of-service.html` opens from in-app Settings.
- [ ] `/.well-known/security.txt` resolves on the prod domain.
- [ ] `PrivacyInfo.xcprivacy` declarations match what `expo-camera`,
      `expo-image-picker`, `expo-location`, `expo-speech-recognition`, and
      `@sentry/react-native` actually collect.
- [ ] Sign in -> Settings -> "Delete account" navigates to DeleteAccountScreen.
      Submitting with `DELETE` typed posts to `/api/account/delete` and shows
      "Request received".

## Sentry end-to-end

- [ ] Trigger a hand-thrown error in a dev build with the Sentry DSN
      configured. Confirm event appears in the
      [LandscapeHelper Sentry project](https://sentry.io/) within 30 seconds
      with:
  - Correlation ID matching the backend log line
  - No Authorization / Cookie header values (`[redacted]`)
  - No request body (we set `MaxRequestBodySize=None`)
- [ ] Backend: hit `/api/translate` without a Google key. Confirm Sentry shows
      the 500 with structured stack trace (not in the response body).

## App-store binary checks

- [ ] Production EAS build → APK / AAB → sync to OneDrive via
      `bash ~/WebstormProjects/infrastructure-shared/scripts/sync-apks-to-onedrive.sh`.
- [ ] Confirm production build's `API_BASE_URL` is `https://landscape.diyhelper.org`
      (not localhost).
- [ ] Smoke-test the production binary on a physical device.

## Audit log

| Date | Tester | Pass / fail | Notes |
|---|---|---|---|
| 2026-05-18 | — | not yet run | initial creation; first walkthrough pending |
