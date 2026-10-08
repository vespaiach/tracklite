#!/usr/bin/env bash
# Deploys the latest main (M10.2, OPS-002). Usage on the VPS: sudo /opt/tracklite/current/ops/deploy.sh
# Builds a new release beside the live one and migrates the database. It switches to the new release only if
# the migrations succeed. The previous release stays, so ops/rollback.sh can switch back (OPS-004).
set -euo pipefail

root="${TRACKLITE_ROOT:-/opt/tracklite}"
env_file="${TRACKLITE_ENV_FILE:-/etc/tracklite/env}"
repo="${TRACKLITE_REPO:-https://github.com/vespaiach/tracklite.git}"

as_app() { runuser -u tracklite -- env HOME="$root" "$@"; }
# Builds and migrations need the settings too: src/server/db.ts reads them on import.
# shellcheck source=/dev/null
in_release() { (cd "$release" && set -a && . "$env_file" && set +a && as_app "$@"); }

echo "== Fetching main from $repo"
[ -d "$root/repo" ] || as_app git init --quiet --bare "$root/repo"
as_app git -C "$root/repo" fetch --quiet "$repo" main
sha="$(as_app git -C "$root/repo" rev-parse --short FETCH_HEAD)"
release="$root/releases/$(date -u +%Y%m%d%H%M%S)-$sha"
trap 'rm -rf "$release"' EXIT
as_app mkdir "$release"
as_app git -C "$root/repo" archive FETCH_HEAD | as_app tar -x -C "$release"

echo "== Installing and building $sha"
in_release npm ci --no-audit --no-fund
in_release npm run build

echo "== Migrating the database"
old="$(readlink "$root/current" || true)"
if ! in_release npm run db:migrate; then
  echo "Migrations failed, so nothing was switched. Still serving ${old:-no release}." >&2
  exit 1
fi

echo "== Switching to $sha"
ln -sfn "$release" "$root/current"
trap - EXIT
[ -z "$old" ] || ln -sfn "$old" "$root/previous"
systemctl restart tracklite-web tracklite-worker

echo "== Removing releases older than the previous one"
previous="$(readlink "$root/previous" || true)"
for dir in "$root"/releases/*; do
  [ "$dir" = "$release" ] || [ "$dir" = "$previous" ] || rm -rf "$dir"
done

echo "== Checking /health"
if ! curl -fsS --retry 15 --retry-connrefused --retry-delay 2 -o /dev/null http://127.0.0.1:3000/health; then
  echo "Deployed $sha, but /health doesn't answer 200. Switch back with: sudo $root/current/ops/rollback.sh" >&2
  exit 1
fi
echo "Deployed $sha."
