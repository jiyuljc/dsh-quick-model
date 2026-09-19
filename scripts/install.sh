#!/usr/bin/env sh
# Install dsh-quick-model into a DSH profile (POSIX).
#
# A thin, embeddable wrapper around the one command that actually installs a
# DSH plugin:
#
#     dsh plugin --profile <profile> add <source>
#
# It adds what a caller embedding this in a larger installer wants: a clear
# failure when `dsh` is missing, an optional post-install verification using the
# package's own contract checks, and the restart reminder that a bundle install
# requires (a profile's bundle list is a boot-time snapshot, so a new bundle is
# never hot-mounted).
#
# Usage:
#   ./install.sh                       # npm name, profile web
#   ./install.sh web github:me/dsh-quick-model
#   ./install.sh web ./dsh-quick-model-1.0.0.tgz
#
# Set SKIP_VERIFY=1 to skip the post-install contract check (needed when
# validate.mjs is not shipped alongside this script).
#
# Exit codes: 0 installed, 1 the install failed, 2 `dsh` is not on PATH,
# 3 installed but the contract check failed.

set -eu

PROFILE="${1:-web}"
SOURCE="${2:-dsh-quick-model}"
SKIP_VERIFY="${SKIP_VERIFY:-0}"

if ! command -v dsh >/dev/null 2>&1; then
    echo "dsh-quick-model: dsh is not on PATH. Install the DeepSeek Harness CLI first." >&2
    exit 2
fi

echo "dsh-quick-model: installing '$SOURCE' into profile '$PROFILE'"
if ! dsh plugin --profile "$PROFILE" add "$SOURCE"; then
    echo "dsh-quick-model: dsh plugin add failed." >&2
    exit 1
fi

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
VALIDATOR="$SCRIPT_DIR/validate.mjs"
DSH_HOME_DIR="${DSH_HOME:-$HOME/.dsh}"
PROFILE_DIR="$DSH_HOME_DIR/profiles/$PROFILE"

if [ "$SKIP_VERIFY" = "1" ] || [ ! -f "$VALIDATOR" ]; then
    [ "$SKIP_VERIFY" = "1" ] || echo "dsh-quick-model: validate.mjs not found; skipping the contract check." >&2
else
    echo "dsh-quick-model: verifying the installed package"
    if ! node "$VALIDATOR" "$PROFILE_DIR" dsh-quick-model; then
        echo "dsh-quick-model: the package installed but failed its contract check." >&2
        echo "Back out with: dsh plugin --profile $PROFILE remove dsh-quick-model" >&2
        exit 3
    fi
fi

cat <<EOF

Installed. RESTART DSH to activate it - a profile's bundle list is read at boot,
so a newly added bundle is not hot-mounted.

Then open Settings -> Models. To remove it later:
  dsh plugin --profile $PROFILE remove dsh-quick-model
EOF
