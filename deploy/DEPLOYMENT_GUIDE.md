# Forge i-DAS - Production Deployment Guide (DigitalOcean)

## Architecture

```
Internet → Nginx (SSL/443) → React Frontend (static files)
                            → Backend API (proxy to :5000)
                            → PostgreSQL (localhost:5432)
```

All running on a single DigitalOcean Droplet (~$6-12/month).

---

## Step 1: Create a DigitalOcean Droplet

1. Sign up at [digitalocean.com](https://www.digitalocean.com/)
2. Click **Create → Droplets**
3. Configure:
   - **Region**: Choose closest to your users (e.g., Bangalore)
   - **Image**: **Ubuntu 24.04 LTS**
   - **Size**: **Basic → Regular** → **$6/month** (1 vCPU, 1 GB RAM)
     - For production with more users, pick **$12/month** (2 GB RAM)
   - **Authentication**: Choose **SSH Key** (recommended)
     - If you don't have one, click **New SSH Key** and follow the instructions
     - Or choose **Password** (less secure)
   - **Hostname**: `forgedas-server`

4. Click **Create Droplet**
5. Note the **IP address** (e.g., `164.90.xx.xx`)

---

## Step 2: Point Your Domain (Optional but needed for SSL)

1. Buy a domain (Namecheap, GoDaddy, etc.)
2. In DigitalOcean: Go to **Networking → Domains** → Add your domain
3. Add DNS records:
   - `A` record: `@` → `164.90.xx.xx` (your Droplet IP)
   - `A` record: `www` → `164.90.xx.xx`
4. Update your domain registrar's nameservers to DigitalOcean's:
   - `ns1.digitalocean.com`
   - `ns2.digitalocean.com`
   - `ns3.digitalocean.com`
5. Wait for DNS propagation (5-30 minutes)

---

## Step 3: Connect to Your Droplet via SSH

From PowerShell on your Windows machine:

```powershell
# If using SSH key
ssh root@164.90.xx.xx

# If using password
ssh root@164.90.xx.xx
# Enter the password you set during Droplet creation
```

---

## Step 4: Upload Project to Server

**Option A: Using SCP (from your Windows machine)**

```powershell
# From your project folder
scp -r .\backend .\frontend .\deploy root@164.90.xx.xx:/root/forgedas-upload/
```

Then on the server:
```bash
mkdir -p /var/www/forgedas
cp -r /root/forgedas-upload/* /var/www/forgedas/
```

**Option B: Using Git (on the server)**

```bash
cd /var/www
git clone https://github.com/YOUR_USERNAME/forgedas.git forgedas
```

---

## Step 5: Run Server Setup

```bash
cd /var/www/forgedas
bash deploy/server-setup.sh
```

This installs: Node.js 20, PostgreSQL 16, Nginx, Certbot, PM2

**⚠️ SAVE THE DATABASE PASSWORD displayed at the end!**

---

## Step 6: Configure Environment

```bash
# Copy and edit the backend .env file
cp deploy/env.backend.example backend/.env
nano backend/.env
```

Update these values in `backend/.env`:

```env
DB_PASSWORD=<paste the password from Step 5>
JWT_SECRET=<generate one with: openssl rand -hex 32>
FRONTEND_URL=https://yourdomain.com
```

Create frontend env:

```bash
echo "REACT_APP_API_URL=/api" > frontend/.env.production
```

---

## Step 7: Deploy

**With a domain:**
```bash
bash deploy/deploy.sh yourdomain.com
```

**Without a domain (IP only, no SSL):**
```bash
bash deploy/deploy.sh
```

This will:
- Install all dependencies
- Build the React frontend
- Configure Nginx
- Start the backend with PM2
- Setup SSL with Let's Encrypt (if domain provided)
- Create the admin user

---

## Step 8: Verify

1. Open `https://yourdomain.com` (or `http://164.90.xx.xx` if no domain)
2. Login with: `admin@forgedas.com` / `admin123`
3. **Change the admin password immediately!**

---

## Useful Commands (on the server)

```bash
# Backend
pm2 status                    # Check if backend is running
pm2 logs                      # View live logs
pm2 restart forgedas-backend  # Restart backend
pm2 logs forgedas-backend --lines 50  # Last 50 log lines

# Nginx
sudo nginx -t                 # Test config
sudo systemctl reload nginx   # Apply config changes
sudo tail -f /var/log/nginx/error.log  # View errors

# Database
sudo -u postgres psql forgedas  # Connect to database

# SSL
sudo certbot renew --dry-run  # Test SSL renewal
sudo certbot certificates     # View certificate info

# Deploy Updates
cd /var/www/forgedas
git pull                      # Pull latest code
bash deploy/update.sh         # Rebuild and restart
```

---

## DigitalOcean Firewall (Recommended)

Go to **Networking → Firewalls** → Create Firewall:

| Type    | Protocol | Port  | Sources    |
|---------|----------|-------|------------|
| Inbound | TCP      | 22    | Your IP    |
| Inbound | TCP      | 80    | All IPv4   |
| Inbound | TCP      | 443   | All IPv4   |

Attach the firewall to your Droplet.

---

## Enable Automatic Backups

In your Droplet settings → **Backups** → Enable ($1.20/month extra). This creates weekly snapshots you can restore from.

---

## Adding SSL Later (if you deployed without a domain)

Once you have a domain and it points to your Droplet IP:

```bash
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

Certbot will automatically configure Nginx for HTTPS and set up auto-renewal.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Backend won't start | Check `pm2 logs forgedas-backend` |
| Database connection error | Verify `.env` credentials: `cat backend/.env` |
| 502 Bad Gateway | Backend not running — `pm2 restart all` |
| SSL cert error | Run `sudo certbot --nginx -d yourdomain.com` |
| Blank page | Check `frontend/build/` exists, run `bash deploy/update.sh` |
| CORS error | Update `FRONTEND_URL` in `backend/.env`, then `pm2 restart all` |
| Out of memory | Upgrade Droplet or add swap: `fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile` |

---

## Cost Summary

| Resource | Monthly Cost |
|----------|-------------|
| Droplet (1 GB) | $6 |
| Droplet (2 GB, recommended) | $12 |
| Domain | ~$10/year |
| SSL (Let's Encrypt) | Free |
| Backups | $1.20 |
| **Total** | **~$7-14/month** |
