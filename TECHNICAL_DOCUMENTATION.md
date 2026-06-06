# Forge i-DAS - Technical Documentation

## Overview

**Forge i-DAS** (Industrial Data Automation System) is a comprehensive industrial project management system designed for manufacturing operations. It provides end-to-end workflow management from project estimation to delivery.

**Developed by:** Cholan Dynamics Private Limited

---

## Table of Contents

1. [Technology Stack](#technology-stack)
2. [System Architecture](#system-architecture)
3. [Project Structure](#project-structure)
4. [Database Schema](#database-schema)
5. [API Documentation](#api-documentation)
6. [Frontend Architecture](#frontend-architecture)
7. [Authentication & Authorization](#authentication--authorization)
8. [Installation & Setup](#installation--setup)
9. [Environment Configuration](#environment-configuration)
10. [Workflow & Business Logic](#workflow--business-logic)

---

## Technology Stack

### Backend
| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | v18+ | Runtime environment |
| Express.js | 4.18.x | Web framework |
| Sequelize | 6.35.x | ORM for PostgreSQL |
| PostgreSQL | 14+ | Database |
| JWT | 9.0.x | Authentication |
| bcryptjs | 2.4.x | Password hashing |
| express-validator | 7.0.x | Request validation |
| multer | 1.4.x | File uploads |
| pdfkit | 0.14.x | PDF generation |

### Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| React | 18.2.x | UI framework |
| TypeScript | 5.3.x | Type safety |
| Material-UI (MUI) | 5.15.x | Component library |
| React Router | 6.21.x | Routing |
| Axios | 1.6.x | HTTP client |
| React Hook Form | 7.49.x | Form handling |
| Day.js | 1.11.x | Date manipulation |

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                         │
│                    http://localhost:3000                         │
├─────────────────────────────────────────────────────────────────┤
│                              │                                   │
│                         REST API                                 │
│                              │                                   │
├─────────────────────────────────────────────────────────────────┤
│                       Backend (Express)                          │
│                    http://localhost:5000                         │
├─────────────────────────────────────────────────────────────────┤
│                              │                                   │
│                    Sequelize ORM                                 │
│                              │                                   │
├─────────────────────────────────────────────────────────────────┤
│                      PostgreSQL Database                         │
│                    localhost:5432/forgedas                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
forgedas/
├── backend/
│   ├── package.json
│   ├── .env
│   ├── data/
│   │   └── settings.json
│   ├── uploads/                    # Uploaded files storage
│   └── src/
│       ├── index.js                # Application entry point
│       ├── config/
│       │   └── database.js         # Database configuration
│       ├── controllers/            # Request handlers
│       │   ├── authController.js
│       │   ├── clientController.js
│       │   ├── documentController.js
│       │   ├── estimateController.js
│       │   ├── logisticsController.js
│       │   ├── projectController.js
│       │   ├── qualityController.js
│       │   ├── salesOrderController.js
│       │   ├── settingsController.js
│       │   ├── userController.js
│       │   ├── vendorController.js
│       │   └── workOrderController.js
│       ├── middleware/
│       │   ├── auth.js             # JWT authentication
│       │   └── validate.js         # Request validation
│       ├── models/                 # Sequelize models
│       │   ├── index.js            # Model associations
│       │   ├── Client.js
│       │   ├── Document.js
│       │   ├── Estimate.js
│       │   ├── EstimateItem.js
│       │   ├── Project.js
│       │   ├── QualityRecord.js
│       │   ├── SalesOrder.js
│       │   ├── User.js
│       │   ├── Vendor.js
│       │   └── WorkOrder.js
│       ├── routes/                 # API routes
│       │   ├── index.js
│       │   ├── authRoutes.js
│       │   ├── clientRoutes.js
│       │   ├── documentRoutes.js
│       │   ├── estimateRoutes.js
│       │   ├── logisticsRoutes.js
│       │   ├── projectRoutes.js
│       │   ├── qualityRoutes.js
│       │   ├── salesOrderRoutes.js
│       │   ├── settingsRoutes.js
│       │   ├── userRoutes.js
│       │   ├── vendorRoutes.js
│       │   └── workOrderRoutes.js
│       ├── services/               # Business logic
│       │   ├── authService.js
│       │   ├── clientService.js
│       │   ├── documentService.js
│       │   ├── estimateService.js
│       │   ├── logisticsService.js
│       │   ├── projectService.js
│       │   ├── qualityService.js
│       │   ├── salesOrderService.js
│       │   ├── settingsService.js
│       │   ├── userService.js
│       │   ├── vendorService.js
│       │   └── workOrderService.js
│       ├── templates/              # PDF templates
│       └── utils/
│           ├── helpers.js
│           └── pdfGenerator.js
│
└── frontend/
    ├── package.json
    ├── tsconfig.json
    ├── public/
    │   └── index.html
    └── src/
        ├── App.tsx                 # Main application component
        ├── index.tsx               # React entry point
        ├── index.css               # Global styles
        ├── theme.ts                # MUI theme configuration
        ├── components/
        │   ├── Layout/
        │   │   └── Layout.tsx      # Main layout wrapper
        │   └── ProjectTabs/        # Project detail tabs
        │       ├── DocumentsTab.tsx
        │       ├── EstimationTab.tsx
        │       ├── LogisticsTab.tsx
        │       ├── ProductionTab.tsx
        │       ├── QualityTab.tsx
        │       ├── QuotationTab.tsx
        │       └── SalesOrderTab.tsx
        ├── contexts/
        │   └── AuthContext.tsx     # Authentication context
        ├── pages/
        │   ├── ClientsPage.tsx
        │   ├── DashboardPage.tsx
        │   ├── LoginPage.tsx
        │   ├── ProjectDetailPage.tsx
        │   ├── ProjectsPage.tsx
        │   ├── SettingsPage.tsx
        │   └── VendorsPage.tsx
        ├── services/               # API service layer
        │   ├── api.ts              # Axios instance
        │   ├── authService.ts
        │   ├── clientService.ts
        │   ├── estimateService.ts
        │   ├── projectService.ts
        │   └── vendorService.ts
        ├── types/
        │   └── index.ts            # TypeScript type definitions
        └── utils/
```

---

## Database Schema

### Entity Relationship Diagram

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│    Users    │       │   Clients   │       │   Vendors   │
├─────────────┤       ├─────────────┤       ├─────────────┤
│ id (PK)     │       │ id (PK)     │       │ id (PK)     │
│ name        │       │ client_name │       │ vendor_name │
│ email       │       │ address     │       │ address     │
│ password_hash       │ poc_name    │       │ contact_person
│ role        │       │ poc_email   │       │ contact_email│
│ phone       │       │ poc_phone   │       │ contact_phone│
│ is_active   │       └──────┬──────┘       │ service_categories
└──────┬──────┘              │              │ rating      │
       │                     │              │ tax_id      │
       │         ┌───────────┴──────────┐   │ notes       │
       │         │       Projects       │   └─────────────┘
       │         ├─────────────────────┤
       └────────►│ id (PK)             │
                 │ project_name        │
                 │ client_id (FK)      │◄────────────────┐
                 │ prepared_by (FK)    │                 │
                 │ revision            │                 │
                 │ status              │                 │
                 │ ship_to_address     │                 │
                 │ material_type       │                 │
                 │ material_grade      │                 │
                 │ heat_number         │                 │
                 │ material_supplied_by│                 │
                 │ quantity            │                 │
                 └──────────┬──────────┘                 │
                            │                            │
       ┌────────────────────┼────────────────────┐       │
       │                    │                    │       │
       ▼                    ▼                    ▼       │
┌─────────────┐     ┌─────────────┐     ┌─────────────┐  │
│  Estimates  │     │ SalesOrders │     │ WorkOrders  │  │
├─────────────┤     ├─────────────┤     ├─────────────┤  │
│ id (PK)     │     │ id (PK)     │     │ id (PK)     │  │
│project_id(FK)│    │project_id(FK)│    │project_id(FK)│ │
│raw_material_cost  │sales_order_no│    │work_order_no│  │
│ process_cost│     │customer_po_no│    │ release_date│  │
│ overhead_cost│    │customer_po_file   │ operations  │  │
│ total_cost  │     │ accepted_date│    │ notes       │  │
│margin_percent│    │ delivery_date│    │ status      │  │
│ final_price │     │ notes        │    └─────────────┘  │
│ is_approved │     └─────────────┘                      │
│ quotation   │                                          │
└──────┬──────┘                                          │
       │                                                 │
       ▼                                                 │
┌─────────────┐     ┌─────────────┐     ┌─────────────┐  │
│EstimateItems│     │QualityRecords│    │  Documents  │  │
├─────────────┤     ├─────────────┤     ├─────────────┤  │
│ id (PK)     │     │ id (PK)     │     │ id (PK)     │  │
│estimate_id(FK)│   │project_id(FK)│◄───│project_id(FK)│◄┘
│ module_type │     │dimensional_verification         │
│ input_json  │     │visual_inspection  │document_type│
│calculated_json│   │hardness_testing   │ version     │
│ total_cost  │     │ ndt_testing │     │ file_path   │
│sequence_order│    │pressure_testing   │ file_name   │
└─────────────┘     │mtr_verification   │ status      │
                    │inspection_data_json│generated_by│
                    │ report_files │     │ generated_at│
                    │ coc_generated│     └─────────────┘
                    │inspection_date│
                    │inspector_name│
                    │overall_result│
                    └─────────────┘
```

### Model Details

#### Users
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK, Auto-generated | Unique identifier |
| name | VARCHAR(100) | NOT NULL | User's full name |
| email | VARCHAR(255) | NOT NULL, UNIQUE | Login email |
| password_hash | VARCHAR(255) | NOT NULL | Bcrypt hashed password |
| role | ENUM | NOT NULL, Default: 'engineer' | User role |
| phone | VARCHAR(20) | NULLABLE | Contact phone |
| is_active | BOOLEAN | Default: true | Active status |

**User Roles:** `admin`, `engineer`, `sales`, `production`, `quality`, `logistics`

#### Clients
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| client_name | VARCHAR(200) | NOT NULL | Company name |
| address | TEXT | NULLABLE | Full address |
| poc_name | VARCHAR(100) | NULLABLE | Point of contact name |
| poc_email | VARCHAR(255) | NULLABLE | POC email |
| poc_phone | VARCHAR(20) | NULLABLE | POC phone |

#### Vendors
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| vendor_name | VARCHAR(200) | NOT NULL | Company name |
| address | TEXT | NULLABLE | Full address |
| contact_person | VARCHAR(100) | NULLABLE | Contact name |
| contact_email | VARCHAR(255) | NULLABLE | Email |
| contact_phone | VARCHAR(20) | NULLABLE | Phone |
| service_categories | TEXT[] | Default: [] | Service types |
| rating | DECIMAL(2,1) | Default: 0 | Performance rating |
| tax_id | VARCHAR(50) | NULLABLE | Tax identification |
| notes | TEXT | NULLABLE | Additional notes |

#### Projects
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| project_name | VARCHAR(200) | NOT NULL | Project title |
| client_id | UUID | FK → clients.id | Associated client |
| prepared_by | UUID | FK → users.id | Created by user |
| revision | INTEGER | Default: 1 | Version number |
| status | ENUM | Default: 'draft' | Current status |
| ship_to_address | TEXT | NULLABLE | Delivery address |
| material_type | VARCHAR(100) | NULLABLE | Material specification |
| material_grade | VARCHAR(100) | NULLABLE | Material grade |
| heat_number | VARCHAR(100) | NULLABLE | Heat/batch number |
| material_supplied_by | ENUM | NULLABLE | Material source |
| quantity | INTEGER | NULLABLE | Order quantity |

**Project Status Workflow:**
```
draft → estimated → quoted → order_confirmed → in_production → inspected → shipped → closed
```

#### Estimates
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| project_id | UUID | FK, UNIQUE | One estimate per project |
| raw_material_cost | DECIMAL(12,2) | Default: 0 | Material costs |
| process_cost | DECIMAL(12,2) | Default: 0 | Processing costs |
| overhead_cost | DECIMAL(12,2) | Default: 0 | Overhead costs |
| total_cost | DECIMAL(12,2) | Default: 0 | Sum of all costs |
| margin_percent | DECIMAL(5,2) | Default: 0 | Profit margin % |
| final_price | DECIMAL(12,2) | Default: 0 | Final quoted price |
| is_approved | BOOLEAN | Default: false | Approval status |
| approved_by | UUID | FK → users.id | Approver |
| approved_at | TIMESTAMP | NULLABLE | Approval timestamp |
| quotation | JSONB | Default: {} | Quotation details |

#### Estimate Items
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| estimate_id | UUID | FK | Parent estimate |
| module_type | ENUM | NOT NULL | Process type |
| input_json | JSONB | Default: {} | Input parameters |
| calculated_json | JSONB | Default: {} | Calculated values |
| total_cost | DECIMAL(12,2) | Default: 0 | Item cost |
| sequence_order | INTEGER | Default: 0 | Processing order |

**Process Module Types:**
- `cnc_turning` - CNC Turning operations
- `cnc_milling` - CNC Milling operations
- `welding` - Welding operations
- `heat_treatment` - Heat treatment processes
- `grinding` - Grinding operations
- `drilling` - Drilling operations
- `boring` - Boring operations
- `threading` - Threading operations
- `surface_treatment` - Surface treatment
- `assembly` - Assembly operations
- `testing` - Testing procedures
- `other` - Other operations

#### Sales Orders
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| project_id | UUID | FK, UNIQUE | One SO per project |
| sales_order_number | VARCHAR(50) | NOT NULL, UNIQUE | SO number |
| customer_po_number | VARCHAR(100) | NULLABLE | Customer PO |
| customer_po_file | VARCHAR(500) | NULLABLE | PO file path |
| accepted_date | DATE | NULLABLE | Order accepted date |
| delivery_date | DATE | NULLABLE | Expected delivery |
| notes | TEXT | NULLABLE | Additional notes |

#### Work Orders
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| project_id | UUID | FK, UNIQUE | One WO per project |
| work_order_number | VARCHAR(50) | NOT NULL, UNIQUE | WO number |
| release_date | DATE | NULLABLE | Release date |
| operations | JSONB | Default: [] | Operations array |
| notes | TEXT | NULLABLE | Additional notes |
| status | ENUM | Default: 'pending' | WO status |

**Work Order Status:** `pending`, `in_progress`, `completed`

#### Quality Records
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| project_id | UUID | FK, UNIQUE | One QR per project |
| dimensional_verification | BOOLEAN | Default: false | Dim check |
| visual_inspection | BOOLEAN | Default: false | Visual check |
| hardness_testing | BOOLEAN | Default: false | Hardness test |
| ndt_testing | BOOLEAN | Default: false | NDT check |
| pressure_testing | BOOLEAN | Default: false | Pressure test |
| mtr_verification | BOOLEAN | Default: false | MTR check |
| inspection_data_json | JSONB | Default: {} | Inspection data |
| inspection_checklist | JSONB | Default: [] | Checklist items |
| inspector_notes | TEXT | NULLABLE | Inspector notes |
| overall_result | VARCHAR(20) | Default: 'pending' | pass/fail/pending |
| is_finalized | BOOLEAN | Default: false | Finalization status |
| report_files | JSONB | Default: [] | Report file paths |
| coc_generated | BOOLEAN | Default: false | COC generated flag |
| inspection_date | DATE | NULLABLE | Inspection date |
| inspector_name | VARCHAR(100) | NULLABLE | Inspector name |

#### Documents
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| project_id | UUID | FK | Parent project |
| document_type | ENUM | NOT NULL | Document category |
| version | INTEGER | Default: 1 | Version number |
| file_path | VARCHAR(500) | NOT NULL | Storage path |
| file_name | VARCHAR(255) | NOT NULL | Original filename |
| status | ENUM | Default: 'draft' | draft/final |
| generated_by | UUID | FK → users.id | Creator |
| generated_at | TIMESTAMP | NOT NULL | Creation time |

**Document Types:** `quotation`, `proposal`, `work_order`, `production_traveller`, `coc`, `packing_list`, `delivery_note`, `other`

---

## API Documentation

### Base URL
```
http://localhost:5000/api
```

### Authentication

All protected routes require a JWT token in the Authorization header:
```
Authorization: Bearer <jwt_token>
```

### Endpoints

#### Authentication Routes (`/api/auth`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/register` | No | Register new user |
| POST | `/login` | No | User login |
| GET | `/profile` | Yes | Get current user profile |
| POST | `/change-password` | Yes | Change password |

**POST /api/auth/login**
```json
Request:
{
  "email": "admin@forgedas.com",
  "password": "admin123"
}

Response:
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "name": "Admin User",
      "email": "admin@forgedas.com",
      "role": "admin"
    },
    "token": "jwt_token"
  }
}
```

#### User Routes (`/api/users`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/` | Yes | Get all users |
| GET | `/:id` | Yes | Get user by ID |
| POST | `/` | Yes (Admin) | Create user |
| PUT | `/:id` | Yes | Update user |
| DELETE | `/:id` | Yes (Admin) | Delete user |

#### Client Routes (`/api/clients`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/` | Yes | Get all clients |
| GET | `/:id` | Yes | Get client by ID |
| POST | `/` | Yes | Create client |
| PUT | `/:id` | Yes | Update client |
| DELETE | `/:id` | Yes | Delete client |

#### Vendor Routes (`/api/vendors`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/` | Yes | Get all vendors |
| GET | `/:id` | Yes | Get vendor by ID |
| POST | `/` | Yes | Create vendor |
| PUT | `/:id` | Yes | Update vendor |
| DELETE | `/:id` | Yes | Delete vendor |

#### Project Routes (`/api/projects`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/` | Yes | Get all projects |
| GET | `/workflow` | Yes | Get status workflow |
| GET | `/:id` | Yes | Get project by ID |
| POST | `/` | Yes | Create project |
| PUT | `/:id` | Yes | Update project |
| PATCH | `/:id/status` | Yes | Update project status |
| DELETE | `/:id` | Yes | Delete project |

**POST /api/projects**
```json
Request:
{
  "project_name": "Steel Machining Project",
  "client_id": "client-uuid",
  "ship_to_address": "123 Industrial Blvd",
  "material_type": "Steel",
  "material_grade": "SS304",
  "quantity": 100
}

Response:
{
  "success": true,
  "data": {
    "id": "project-uuid",
    "project_name": "Steel Machining Project",
    "status": "draft",
    ...
  }
}
```

#### Estimate Routes (`/api/estimates`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/project/:projectId` | Yes | Get estimate by project |
| POST | `/project/:projectId` | Yes | Create/update estimate |
| POST | `/:id/items` | Yes | Add estimate item |
| PUT | `/:id/items/:itemId` | Yes | Update estimate item |
| DELETE | `/:id/items/:itemId` | Yes | Delete estimate item |
| PATCH | `/:id/approve` | Yes | Approve estimate |
| PUT | `/:id/quotation` | Yes | Update quotation |

#### Sales Order Routes (`/api/sales-orders`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/project/:projectId` | Yes | Get SO by project |
| POST | `/project/:projectId` | Yes | Create SO |
| PUT | `/:id` | Yes | Update SO |

#### Work Order Routes (`/api/work-orders`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/project/:projectId` | Yes | Get WO by project |
| POST | `/project/:projectId` | Yes | Create WO |
| PUT | `/:id` | Yes | Update WO |
| PATCH | `/:id/operations/:opIndex` | Yes | Update operation |

#### Quality Routes (`/api/quality`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/project/:projectId` | Yes | Get QR by project |
| POST | `/project/:projectId` | Yes | Create/update QR |
| PUT | `/:id` | Yes | Update QR |
| PATCH | `/:id/finalize` | Yes | Finalize inspection |
| POST | `/:id/coc` | Yes | Generate COC |

#### Logistics Routes (`/api/logistics`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/project/:projectId` | Yes | Get shipment data |
| PUT | `/project/:projectId` | Yes | Update shipment |

#### Document Routes (`/api/documents`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/project/:projectId` | Yes | Get project documents |
| POST | `/project/:projectId/generate/:type` | Yes | Generate document |
| POST | `/project/:projectId/upload` | Yes | Upload document |
| GET | `/:id/download` | Yes | Download document |

#### Settings Routes (`/api/settings`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/` | Yes | Get all settings |
| PUT | `/` | Yes (Admin) | Update settings |

---

## Frontend Architecture

### Page Components

| Page | Path | Description |
|------|------|-------------|
| LoginPage | `/login` | User authentication |
| DashboardPage | `/` | Overview dashboard |
| ProjectsPage | `/projects` | Project list |
| ProjectDetailPage | `/projects/:id` | Project details with tabs |
| ClientsPage | `/clients` | Client management |
| VendorsPage | `/vendors` | Vendor management |
| SettingsPage | `/settings` | System settings |

### Project Detail Tabs

The `ProjectDetailPage` contains multiple tabs for complete project management:

1. **Estimation Tab** - Cost estimation and calculations
2. **Quotation Tab** - Quote generation and management
3. **Sales Order Tab** - Customer PO and order management
4. **Production Tab** - Work order and operations tracking
5. **Quality Tab** - Inspection and quality records
6. **Logistics Tab** - Shipping and delivery management
7. **Documents Tab** - Document generation and management

### Context Providers

- **AuthContext** - Authentication state management
  - `user` - Current logged-in user
  - `token` - JWT token
  - `isAuthenticated` - Auth status
  - `login()` - Login function
  - `logout()` - Logout function
  - `refreshUser()` - Refresh user data

### API Service Layer

The frontend uses a centralized Axios instance (`services/api.ts`) with:
- Base URL configuration
- Automatic token injection
- Response/Error interceptors
- Automatic logout on 401 errors

---

## Authentication & Authorization

### JWT Token Structure
```json
{
  "userId": "user-uuid",
  "iat": 1708444800,
  "exp": 1709049600
}
```

### Token Expiration
- Default: 7 days (`7d`)
- Configurable via `JWT_EXPIRES_IN` environment variable

### Role-Based Access

| Role | Permissions |
|------|-------------|
| admin | Full system access, user management |
| engineer | Project creation, estimation |
| sales | Client management, quotations |
| production | Work orders, operations |
| quality | Inspections, QC records |
| logistics | Shipping, delivery |

---

## Installation & Setup

### Prerequisites
- Node.js v18 or higher
- PostgreSQL v14 or higher
- npm or yarn

### Quick Start

1. **Create Database**
```bash
# Using psql
psql -U postgres -c "CREATE DATABASE forgedas;"
```

2. **Configure Backend**
```bash
cd backend
cp .env.example .env
# Edit .env with your database credentials
npm install
```

3. **Start Backend**
```bash
npm start
# Server runs on http://localhost:5000
```

4. **Create Admin User**
```bash
node -e "const bcrypt = require('bcryptjs'); const { sequelize, User } = require('./src/models'); (async () => { await sequelize.sync(); const hash = await bcrypt.hash('admin123', 10); await User.findOrCreate({ where: { email: 'admin@forgedas.com' }, defaults: { name: 'Admin User', email: 'admin@forgedas.com', password_hash: hash, role: 'admin', is_active: true } }); console.log('Admin created'); process.exit(0); })();"
```

5. **Install & Start Frontend**
```bash
cd frontend
npm install --legacy-peer-deps
npm start
# Frontend runs on http://localhost:3000
```

### Default Credentials
- **Email:** admin@forgedas.com
- **Password:** admin123

---

## Environment Configuration

### Backend (.env)

```env
# Environment
NODE_ENV=development
PORT=5000

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=forgedas
DB_USER=postgres
DB_PASSWORD=your_password

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=7d

# File Upload
UPLOAD_PATH=./uploads
MAX_FILE_SIZE=10485760

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:3000
```

### Frontend Environment

Create `.env` file in frontend directory:
```env
REACT_APP_API_URL=http://localhost:5000/api
```

---

## Workflow & Business Logic

### Project Lifecycle

```
1. DRAFT
   └── Project created, basic details entered
   
2. ESTIMATED
   └── Cost estimation completed
   └── Estimate items added (CNC, welding, etc.)
   
3. QUOTED
   └── Quotation generated with margin
   └── Quote sent to customer
   
4. ORDER_CONFIRMED
   └── Customer PO received
   └── Sales order created
   └── Work order generated
   
5. IN_PRODUCTION
   └── Operations in progress
   └── Work order tracking
   
6. INSPECTED
   └── Quality checks completed
   └── COC generated
   
7. SHIPPED
   └── Logistics completed
   └── Delivery confirmed
   
8. CLOSED
   └── Project archived
```

### Document Generation

The system can generate various documents:
- **Quotation** - Customer quote with pricing
- **Work Order** - Production instructions
- **Production Traveller** - Shop floor document
- **COC (Certificate of Conformance)** - Quality certification
- **Packing List** - Shipping contents
- **Delivery Note** - Delivery confirmation

---

## Security Considerations

1. **Password Hashing** - bcrypt with salt rounds of 10
2. **JWT Authentication** - Secure token-based auth
3. **Input Validation** - express-validator on all inputs
4. **CORS Configuration** - Restricted to frontend origin
5. **SQL Injection Prevention** - Sequelize ORM parameterization
6. **File Upload Security** - multer with size limits

---

## Support & Maintenance

**Developed by:** Cholan Dynamics Private Limited

For technical support or inquiries, contact the development team.

---

*Last Updated: February 2026*
*Version: 1.0.0*
