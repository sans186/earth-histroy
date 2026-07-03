#!/usr/bin/env bash
#
# Deploy Earth Historical Timeline to production server.
#
# Usage:
#   ./deploy/deploy.sh              # build + upload
#   ./deploy/deploy.sh --no-build   # skip build, upload only
#
# Prerequisites:
#   - SSH key configured for deploy@47.101.196.26
#   - Target directory /var/www/earth/ exists on server
#

set -euo pipefail

SERVER="deploy@47.101.196.26"
REMOTE_DIR="/var/www/earth"
LOCAL_DIST="dist"

# ── Build ──
if [[ "${1:-}" != "--no-build" ]]; then
  echo "==> Building..."
  npm run build
fi

# ── Create remote directory if needed ──
ssh "$SERVER" "mkdir -p $REMOTE_DIR"

# ── Upload ──
echo "==> Uploading to $SERVER:$REMOTE_DIR ..."
rsync -avz --delete --progress "$LOCAL_DIST/" "$SERVER:$REMOTE_DIR/"

# ── Set up nginx ──
echo "==> Setting up nginx..."
scp deploy/nginx-earth.conf "$SERVER:/tmp/nginx-earth.conf"
ssh "$SERVER" "sudo mv /tmp/nginx-earth.conf /etc/nginx/sites-available/earth && sudo ln -sf /etc/nginx/sites-available/earth /etc/nginx/sites-enabled/ && sudo nginx -t && sudo systemctl reload nginx"

echo ""
echo "✅ Deploy complete!"
echo "   Visit: https://earth.tazume-sans.cn/"
echo ""
echo "   ⚠️  Don't forget to:"
echo "   1. Add DNS A record: earth → 47.101.196.26"
echo "   2. Add earth.tazume-sans.cn to Cesium Ion Access Token allowlist"
echo "      → https://ion.cesium.com/tokens/"
