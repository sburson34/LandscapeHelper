/**
 * Expo config plugin: copy app/PrivacyInfo.xcprivacy into the generated iOS
 * project so it ships inside the app bundle. Required by App Store Connect
 * since spring 2024 for any binary that uses "required-reason" APIs (every
 * RN app does, via NSUserDefaults / FileManager attributes).
 *
 * Wire it into app.json with:
 *   "expo": { "plugins": ["./plugins/with-privacy-manifest"] }
 *
 * The plugin runs at `expo prebuild` time. EAS Build calls prebuild
 * automatically before xcodebuild, so this picks up automatically there too.
 */
const fs = require('fs');
const path = require('path');
const { withXcodeProject, withDangerousMod } = require('@expo/config-plugins');

const PRIVACY_FILENAME = 'PrivacyInfo.xcprivacy';

/**
 * Step 1: Copy the source PrivacyInfo.xcprivacy into ios/<projectName>/.
 * Uses withDangerousMod because we need direct filesystem access — the
 * xcode-project plugin only manipulates pbxproj entries.
 */
const copyPrivacyManifest = (config) =>
  withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const platformRoot = cfg.modRequest.platformProjectRoot; // ios/
      const projectName = cfg.modRequest.projectName;

      const src = path.join(projectRoot, PRIVACY_FILENAME);
      if (!fs.existsSync(src)) {
        // Don't fail prebuild if the file isn't present — the missing-file
        // case is caught by App Store Connect at upload time, which is a
        // less confusing error to debug than a plugin crash mid-prebuild.
        console.warn(
          `[with-privacy-manifest] ${PRIVACY_FILENAME} not found at ${src} — skipping copy.`,
        );
        return cfg;
      }

      const destDir = projectName
        ? path.join(platformRoot, projectName)
        : platformRoot;
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      const dest = path.join(destDir, PRIVACY_FILENAME);
      fs.copyFileSync(src, dest);
      return cfg;
    },
  ]);

/**
 * Step 2: Add the copied file as a resource in the Xcode project so it ends
 * up in the .app bundle. Idempotent — bails if a reference already exists.
 */
const addPrivacyManifestToXcode = (config) =>
  withXcodeProject(config, (cfg) => {
    const xcodeProject = cfg.modResults;
    const projectName = cfg.modRequest.projectName;
    if (!projectName) return cfg;

    const groupName = projectName;
    const filePathInGroup = PRIVACY_FILENAME;

    // pbxGroupByName returns the parent group node. The file ref lives
    // beside the project's Info.plist.
    const group = xcodeProject.pbxGroupByName(groupName);
    if (!group) {
      console.warn(
        `[with-privacy-manifest] Could not find Xcode group "${groupName}" — privacy manifest not added to bundle.`,
      );
      return cfg;
    }

    const existing = group.children.find(
      (c) => c.comment === PRIVACY_FILENAME,
    );
    if (existing) return cfg;

    xcodeProject.addResourceFile(
      filePathInGroup,
      { target: xcodeProject.getFirstTarget().uuid },
      group,
    );
    return cfg;
  });

module.exports = function withPrivacyManifest(config) {
  config = copyPrivacyManifest(config);
  config = addPrivacyManifestToXcode(config);
  return config;
};
