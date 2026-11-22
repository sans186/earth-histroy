#!/usr/bin/env bash
#
# Deploy Earth to the production VPS.
#
# Usage:
#   ./deploy/deploy.sh                  build, verify, upload, then touch nginx only if needed
#   ./deploy/deploy.sh --no-build       upload the dist/ that is already on disk
#   ./deploy/deploy.sh --install-nginx  also replace the site config (staged + tested first)
#
# Environment overrides:
#   EARTH_DEPLOY_SERVER  ssh target        (default deploy@47.101.196.26)
#   EARTH_REMOTE_DIR     server directory  (default /var/www/earth)
#
# The nginx root is $EARTH_REMOTE_DIR/dist, which is exactly where this script
# uploads. The repo-root nginx-earth.conf is the single source of truth and
# deploy/nginx-earth.conf mirrors it; a mismatch between the two aborts the run.
#
# Requirements: rsync and ssh locally, passwordless sudo for the deploy user.
# Nothing here reloads nginx with an untested config: the new file is staged in
# /tmp, parsed inside an http{} wrapper, and only then swapped in, with the old
# file kept as .bak and restored if the live `nginx -t` rejects the result.

set -euo pipefail

note() { printf '[INFO] %s\n' "$1"; }
ok()   { printf '[OK]   %s\n' "$1"; }
warn() { printf '[WARN] %s\n' "$1"; }
fail() { printf '[FAIL] %s\n' "$1" >&2; exit 1; }

usage() {
  sed -n '3,10p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

SERVER="${EARTH_DEPLOY_SERVER:-deploy@47.101.196.26}"
REMOTE_ROOT="${EARTH_REMOTE_DIR:-/var/www/earth}"
REMOTE_DIST="$REMOTE_ROOT/dist"
REMOTE_SITE="/etc/nginx/sites-available/earth"
REMOTE_LINK="/etc/nginx/sites-enabled/earth"
# Snapshots live outside the served tree, next to it, because /var/www is
# root-owned: everything below reaches it through sudo.
BACKUP_DIR="/var/www/earth-backups"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOCAL_DIST="$REPO_ROOT/dist"
CANON_CONF="$REPO_ROOT/nginx-earth.conf"
MIRROR_CONF="$SCRIPT_DIR/nginx-earth.conf"

BUILD=1
INSTALL_NGINX=0
for arg in "$@"; do
  case "$arg" in
    --no-build) BUILD=0 ;;
    --install-nginx) INSTALL_NGINX=1 ;;
    -h|--help) usage; exit 0 ;;
    *) fail "unknown argument: $arg (see --help)" ;;
  esac
done

# Fail before anything is uploaded: rsync --delete against a half-built or empty
# dist/ would wipe the live site and leave nothing to serve.
check_local_artifacts() {
  command -v rsync >/dev/null 2>&1 || fail "rsync is not installed locally"
  command -v ssh >/dev/null 2>&1 || fail "ssh is not installed locally"

  [[ -d "$LOCAL_DIST" ]] || fail "dist/ does not exist; run npm run build first"
  [[ -s "$LOCAL_DIST/index.html" ]] || fail "dist/index.html is missing or empty"
  grep -q 'assets/' "$LOCAL_DIST/index.html" ||
    fail "dist/index.html references no built assets; the build did not finish"
  [[ -d "$LOCAL_DIST/assets" ]] || fail "dist/assets/ is missing"

  local entry
  entry="$(find "$LOCAL_DIST/assets" -maxdepth 1 -type f -name 'index-*.js' -size +100k -print -quit)"
  [[ -n "$entry" ]] ||
    fail "dist/assets holds no index-*.js above 100 kB; the bundle is missing or truncated"

  local files
  files="$(find "$LOCAL_DIST/assets" -maxdepth 1 -type f -size +0c -print | wc -l)"
  [[ "$files" -ge 3 ]] || fail "dist/assets holds only $files non-empty file(s)"

  ok "artifacts: $(du -sh "$LOCAL_DIST" | cut -f1), $(find "$LOCAL_DIST" -type f | wc -l) files"
}

# Two copies of the same config can only be trusted while they still agree.
check_config_mirror() {
  [[ -f "$CANON_CONF" ]] || fail "missing $CANON_CONF"
  [[ -f "$MIRROR_CONF" ]] || fail "missing $MIRROR_CONF"
  if ! diff -q <(grep -v '^[[:space:]]*#' "$CANON_CONF") \
              <(grep -v '^[[:space:]]*#' "$MIRROR_CONF") >/dev/null; then
    warn "$CANON_CONF and $MIRROR_CONF no longer agree on directives"
    fail "reconcile them: nginx-earth.conf is the canonical file, copy its body into deploy/"
  fi
  ok "nginx configs agree"
}

