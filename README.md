# CivicConnect – Express & MongoDB REST API Backend

CivicConnect is a smart community engagement platform that bridges the gap between citizens and local authorities. This repository contains the standalone Express.js, MongoDB (Mongoose), and Clerk authentication backend server powering the platform's complaint lifecycle, public transparency registry, geospatial mapping, dynamic municipal analytics, and notifications.

---

## 🏛️ Architecture & Tech Stack

- **Runtime:** Node.js (v18+)
- **Framework:** Express.js (v5)
- **Database:** MongoDB Atlas / Local MongoDB via Mongoose (v9)
- **Authentication:** Clerk SDK & JWT verification (`@clerk/express`, `@clerk/backend`)
- **File Uploads:** Multer (with disk storage for complaint evidence)
- **Security:** Strict Role-Based Access Control (RBAC), CORS, input sanitation, centralized error handling

---

## 📁 Repository Structure

```
CivicConnect-Backend/
├── .env.example              # Environment variables template
├── .gitignore                # Security exclusions (node_modules, .env, uploads/*)
├── package.json              # Backend dependencies and scripts
├── package-lock.json
├── server.js                 # Express application entry point & middleware pipeline
├── db.js                     # Root db connection helper
├── config/
│   └── db.js                 # MongoDB connection logic with Atlas/local fallback
├── controllers/
│   ├── complaintController.js # Complaint CRUD, public registry, and map coordinates
│   ├── notificationController.js # In-app notification management
│   └── statsController.js    # Dynamic MongoDB aggregation analytics
├── middleware/
│   ├── authMiddleware.js     # Clerk token verification & requireAdmin authorization
│   ├── errorMiddleware.js    # Centralized 404 & 500 error handler
│   └── uploadMiddleware.js   # Multer file upload configuration & limits
├── models/
│   ├── Complaint.js          # Mongoose schema for citizen issues
│   ├── Issue.js              # Issue data model
│   ├── Notification.js       # User & admin notification schema
│   └── User.js               # User metadata schema
├── routes/
│   ├── adminRoutes.js        # Admin management & analytics endpoints
│   ├── complaintRoutes.js    # Citizen & public complaints endpoints
│   ├── notificationRoutes.js # User notifications endpoints
│   └── reportRoutes.js       # Report submission routes
├── test/
│   ├── api.test.js           # Integration test suite (19 tests)
│   └── e2e-workflow.test.js  # E2E complaint workflow suite (12 tests)
└── uploads/
    └── .gitkeep              # Folder preservation for upload storage
```

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js** v18+ and **npm**
- **MongoDB** (Atlas connection string or local MongoDB daemon on `mongodb://127.0.0.1:27017/civicconnect`)

### 2. Installation
```bash
git clone https://github.com/Sneha17-ops/CivicConnect-Backend.git
cd CivicConnect-Backend
npm install
```

### 3. Environment Configuration
Create a `.env` file in the root of the backend folder using `.env.example`:
```bash
cp .env.example .env
```
Fill in your configuration:
```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://127.0.0.1:27017/civicconnect
CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
ADMIN_EMAILS=admin@civicconnect.gov,ops@civicconnect.gov,commissioner@civicconnect.gov
CLIENT_URL=http://localhost:3000
```

### 4. Running the Server
```bash
# Start server
npm start

# Or with nodemon for development
npm run dev
```
The server will start at: `http://localhost:5000`

---

## 📡 Core API Endpoints

### Health Check
- `GET /health` or `GET /api/health` — Verifies API uptime and MongoDB connection state.

### Public Endpoints (Citizen Community Transparency)
- `GET /api/complaints/public` — Paginated community complaints registry (supports `search`, `category`, `status`, `sort`, `page`, `limit`). Private citizen data is strictly omitted at the database level.
- `GET /api/complaints/public/stats` — Real-time dynamic counts (`total`, `pending`, `underProcess`, `solved`, `byCategory`, `mappedCount`).
- `GET /api/complaints/public/map` — Complaints with valid GPS coordinates for heatmap pins and interactive popups.

### Authenticated Citizen Endpoints
- `POST /api/complaints` — Submit a complaint with text, category, coordinates, and optional image upload (`multipart/form-data`).
- `GET /api/complaints/my` — Retrieve complaints submitted by the authenticated citizen.
- `GET /api/complaints/:id` — Retrieve an individual complaint's details.

### Admin Endpoints (RBAC Protected)
- `GET /api/admin/stats` or `GET /api/complaints/stats` — Municipal dashboard metrics, department-wise breakdowns, and priority stats.
- `PUT /api/complaints/:id` or `PATCH /api/complaints/:id/status` — Update complaint status (`Pending`, `Under Process`, `Solved`), priority, department, or admin remarks.
- `DELETE /api/complaints/:id` — Authorized deletion (admin or original owner only).

### Notifications
- `GET /api/notifications` — Retrieve notifications for authenticated user.
- `PATCH /api/notifications/:id/read` — Mark notification as read.

---

## 🧪 Testing

The repository includes comprehensive automated test suites:
```bash
# Run API integration test suite
node test/api.test.js

# Run full end-to-end complaint workflow tests
node test/e2e-workflow.test.js
```

---

## 🔒 Security & Privacy
- **Strict Data Sanitization:** Public endpoints exclude sensitive fields (`userId`, `userEmail`, `userName`, `adminRemarks`, `voiceTranscript`).
- **Authorization:** Admin endpoints verify Clerk JWT tokens against the authorized `ADMIN_EMAILS` whitelist.
- **Zero Secrets in Repository:** Real credentials and `.env` files are excluded by `.gitignore`.
