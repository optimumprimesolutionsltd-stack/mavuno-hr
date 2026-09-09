#!/usr/bin/env bash
# Render build for the Mavuno HR API.
#
# Why this isn't just `pnpm run build`:
#   pnpm-workspace.yaml strips every esbuild platform package via `overrides`
#   (`esbuild>@esbuild/*: '-'`), so esbuild has to download its native binary
#   from its own postinstall script. That postinstall is gated behind pnpm's
#   build-script approval (`onlyBuiltDependencies`), which does not always run
#   on a fresh CI install. We run esbuild's installer explicitly so the binary
#   is guaranteed to be there before build.mjs invokes esbuild.
set -euo pipefail

echo "→ pnpm install"
pnpm install --frozen-lockfile

echo "→ ensure esbuild native binary"
shopt -s nullglob
for install_js in node_modules/.pnpm/esbuild@*/node_modules/esbuild/install.js; do
  echo "  running ${install_js}"
  ( cd "$(dirname "${install_js}")" && node install.js )
done
shopt -u nullglob

echo "→ bundle api-server"
node artifacts/api-server/build.mjs

echo "✓ build complete: artifacts/api-server/dist/index.mjs"