# Keep the previous entry HTML and hashed bundles so a bad build can be undone
# without a rebuild. Only the shell is archived: the data tree is far larger and
# is regenerated from the repository, not from a server snapshot.
backup_remote_shell() {
  ssh "$SERVER" "
    set -e
    mkdir -p '$REMOTE_DIST'
    if [ -f '$REMOTE_DIST/index.html' ]; then
      sudo mkdir -p '$BACKUP_DIR'
      stamp=\$(date -u +%Y%m%dT%H%M%SZ)
      sudo tar -czf '$BACKUP_DIR/shell-'\$stamp'.tar.gz' -C '$REMOTE_DIST' index.html assets
      ls -1t '$BACKUP_DIR'/shell-*.tar.gz 2>/dev/null | tail -n +4 | sudo xargs -r rm -f
      echo \"[OK]   previous shell archived as $BACKUP_DIR/shell-\$stamp.tar.gz\"
    else
      echo '[INFO] no previous build on the server'
    fi"
}

# Replace the site config only when the server has none, or when asked to. The
# server's file is normally owned by certbot, which patched the 443 block; a
# blind overwrite is what turned HTTPS back into plain HTTP before.
install_nginx_config() {
  if ssh "$SERVER" "test -f '$REMOTE_SITE'"; then
    if [[ "$INSTALL_NGINX" -ne 1 ]]; then
      note "nginx site config already present; leaving it untouched"
      note "compare $CANON_CONF with $REMOTE_SITE by hand, or rerun with --install-nginx"
      return
    fi
    warn "replacing the existing site config (a .bak is kept); certbot's 443 block lives here"
  else
    note "no site config on the server yet: first install"
  fi

  scp -q "$MIRROR_CONF" "$SERVER:/tmp/earth-nginx.conf"

  # 1. Parse the staged file inside an http{} wrapper before it replaces
  #    anything. A bare server{} block cannot be tested on its own, and
  #    `nginx -t` against the live tree only proves the old file was valid.
  ssh "$SERVER" "
    set -e
    printf 'pid /tmp/earth-nginx-test.pid;\nerror_log stderr;\nevents {}\nhttp {\n  include /tmp/earth-nginx.conf;\n}\n' > /tmp/earth-nginx-test.conf
    if ! sudo nginx -t -c /tmp/earth-nginx-test.conf -p /tmp 2>&1; then
      rm -f /tmp/earth-nginx-test.conf /tmp/earth-nginx.conf
      echo '[FAIL] staged config rejected by nginx -t; live config untouched' >&2
      exit 1
    fi
    rm -f /tmp/earth-nginx-test.conf" ||
    fail "staged nginx config rejected; nothing on the server was changed"
  ok "staged config parses"

  # 2. Swap it in, keep the old file, and let the live tree decide. If that test
  #    fails the previous file is put back and nginx is never reloaded.
  ssh "$SERVER" "
    set -e
    sudo mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled
    had_old=0
    if sudo test -f '$REMOTE_SITE'; then
      sudo cp -a '$REMOTE_SITE' '$REMOTE_SITE.bak'
      had_old=1
      echo '[OK]   previous config saved as $REMOTE_SITE.bak'
    fi
    sudo install -m 0644 -o root -g root /tmp/earth-nginx.conf '$REMOTE_SITE'
    rm -f /tmp/earth-nginx.conf
    if ! sudo nginx -t; then
      if [ \"\$had_old\" = 1 ]; then
        sudo cp -a '$REMOTE_SITE.bak' '$REMOTE_SITE'
        echo '[WARN] new config rejected by nginx -t; old config restored, nginx NOT reloaded' >&2
      else
        sudo rm -f '$REMOTE_SITE' '$REMOTE_LINK'
        echo '[FAIL] new config rejected by nginx -t; removed, nginx NOT reloaded' >&2
      fi
      exit 1
    fi
    sudo ln -sfn '$REMOTE_SITE' '$REMOTE_LINK'
    sudo systemctl reload nginx
    echo '[OK]   nginx reloaded'" ||
    fail "nginx config install aborted; the previous config was kept when one existed"
}

if [[ "$BUILD" -eq 1 ]]; then
  note "building"
  ( cd "$REPO_ROOT" && npm run build )
fi

check_local_artifacts
check_config_mirror

backup_remote_shell

note "uploading $LOCAL_DIST/ to $SERVER:$REMOTE_DIST/"
rsync -az --delete --human-readable --progress "$LOCAL_DIST/" "$SERVER:$REMOTE_DIST/"
ssh "$SERVER" "test -s '$REMOTE_DIST/index.html'" ||
  fail "upload finished but $REMOTE_DIST/index.html is missing or empty"
ok "upload verified"

install_nginx_config

echo ""
ok "deployed: https://earth.tazume-sans.cn/"
note "rollback: sudo tar -xzf the newest $BACKUP_DIR/shell-*.tar.gz inside $REMOTE_DIST"
note "if the globe stays blank, allow earth.tazume-sans.cn on the Cesium ion token: https://ion.cesium.com/tokens/"
