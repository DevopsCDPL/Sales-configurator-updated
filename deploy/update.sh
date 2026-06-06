#!/bin/bash
# ============================================================
# Forge i-DAS - Quick Update Script
# Run this when you push code updates to the server
# Usage: bash deploy/update.sh
# ============================================================

set -e

APP_DIR="/var/www/forgedas"

echo "=========================================="
echo "  Forge i-DAS - Update Deployment"
echo "=========================================="

# --- Update backend ---
echo "[1/4] Updating backend dependencies..."
cd $APP_DIR/backend
npm ci --omit=dev

# --- Rebuild frontend ---
echo "[2/4] Rebuilding frontend..."
cd $APP_DIR/frontend
npm ci --legacy-peer-deps
REACT_APP_API_URL=/api npm run build

# --- Restart backend ---
echo "[3/4] Restarting backend..."
pm2 restart forgedas-backend

# --- Reload Nginx ---
echo "[4/4] Reloading Nginx..."
sudo nginx -t && sudo systemctl reload nginx

# --- Verify ---
sleep 3
if curl -s http://localhost:5000/health | grep -q "ok"; then
    echo ""
    echo "=========================================="
    echo "  Update Complete! Backend is healthy."
    echo "=========================================="
else
    echo ""
    echo "  WARNING: Backend health check failed."
    echo "  Run: pm2 logs forgedas-backend"
fi
