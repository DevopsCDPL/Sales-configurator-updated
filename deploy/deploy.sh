#!/bin/bash
# ============================================================
# Forge i-DAS - Deployment Script
# Run this on the EC2 server after initial server-setup.sh
# Usage: bash deploy/deploy.sh
# ============================================================

set -e

APP_DIR="/var/www/forgedas"
DOMAIN="${1:-YOUR_DOMAIN.com}"

echo "=========================================="
echo "  Forge i-DAS - Deploy"
echo "=========================================="

# --- 1. Create directories ---
echo "[1/8] Creating directories..."
mkdir -p $APP_DIR/logs
mkdir -p $APP_DIR/backend/uploads

# --- 2. Install backend dependencies ---
echo "[2/8] Installing backend dependencies..."
cd $APP_DIR/backend
npm ci --omit=dev

# --- 3. Create production .env if not exists ---
if [ ! -f "$APP_DIR/backend/.env" ]; then
    echo "[3/8] ERROR: Backend .env file not found!"
    echo "  Create $APP_DIR/backend/.env with your database credentials first."
    echo "  See deploy/env.backend.example for reference."
    exit 1
else
    echo "[3/8] Backend .env found."
fi

# --- 4. Build frontend ---
echo "[4/8] Building frontend..."
cd $APP_DIR/frontend
npm ci --legacy-peer-deps
REACT_APP_API_URL="/api" npm run build

# --- 5. Setup Nginx ---
echo "[5/8] Configuring Nginx..."

# Replace domain placeholder in nginx config
sed "s/YOUR_DOMAIN.com/${DOMAIN}/g" $APP_DIR/deploy/nginx/forgedas.conf > /etc/nginx/sites-available/forgedas

# Enable site
ln -sf /etc/nginx/sites-available/forgedas /etc/nginx/sites-enabled/forgedas
rm -f /etc/nginx/sites-enabled/default

# Test nginx config (without SSL first - certificates don't exist yet)
# Create a temporary config without SSL for initial setup
cat > /etc/nginx/sites-available/forgedas-temp <<EOF
server {
    listen 80;
    server_name ${DOMAIN} www.${DOMAIN};

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    root ${APP_DIR}/frontend/build;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:5000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        client_max_body_size 50M;
    }

    location /health {
        proxy_pass http://127.0.0.1:5000/health;
    }

    location /uploads/ {
        proxy_pass http://127.0.0.1:5000/uploads/;
    }
}
EOF

# Use temp config first
ln -sf /etc/nginx/sites-available/forgedas-temp /etc/nginx/sites-enabled/forgedas
nginx -t && systemctl reload nginx

# --- 6. Start backend with PM2 ---
echo "[6/8] Starting backend with PM2..."
cd $APP_DIR
pm2 stop forgedas-backend 2>/dev/null || true
pm2 start deploy/ecosystem.config.js
pm2 save

# Set PM2 to start on boot
pm2 startup systemd -u $USER --hp $HOME 2>/dev/null || true

# --- 7. Wait for backend to start ---
echo "[7/8] Waiting for backend to start..."
sleep 5
if curl -s http://localhost:5000/health | grep -q "ok"; then
    echo "  Backend is healthy!"
else
    echo "  WARNING: Backend may not have started properly."
    echo "  Check logs: pm2 logs forgedas-backend"
fi

# --- 8. Setup SSL with Let's Encrypt ---
echo "[8/8] Setting up SSL..."
if [ "$DOMAIN" != "YOUR_DOMAIN.com" ]; then
    certbot --nginx -d ${DOMAIN} -d www.${DOMAIN} --non-interactive --agree-tos --email admin@${DOMAIN} --redirect || {
        echo ""
        echo "  SSL setup failed. You can retry manually:"
        echo "  sudo certbot --nginx -d ${DOMAIN} -d www.${DOMAIN}"
        echo ""
    }

    # Now switch to the full SSL nginx config
    sed "s/YOUR_DOMAIN.com/${DOMAIN}/g" $APP_DIR/deploy/nginx/forgedas.conf > /etc/nginx/sites-available/forgedas
    ln -sf /etc/nginx/sites-available/forgedas /etc/nginx/sites-enabled/forgedas
    nginx -t && systemctl reload nginx

    # Setup auto-renewal
    echo "0 0,12 * * * root certbot renew --quiet --post-hook 'systemctl reload nginx'" > /etc/cron.d/certbot-renew
else
    echo "  Skipping SSL - no domain configured."
    echo "  To setup SSL later, run:"
    echo "  sudo certbot --nginx -d YOUR_DOMAIN -d www.YOUR_DOMAIN"
fi

# --- 9. Create admin user ---
echo ""
echo "Creating admin user..."
cd $APP_DIR/backend
node -e "
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { sequelize, User } = require('./src/models');
(async () => {
  await sequelize.sync();
  const hash = await bcrypt.hash('admin123', 10);
  await User.findOrCreate({
    where: { email: 'admin@forgedas.com' },
    defaults: {
      name: 'Admin User',
      email: 'admin@forgedas.com',
      password_hash: hash,
      role: 'admin',
      is_active: true
    }
  });
  console.log('Admin user ready: admin@forgedas.com / admin123');
  process.exit(0);
})();
"

echo ""
echo "=========================================="
echo "  Deployment Complete!"
echo "=========================================="
echo ""
if [ "$DOMAIN" != "YOUR_DOMAIN.com" ]; then
    echo "  App URL: https://${DOMAIN}"
else
    echo "  App URL: http://$(curl -s ifconfig.me 2>/dev/null || echo 'YOUR_SERVER_IP')"
fi
echo ""
echo "  Login: admin@forgedas.com / admin123"
echo ""
echo "  Useful commands:"
echo "    pm2 status            - Check backend status"
echo "    pm2 logs              - View backend logs"
echo "    pm2 restart all       - Restart backend"
echo "    sudo nginx -t         - Test nginx config"
echo "    sudo systemctl reload nginx  - Reload nginx"
echo "=========================================="
