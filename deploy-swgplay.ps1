# ============================================================
# SWGPLAY Railway Deployment Script
# Run this in PowerShell from the project directory
# ============================================================

Write-Host ""
Write-Host "=== SWGPLAY Railway Deployment ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check / install Railway CLI
Write-Host "Step 1: Checking Railway CLI..." -ForegroundColor Yellow
$railwayVersion = railway --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Installing Railway CLI..." -ForegroundColor Yellow
    npm install -g @railway/cli
} else {
    Write-Host "Railway CLI found: $railwayVersion" -ForegroundColor Green
}

# Step 2: Login
Write-Host ""
Write-Host "Step 2: Login to Railway (browser will open)..." -ForegroundColor Yellow
railway login

# Step 3: Initialize project as SWGPLAY
Write-Host ""
Write-Host "Step 3: Creating SWGPLAY project on Railway..." -ForegroundColor Yellow
Write-Host "  -> When prompted for project name, type: SWGPLAY" -ForegroundColor Cyan
railway init --name SWGPLAY

# Step 4: Add PostgreSQL
Write-Host ""
Write-Host "Step 4: Adding PostgreSQL database..." -ForegroundColor Yellow
railway add --plugin postgresql

# Step 5: Deploy backend
Write-Host ""
Write-Host "Step 5: Deploying backend service..." -ForegroundColor Yellow
Set-Location backend
railway up --service backend --detach
Set-Location ..

# Step 6: Deploy frontend
Write-Host ""
Write-Host "Step 6: Deploying frontend service..." -ForegroundColor Yellow
Set-Location frontend
railway up --service frontend --detach
Set-Location ..

Write-Host ""
Write-Host "=== Deployment initiated! ===" -ForegroundColor Green
Write-Host "Check https://railway.com/dashboard for build progress." -ForegroundColor Cyan
Write-Host ""
