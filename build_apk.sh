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

npm run build
npx cap sync android

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
  if [ -n "$backup" ]; then
    cp "$backup" "$props"
    rm -f "$backup"
  else
    rm -f "$props"
  fi
}
trap restore EXIT
echo "sdk.dir=$ANDROID_HOME" > "$props"

(cd android && ./gradlew assembleRelease)

echo
echo "APK at android/app/build/outputs/apk/release/app-release.apk"
echo "Copy it to release/ as Austavia_<version>.apk before publishing."
