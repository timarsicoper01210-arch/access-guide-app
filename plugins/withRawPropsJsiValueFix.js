const { withMainApplication, AndroidConfig, CodeGenerator } = require('expo/config-plugins');

// react-native-vision-camera passes its `previewOutput` prop as a raw JSI
// value (a Nitro HybridObject reference). Fabric's default RawProps
// representation on Android (folly::dynamic) cannot carry that — it hits
// `RawValue.h: function castValue: assertion failed (false)` and crashes
// the moment a <Camera> screen renders, unless React Native's
// `useRawPropsJsiValue` feature flag is enabled.
//
// This can't be set from app.json/expo-build-properties: it's a runtime
// flag, not a build setting, and must be overridden in MainApplication.kt
// before any component renders. It also can't be set with the "obvious"
// one-line override (see below), because loadReactNative() already calls
// ReactNativeFeatureFlags.override() internally with a release-level
// preset that doesn't enable this flag, and that preset class is `final`
// (not `open`) so it can't be subclassed to add just this one flag.
// Fix: reset after loadReactNative() and re-override, using
// ReactNativeNewArchitectureFeatureFlagsDefaults (not the plain
// ReactNativeFeatureFlagsDefaults) so every other New Architecture flag
// (Fabric, TurboModules, Bridgeless) keeps its correct enabled value —
// using the plain defaults class here breaks NitroModules autolinking.
//
// Verified on-device (Android emulator, real compiled APK): without this,
// both the Obstacles and Décrire screens crash on mount. With it, both
// render their camera preview correctly.
const IMPORTS = [
  'com.facebook.react.internal.featureflags.ReactNativeFeatureFlags',
  'com.facebook.react.internal.featureflags.ReactNativeNewArchitectureFeatureFlagsDefaults',
];

const OVERRIDE_CODE = `    ReactNativeFeatureFlags.dangerouslyReset()
    ReactNativeFeatureFlags.override(object : ReactNativeNewArchitectureFeatureFlagsDefaults() {
      override fun useRawPropsJsiValue(): Boolean = true
    })`;

function withRawPropsJsiValueFix(config) {
  return withMainApplication(config, (config) => {
    const { modResults } = config;
    if (modResults.language !== 'kt') {
      throw new Error(
        'withRawPropsJsiValueFix only supports Kotlin MainApplication.kt (got: ' +
          modResults.language +
          ')'
      );
    }

    modResults.contents = AndroidConfig.CodeMod.addImports(modResults.contents, IMPORTS, false);

    const merged = CodeGenerator.mergeContents({
      src: modResults.contents,
      comment: '    //',
      tag: 'raw-props-jsi-value-fix',
      offset: 1,
      anchor: /loadReactNative\(this\)/,
      newSrc: OVERRIDE_CODE,
    });
    modResults.contents = merged.contents;

    return config;
  });
}

module.exports = withRawPropsJsiValueFix;
