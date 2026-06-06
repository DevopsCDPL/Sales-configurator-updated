#!/bin/bash
# ============================================================
# Forge i-DAS - DigitalOcean Droplet Setup Script
# Run this on a fresh Ubuntu 22.04/24.04 Droplet
# Usage: sudo bash server-setup.sh
# ============================================================

set -e

echo "=========================================="
echo "  Forge i-DAS - Server Setup"
echo "=========================================="

# --- 1. System Update ---
echo "[1/7] Updating system packages..."
apt update && apt upgrade -y

# --- 2. Install Node.js 20.x ---
echo "[2/7] Installing Node.js 20.x..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
echo "Node.js version: $(node -v)"
echo "npm version: $(npm -v)"

# Install PM2 globally
npm install -g pm2

# --- 3. Install PostgreSQL 16 ---
echo "[3/7] Installing PostgreSQL 16..."
sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add -
apt update
apt install -y postgresql-16

# Start and enable PostgreSQL
systemctl start postgresql
systemctl enable postgresql

# --- 4. Configure PostgreSQL ---
echo "[4/7] Configuring PostgreSQL..."
DB_PASSWORD=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 20)

sudo -u postgres psql <<EOF
ALTER USER postgres WITH PASSWORD '${DB_PASSWORD}';
CREATE DATABASE forgedas;
EOF

echo ""
echo "============================================"
echo "  DATABASE PASSWORD: ${DB_PASSWORD}"
echo "  Save this password! You will need it."
echo "============================================"
echo ""

# --- 5. Install Nginx ---
echo "[5/7] Installing Nginx..."
apt install -y nginx
systemctl start nginx
systemctl enable nginx

# --- 6. Install Certbot for SSL ---
echo "[6/7] Installing Certbot for SSL..."
apt install -y certbot python3-certbot-nginx

# --- 7. Configure Firewall ---
echo "[7/7] Configuring firewall..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw allow 5000/tcp
ufw --force enable

# --- Create app directory ---
mkdir -p /var/www/forgedas
chown -R $SUDO_USER:$SUDO_USER /var/www/forgedas

echo ""
echo "=========================================="
echo "  Server Setup Complete!"
echo "=========================================="
echo ""
echo "  Next steps:"
echo "  1. Save the database password above"
echo "  2. Upload your app to /var/www/forgedas"
echo "  3. Run the deploy script: bash deploy/deploy.sh"
echo ""
echo "  PostgreSQL: localhost:5432"
echo "  Database: forgedas"
echo "  DB Password: ${DB_PASSWORD}"
echo "=========================================="
