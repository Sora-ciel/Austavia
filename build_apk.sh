#!/usr/bin/env bash
# Linux counterpart of build_apk.bat: builds the web app, syncs it into the
# Android project, and builds the signed release APK.
#
# Needs once (see the Linux setup of 2026-10-13):
#   sudo apt install openjdk-21-jdk-headless
#   Android command-line tools in ~/Android/Sdk/cmdline-tools/latest, then
#   sdkmanager --sdk_root=$HOME/Android/Sdk "platform-tools" "platforms;android-35" "build-tools;34.0.0"
#
# Signing uses android/keystore.properties and android/keystore/, which live on
# this drive beside the Windows build -- so an APK built here updates the app
# already on the phone instead of needing it uninstalled.
set -euo pipefail
cd "$(dirname "$0")"

export JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-21-openjdk-amd64}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"

# --staging: "Austavia Staging", pointed at the arial-staging project, for
# trying a pre-release on a phone (asked 2026-10-26). A separate app to Android
# (com.sora.austavia.staging, see app/build.gradle), so it installs beside the
# real one. Built from .env.staging, after the tests.
staging=""
if [ "${1:-}" = "--staging" ]; then staging=1; fi

if [ -n "$staging" ]; then
  npm test
  npm run build:staging
else
  npm run build
fi
npx cap sync android

# The staging app signs in through the staging project's own google-services
# file, swapped in for the build and put back after, like local.properties.
services=android/app/google-services.json
services_backup=""
if [ -n "$staging" ] && [ -f android/app/google-services.staging.json ]; then
  services_backup="$(mktemp)"
  cp "$services" "$services_backup"
  cp android/app/google-services.staging.json "$services"
fi

# android/local.properties names the Windows SDK (E:/Android/Sdk), and Gradle
# trusts it over ANDROID_HOME. The Windows build needs it as it is, so the
# Linux path goes in only for this build and the original is always put back.
props=android/local.properties
backup=""
if [ -f "$props" ]; then
  backup="$(mktemp)"
  cp "$props" "$backup"
fi
restore() {
  if [ -n "$services_backup" ]; then
    cp "$services_backup" "$services"
    rm -f "$services_backup"
  fi
  if [ -n "$backup" ]; then
    cp "$backup" "$props"
    rm -f "$backup"
  else
    rm -f "$props"
  fi
}
trap restore EXIT
echo "sdk.dir=$ANDROID_HOME" > "$props"

if [ -n "$staging" ]; then
  (cd android && ./gradlew assembleRelease -Pstaging)
else
  (cd android && ./gradlew assembleRelease)
fi

echo
echo "APK at android/app/build/outputs/apk/release/app-release.apk"
echo "Copy it to release/ as Austavia_<version>.apk before publishing."
