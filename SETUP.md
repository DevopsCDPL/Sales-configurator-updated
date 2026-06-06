# TIER POWER SYSTEMS Setup Guide

This guide will help you set up TIER POWER SYSTEMS on a new system.

## Prerequisites

### 1. Node.js (v18 or higher)
Download and install from: https://nodejs.org

### 2. PostgreSQL (v14 or higher)
Download and install from: https://www.postgresql.org/download/

During installation:
- Remember the password you set for the `postgres` user
- Default port is 5432

---

## Installation Steps

### Step 1: Create Database

Open **pgAdmin** or **psql** and run:

```sql
CREATE DATABASE forgedas;
```

Or via command line (Windows):
```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -c "CREATE DATABASE forgedas;"
```

### Step 2: Configure Environment

Create a `.env` file in the `backend` folder:

```env
DATABASE_URL=postgres://postgres:YOUR_PASSWORD@localhost:5432/forgedas
JWT_SECRET=your-secret-key-change-this-in-production
PORT=5000
```

Replace `YOUR_PASSWORD` with your PostgreSQL password.

### Step 3: Install Backend Dependencies

```powershell
cd backend
npm install
```

### Step 4: Start Backend Server

```powershell
cd backend
npm start
```

The backend will:
- Connect to PostgreSQL
- Auto-create all required tables
- Start listening on port 5000

### Step 5: Create Admin User

Run this command from the `backend` folder:

```powershell
node -e "const bcrypt = require('bcryptjs'); const { sequelize, User } = require('./src/models'); (async () => { await sequelize.sync(); const hash = await bcrypt.hash('admin123', 10); await User.findOrCreate({ where: { email: 'admin@forgedas.com' }, defaults: { name: 'Admin User', email: 'admin@forgedas.com', password_hash: hash, role: 'admin', is_active: true } }); console.log('Admin created: admin@forgedas.com / admin123'); process.exit(0); })();"
```

### Step 6: Install Frontend Dependencies

```powershell
cd frontend
npm install --legacy-peer-deps
```

### Step 7: Start Frontend

```powershell
cd frontend
npm start
```

---

## Access the Application

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5000
- **Login Credentials**: 
  - Email: `admin@forgedas.com`
  - Password: `admin123`

---

## Quick Start (All Commands)

```powershell
# Terminal 1 - Backend
cd backend
npm install
npm start

# Terminal 2 - Frontend
cd frontend
npm install --legacy-peer-deps
npm start
```

---

## Troubleshooting

### Port 5000 already in use
```powershell
# Find and kill process on port 5000
Get-NetTCPConnection -LocalPort 5000 | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

### Database connection failed
- Verify PostgreSQL is running
- Check credentials in `.env` file
- Ensure database `forgedas` exists

### Frontend build errors
```powershell
# Clear cache and reinstall
cd frontend
Remove-Item -Recurse -Force node_modules
npm install --legacy-peer-deps
```

---

## Project Structure

```
forgedas/
├── backend/           # Express.js API server
│   ├── src/
│   │   ├── controllers/
│   │   ├── models/
│   │   ├── routes/
│   │   └── services/
│   └── package.json
├── frontend/          # React application
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   └── services/
│   └── package.json
└── SETUP.md
```

---

## Default Users

| Email | Password | Role |
|-------|----------|------|
| admin@forgedas.com | admin123 | Admin |

---

## Tech Stack

- **Frontend**: React 18, Material-UI, TypeScript
- **Backend**: Node.js, Express.js, Sequelize ORM
- **Database**: PostgreSQL
- **Authentication**: JWT
