#!/usr/bin/env bash
# Builds crates/ot to wasm (via wasm-pack) into frontend/src/wasm/<crate>,
# so it can be imported directly as a JS module from the frontend.
#
# Usage: wasm-build.sh <crate-name> [--dev|--release] [--watch]
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

CRATE_NAME=""
PROFILE_FLAG="--dev"
WATCH=false

for arg in "$@"; do
  case "$arg" in
    --release) PROFILE_FLAG="--release" ;;
    --dev) PROFILE_FLAG="--dev" ;;
    --watch) WATCH=true ;;
    -*) echo "Unknown flag: $arg" >&2; exit 1 ;;
    *)
      if [ -n "$CRATE_NAME" ]; then
        echo "Only one crate name may be given (got '$CRATE_NAME' and '$arg')" >&2
        exit 1
      fi
      CRATE_NAME="$arg"
      ;;
  esac
done

if [ -z "$CRATE_NAME" ]; then
  echo "Usage: $0 <crate-name> [--dev|--release] [--watch]" >&2
  exit 1
fi

if ! command -v wasm-pack >/dev/null 2>&1; then
  echo "wasm-pack not found. Install it with: cargo install wasm-pack" >&2
  exit 1
fi

CRATE_DIR="$ROOT_DIR/crates/$CRATE_NAME"
OUT_DIR="$ROOT_DIR/frontend/src/wasm/$CRATE_NAME"

if [ ! -d "$CRATE_DIR" ]; then
  echo "Crate directory not found: $CRATE_DIR" >&2
  exit 1
fi

build() {
  wasm-pack build "$CRATE_DIR" \
    "$PROFILE_FLAG" \
    --target bundler \
    --out-dir "$OUT_DIR" \
    --out-name "$CRATE_NAME" \
    --features wasm
}

build

if [ "$WATCH" = true ]; then
  echo "[wasm-build] watching $CRATE_DIR for changes..."
  WATCH_PATHS=("$CRATE_DIR/src" "$CRATE_DIR/Cargo.toml")
  last_snapshot=""
  if stat -c '%Y %n' "$0" >/dev/null 2>&1; then
    STAT_ARGS=(-c '%Y %n')
  else
    STAT_ARGS=(-f '%m %N')
  fi
  while true; do
    current="$(find "${WATCH_PATHS[@]}" -type f -exec stat "${STAT_ARGS[@]}" {} + 2>/dev/null | sort)"
    if [ "$current" != "$last_snapshot" ]; then
      if [ -n "$last_snapshot" ]; then
        echo "[wasm-build] change detected, rebuilding..."
        build || echo "[wasm-build] build failed, will retry on next change"
      fi
      last_snapshot="$current"
    fi
    sleep 0.5
  done
fi
