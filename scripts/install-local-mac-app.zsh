#!/bin/zsh
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ARCH="$(uname -m)"
BUILD=false
VARIANT="release"
SOURCE=""
OPEN_APP=true
TARGET_DIR="/Applications"

usage() {
  cat <<'USAGE'
Usage:
  scripts/install-local-mac-app.zsh [options]

Options:
  --build             Build a macOS DMG first, then clean-install it.
  --variant VALUE     Build variant: release or local. Default: release.
  --arch VALUE        Build arch: arm64, x64, or universal. Default: current Mac arch.
  --source PATH       Install from an existing .dmg or .app.
  --target-dir PATH   Install directory. Default: /Applications.
  --no-open           Do not launch the app after installing.
  -h, --help          Show this help.

Examples:
  scripts/install-local-mac-app.zsh --build --variant local
  scripts/install-local-mac-app.zsh --source release/Up.computer-0.0.24-arm64.dmg
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --build)
      BUILD=true
      shift
      ;;
    --variant)
      VARIANT="${2:-}"
      shift 2
      ;;
    --arch)
      ARCH="${2:-}"
      shift 2
      ;;
    --source)
      SOURCE="${2:-}"
      shift 2
      ;;
    --target-dir)
      TARGET_DIR="${2:-}"
      shift 2
      ;;
    --no-open)
      OPEN_APP=false
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This script only works on macOS." >&2
  exit 2
fi

case "$ARCH" in
  arm64|x64|universal) ;;
  x86_64) ARCH="x64" ;;
  *)
    echo "Unsupported arch: $ARCH" >&2
    exit 2
    ;;
esac

case "$VARIANT" in
  release|local) ;;
  *)
    echo "Unsupported variant: $VARIANT" >&2
    exit 2
    ;;
esac

if [[ "$BUILD" == true ]]; then
  cd "$PROJECT_ROOT"
  echo "Building macOS $ARCH $VARIANT DMG from Terminal..."
  node scripts/build-desktop-artifact.ts \
    --platform mac \
    --target dmg \
    --arch "$ARCH" \
    --variant "$VARIANT" \
    --verbose
fi

if [[ -z "$SOURCE" ]]; then
  search_dir="$PROJECT_ROOT/release"
  [[ "$VARIANT" == "local" ]] && search_dir="$PROJECT_ROOT/release-local"
  SOURCE="$(ls -t "$search_dir"/*.dmg 2>/dev/null | head -n 1 || true)"
fi

if [[ -z "$SOURCE" ]]; then
  echo "No source app/DMG found. Pass --source PATH or use --build." >&2
  exit 2
fi

SOURCE="$(cd "$(dirname "$SOURCE")" && pwd)/$(basename "$SOURCE")"
if [[ ! -e "$SOURCE" ]]; then
  echo "Source does not exist: $SOURCE" >&2
  exit 2
fi

mount_point=""
tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/up-local-install.XXXXXX")"
cleanup() {
  if [[ -n "$mount_point" ]]; then
    hdiutil detach "$mount_point" -quiet || true
  fi
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

if [[ "$SOURCE" == *.dmg ]]; then
  echo "Mounting $SOURCE..."
  attach_output="$(hdiutil attach "$SOURCE" -nobrowse -readonly)"
  mount_point="$(printf '%s\n' "$attach_output" | sed -n 's#^.*\(/Volumes/.*\)$#\1#p' | tail -n 1)"
  if [[ -z "$mount_point" || ! -d "$mount_point" ]]; then
    echo "Could not find mounted volume for $SOURCE" >&2
    exit 1
  fi
  app_source="$(find "$mount_point" -maxdepth 1 -name '*.app' -type d -print -quit)"
else
  app_source="$SOURCE"
fi

if [[ -z "${app_source:-}" || ! -d "$app_source" || "$app_source" != *.app ]]; then
  echo "Source is not a .app bundle: ${app_source:-<empty>}" >&2
  exit 1
fi

app_name="$(basename "$app_source")"
dest_app="$TARGET_DIR/$app_name"
tmp_app="$tmp_dir/$app_name"
backup_app="$TARGET_DIR/$app_name.provenance-backup-$(date +%Y%m%d-%H%M%S)"

echo "Copying app without extended attributes..."
/usr/bin/ditto --noextattr --noqtn "$app_source" "$tmp_app"

sample_total=0
sample_tagged=0
while IFS= read -r -d '' pathname; do
  sample_total=$((sample_total + 1))
  if xattr -p com.apple.provenance "$pathname" >/dev/null 2>&1; then
    sample_tagged=$((sample_tagged + 1))
  fi
  [[ "$sample_total" -ge 1000 ]] && break
done < <(find "$tmp_app" -xdev -print0)

if [[ "$sample_tagged" -ne 0 ]]; then
  echo "Clean copy still has provenance tags: $sample_tagged tagged / $sample_total checked" >&2
  exit 1
fi

echo "Stopping existing $app_name processes..."
if [[ -d "$dest_app" ]]; then
  pids="$(pgrep -f "$dest_app/Contents/" || true)"
  if [[ -n "$pids" ]]; then
    printf '%s\n' "$pids" | xargs kill -TERM || true
    sleep 5
  fi
fi

mkdir -p "$TARGET_DIR"
if [[ -d "$dest_app" ]]; then
  echo "Backing up existing app to $backup_app"
  mv "$dest_app" "$backup_app"
fi

echo "Installing $app_name to $TARGET_DIR"
mv "$tmp_app" "$dest_app"

echo "Verifying installed app metadata..."
sample_total=0
sample_tagged=0
while IFS= read -r -d '' pathname; do
  sample_total=$((sample_total + 1))
  if xattr -p com.apple.provenance "$pathname" >/dev/null 2>&1; then
    sample_tagged=$((sample_tagged + 1))
  fi
  [[ "$sample_total" -ge 1000 ]] && break
done < <(find "$dest_app" -xdev -print0)
echo "provenance sample: $sample_tagged tagged / $sample_total checked"

echo "codesign check:"
codesign --verify --deep --strict --verbose=2 "$dest_app" 2>&1 || true

echo "Gatekeeper check:"
spctl -a -vvv -t execute "$dest_app" 2>&1 || true

if [[ "$OPEN_APP" == true ]]; then
  echo "Launching $dest_app"
  open -n "$dest_app"
fi

echo "Done."
