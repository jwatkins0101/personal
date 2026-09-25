#!/bin/bash
# Log one Google account profile into its own gws config dir (D20).
#   scripts/gws-login.sh <profile>      e.g. owlthat | veryhealth | techunify | personal
# Scopes and folders come from cos/accounts.json, so the command stays short.
set -euo pipefail
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ACC="$REPO_DIR/cos/accounts.json"
id="${1:-}"
[ -n "$id" ] || { echo "usage: $0 <profile>   profiles: $(jq -r '[.accounts[].id]|join(", ")' "$ACC")" >&2; exit 2; }
dir="$(jq -r --arg id "$id" '.accounts[] | select(.id==$id) | .config_dir' "$ACC")"
[ -n "$dir" ] || { echo "unknown profile '$id'. profiles: $(jq -r '[.accounts[].id]|join(", ")' "$ACC")" >&2; exit 2; }
want="$(jq -r --arg id "$id" '.accounts[] | select(.id==$id) | (.email // ("an account @" + .domain))' "$ACC")"
scopes="$(jq -r '.scopes | join(",")' "$ACC")"
dir="${dir/#\~/$HOME}"
mkdir -p "$dir"; chmod 700 "$dir"
[ -f "$dir/client_secret.json" ] || cp -p "$HOME/.config/gws/client_secret.json" "$dir/"
echo "Logging in profile '$id' ($dir)."
echo ">>> In the browser, choose: $want"
GOOGLE_WORKSPACE_CLI_CONFIG_DIR="$dir" gws auth login --scopes "$scopes"
echo
echo "Signed in as: $(GOOGLE_WORKSPACE_CLI_CONFIG_DIR="$dir" gws gmail users getProfile --params '{"userId":"me"}' 2>/dev/null | jq -r '.emailAddress // "unknown"')"
