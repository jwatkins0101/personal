#!/bin/sh
# Re-scan projects and rebuild INDEX.md. Cards and overrides.json are never overwritten.
set -e
cd "$(dirname "$0")"
node scan-projects.mjs
node build-index.mjs
