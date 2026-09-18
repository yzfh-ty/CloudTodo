#!/usr/bin/env bash

# Source this file from a shell before using sdkmanager, adb, or Flutter.
export ANDROID_HOME="${ANDROID_HOME:-/usr/lib/android-sdk}"
export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$ANDROID_HOME}"

case ":${PATH}:" in
  *:"$ANDROID_HOME/platform-tools":*) ;;
  *) PATH="$ANDROID_HOME/platform-tools:$PATH" ;;
esac
case ":${PATH}:" in
  *:"$ANDROID_HOME/cmdline-tools/latest/bin":*) ;;
  *) PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$PATH" ;;
esac
export PATH
