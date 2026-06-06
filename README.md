# TIER POWER SYSTEMS - Industrial Project Management System

A comprehensive full-stack application for managing industrial manufacturing projects from estimation to delivery.

## Overview

TIER POWER SYSTEMS provides end-to-end project lifecycle management for industrial manufacturing:

- **Project Management**: Create and track projects through all stages
- **Estimation**: Module-based cost calculation with automatic process cost formulas
- **Quotation**: Generate and send professional quotations to clients
- **Sales Orders**: Confirm orders with auto-generated SO/WO numbers
- **Production**: Track operations with production traveller
- **Quality**: Inspection checklists and Certificate of Conformance
- **Logistics**: Shipment tracking and packing list generation
- **Document Management**: Centralized document storage

## Project Status Workflow

```
draft → estimated → quoted → order_confirmed → in_production → inspected → shipped → closed
```

## Technology Stack

### Backend
- Node.js + Express.js
- PostgreSQL with Sequelize ORM
- JWT Authentication
- Multer for file uploads

### Frontend
- React 18 with TypeScript
- Material UI 5
- React Router 6
- Axios for API calls
- MUI X DataGrid

## Getting Started

### Prerequisites
- Node.js 18+ 
- PostgreSQL 14+
- npm or yarn

### Backend Setup

1. Navigate to backend directory:
   ```bash
   cd backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create PostgreSQL database:
   ```sql
   CREATE DATABASE forgedas_dev;
   ```

4. Configure environment:
   ```bash
   cp .env.example .env
   # Edit .env with your database credentials
   ```

5. Run database migrations (auto-sync in dev):
   ```bash
   npm run dev
   ```

### Frontend Setup

1. Navigate to frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start development server:
   ```bash
   npm start
   ```

The frontend will be available at `http://localhost:3000`
The backend API will be available at `http://localhost:5000`

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user

### Projects
- `GET /api/projects` - List all projects
- `POST /api/projects` - Create project
- `GET /api/projects/:id` - Get project details
- `PUT /api/projects/:id` - Update project
- `DELETE /api/projects/:id` - Delete project

### Estimates
- `GET /api/estimates/project/:projectId` - Get project estimate
- `POST /api/estimates/project/:projectId` - Create/update estimate
- `POST /api/estimates/:id/items` - Add estimate item
- `PUT /api/estimates/:id/items/:itemId` - Update estimate item
- `POST /api/estimates/:id/approve` - Approve estimate

### Sales Orders
- `POST /api/projects/:id/confirm-order` - Confirm order (creates SO/WO)

### Work Orders
- `POST /api/projects/:id/start-production` - Start production
- `POST /api/work-orders/:id/operations/:opId/complete` - Complete operation

### Quality
- `POST /api/projects/:id/complete-inspection` - Complete quality inspection

### Documents
- `GET /api/projects/:id/documents` - List project documents
- `POST /api/projects/:id/documents` - Upload document

## User Roles

- **admin**: Full system access
- **engineer**: Estimation, production, quality
- **sales**: Projects, clients, quotations, orders
- **production**: Work orders, production tracking
- **quality**: Inspections, quality records
- **logistics**: Shipments, packing lists

## Project Structure

```
forgedas/
├── backend/
│   ├── src/
│   │   ├── config/        # Database configuration
│   │   ├── controllers/   # Route handlers
│   │   ├── middleware/    # Auth, validation
│   │   ├── models/        # Sequelize models
│   │   ├── routes/        # API routes
│   │   ├── services/      # Business logic
│   │   ├── templates/     # Document templates
│   │   └── utils/         # Helper functions
│   ├── uploads/           # File storage
│   └── package.json
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/    # Reusable components
│   │   ├── contexts/      # React contexts
│   │   ├── pages/         # Page components
│   │   ├── services/      # API services
│   │   ├── types/         # TypeScript types
│   │   └── App.tsx
│   └── package.json
└── README.md
```

## Process Cost Calculation

Each process module has built-in cost formulas:

- **CNC Turning**: Based on diameter, length, setup/cycle time, machine rate
- **CNC Milling**: Based on dimensions, setup/cycle time, machine rate
- **Welding**: Based on weld length, type, passes, welder rate
- **Heat Treatment**: Based on weight and treatment type
- **Grinding**: Based on surface area and finish requirements
- And more...

## License

MIT License
