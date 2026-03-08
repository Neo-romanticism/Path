#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-debug}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

if [[ ! -d "android" ]]; then
  echo "[build-android] android project not found. Creating it with Capacitor..."
  npm run cap:add:android
fi

echo "[build-android] syncing Capacitor config..."
npm run cap:sync

cd android

case "$MODE" in
  debug)
    echo "[build-android] building debug APK..."
    ./gradlew assembleDebug
    echo "[build-android] output: android/app/build/outputs/apk/debug/app-debug.apk"
    ;;
  release-apk)
    echo "[build-android] building release APK..."
    ./gradlew assembleRelease
    echo "[build-android] output: android/app/build/outputs/apk/release/app-release-unsigned.apk"
    echo "[build-android] note: this file is unsigned unless signing config is set."
    ;;
  release-aab)
    echo "[build-android] building release AAB..."
    ./gradlew bundleRelease
    echo "[build-android] output: android/app/build/outputs/bundle/release/app-release.aab"
    ;;
  *)
    echo "Usage: bash scripts/build-android.sh [debug|release-apk|release-aab]"
    exit 1
    ;;
esac
