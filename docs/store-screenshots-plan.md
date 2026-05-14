# Store Screenshot Capture Plan

Checklist of screenshots needed for App Store / Google Play submission.

## Apple App Store requirements
- **iPhone 6.7" display** (required): 1290 x 2796 px. Min 3, max 10 screenshots.
- **iPhone 6.5" display** (optional but recommended): 1242 x 2688 px or 1284 x 2778 px.
- **iPad Pro 12.9" (3rd gen or later)** (required if app supports iPad — ours does, `supportsTablet: true`): 2048 x 2732 px.

## Google Play requirements
- **Phone screenshots**: min 2, max 8. Min dimension 320px, max 3840px, aspect 16:9 or 9:16.
- **Feature graphic**: 1024 x 500 px (JPG or PNG, no alpha).
- **High-res icon**: 512 x 512 px PNG with alpha.

## Recommended screenshot sequence (5 screens)

Capture in this order — each screen tells part of the story arc.

1. **CaptureScreen** — show photo + voice description flow with a yard
   photo in the carousel. *Caption: "Snap Your Yard"*
2. **ShrubberyResultScreen** — show shrub recommendations with climate
   notes visible. *Caption: "AI Shrub Picks for Your Climate"*
3. **WholeHouseResultScreen** — show the full-property plan with
   suggestions across multiple sides. *Caption: "Whole-House Landscape Plan"*
4. **ResultScreen (Steps tab)** — show a step-by-step landscape project
   (e.g., bed prep, planting, mulching). *Caption: "Step-by-Step Yard Projects"*
5. **HoneyDo / ProjDet** — show saved projects so reviewers see the
   account-history value prop. *Caption: "Save Projects, Track Progress"*

## How to capture

- Use a **real device** or a high-resolution simulator (iPhone 15 Pro Max for 6.7").
- **Seed demo data** so screens aren't empty:
  - Save 2-3 dummy projects to Honey Do list (e.g., "Plant azaleas along driveway", "Re-mulch front beds")
  - Run a real Shrubbery analysis with a stock yard photo so ShrubberyResult has a filled-in plan
  - Run a real Whole House Advice flow with four side-photos so the WholeHouse result has all sections populated
- For voice / audio screens, capture mid-animation if possible (listening indicator visible).
- Status bar should show full battery, full signal, no notifications. On iOS, Xcode can inject a clean status bar via `xcrun simctl status_bar`.
- **Do NOT** include real personal info (name, phone, email) or real address-identifying yard photos in screenshots.

## Feature graphic (Play Store, 1024 x 500)

Suggested composition:
- Left: Landscape Helper logo + tagline "AI Landscaping Assistant"
- Right: phone mockup showing ShrubberyResult or WholeHouseResult
- Background: brand gradient using primary green and accent earth tone

## Tools

- **Screenshot editing**: Figma, Canva, or [Screenshots.pro](https://screenshots.pro) for device mockups + text overlays.
- **Status bar cleanup** (iOS): `xcrun simctl status_bar "iPhone 15 Pro Max" override --time "9:41" --batteryState charged --batteryLevel 100`
- **Android**: Android Studio's Running Devices panel -> take screenshot, or `adb shell screencap -p /sdcard/s.png && adb pull /sdcard/s.png`

## Output directory

Save captures to `docs/store-assets/` (create if missing) organized as:

```
docs/store-assets/
  ios/
    6.7/
      01-capture.png
      02-shrubbery-result.png
      03-wholehouse-result.png
      04-result-steps.png
      05-honeydo.png
    6.5/...
    ipad-12.9/...
  android/
    phone/
      01-capture.png
      ...
    feature-graphic.png
    icon-512.png
```
