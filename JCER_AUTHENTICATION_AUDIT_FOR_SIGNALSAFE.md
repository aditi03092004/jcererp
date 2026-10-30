# JCER ERP Authentication Technical Audit Report for SignalSafe Campus Integration

**Project Target:** SignalSafe Campus (Cybersecurity Scam & Threat Detection Application)  
**Host Ecosystem:** JCER ERP System (College ERP & Digital Portal)  
**Audit Type:** Read-Only Technical Architecture & Security Inspection  
**Repository Inspected:** `JCER-ERP-SYSTEM` (`e:/jcererp`)  
**Audit Status:** Completed — Verified against actual source code  

---

## 1. Executive Summary

This technical audit evaluates the authentication architecture of the **JCER ERP System** to design a secure, frictionless integration for **SignalSafe Campus** (based on the KAVACH Scam Shield project).

SignalSafe Campus is an independent cybersecurity application featuring screenshot scam detection, malicious URL analysis, QR-code inspection, campus incident reporting, and security administrator dashboards. While SignalSafe maintains its own frontend, backend, and PostgreSQL/MongoDB database, users must be able to log in using their existing JCER ERP credentials (email/USN and password) without account duplication or password leakage.

### Key Audit Findings
1. **Direct Credential Verification is Supported:** The ERP exposes a centralized REST API endpoint (`POST /api/auth/login`) that accepts email, username, or student USN, verifies salted Bcrypt hashes against PostgreSQL, and returns user identity metadata and an access token.
2. **Asymmetric Key Separation is Crucial:** The ERP generates symmetric HMAC-SHA256 (`HS256`) JWTs using a shared secret (`JWT_SECRET`). ERP JWTs **omit** user email, names, and student USNs, and rely on live PostgreSQL database checks on every request. Therefore, **SignalSafe must not attempt to validate ERP JWT signatures locally using a shared secret**, as this would expose ERP administrative signing keys.
3. **Delegated Session Architecture is Recommended:** The SignalSafe backend should securely delegate credential verification to the ERP backend over a server-to-server HTTPS call. Upon ERP confirmation, the SignalSafe backend creates or updates a local user record (`erp_user_id`), signs its **own** SignalSafe JWT, and issues its own session cookies.
4. **Perimeter Throttling is the Primary Constraint:** The ERP backend enforces a production rate limit of **30 requests per minute per IP** (`authLimiter`). In high-traffic periods, proxying all student logins through a single SignalSafe backend IP would trigger HTTP 429 throttling unless an internal IP whitelist or dedicated internal verification endpoint is configured.
5. **Role-Specific Two-Factor Authentication:** Students are exempt from multi-factor daily OTPs and authenticate immediately. However, staff and faculty roles (`ADMIN`, `PRINCIPAL`, `DEAN`, `HOD`, `TEACHER`/`FACULTY`) require a Daily 6-digit email OTP if they have not logged in within 24 hours.

---

## 2. Verified Authentication Architecture

### 2.1 Technology Stack & Core Frameworks
- **Backend Framework:** **Express.js (v4.18.2)** running on **Node.js (v20+)** with **TypeScript (v5.3.3)**.
  - *Evidence:* [`Admission_process/backend/package.json:L21-L59`](file:///e:/jcererp/Admission_process/backend/package.json#L21-L59).
- **ORM / Database Engine:** **Sequelize ORM (v6.35.2)** communicating with **PostgreSQL** (`pg` v8.11.3).
  - *Evidence:* [`Admission_process/backend/src/config/database.ts:L1-L86`](file:///e:/jcererp/Admission_process/backend/src/config/database.ts#L1-L86).
- **Session & Caching Layer:** **Redis (v4.6.11)** with an in-memory fallback `Map` store for development/offline resilience.
  - *Evidence:* [`Admission_process/backend/src/config/redis.ts:L7-L38`](file:///e:/jcererp/Admission_process/backend/src/config/redis.ts#L7-L38), [`Admission_process/backend/src/services/redis.service.ts:L1-L63`](file:///e:/jcererp/Admission_process/backend/src/services/redis.service.ts#L1-L63).
- **Frontend Architecture:** **React (v18.2.0)**, **Vite (v5.0.8)**, **Redux Toolkit (v1.9.7)**, and **Axios (v1.6.0)**.
  - *Evidence:* [`Admission_process/frontend/package.json:L16-L46`](file:///e:/jcererp/Admission_process/frontend/package.json#L16-L46).

### 2.2 Core Authentication Files & Responsibilities
| Component | Actual File Path | Verification Status | Architectural Role |
| :--- | :--- | :--- | :--- |
| **Auth Router** | [`Admission_process/backend/src/routes/auth.routes.ts`](file:///e:/jcererp/Admission_process/backend/src/routes/auth.routes.ts#L1-L51) | **Verified** | Registers public auth routes (`/login`, `/verify-daily-otp`, `/refresh-token`) and authenticated endpoints (`/logout`, `/status`, `/workspaces`). |
| **Auth Controller** | [`Admission_process/backend/src/controllers/auth.controller.ts`](file:///e:/jcererp/Admission_process/backend/src/controllers/auth.controller.ts#L119-L436) | **Verified** | Manages identifier lookup (Email, Username, USN), Bcrypt password validation, Daily OTP orchestration, and profile response synthesis. |
| **Auth Service** | [`Admission_process/backend/src/services/auth.service.ts`](file:///e:/jcererp/Admission_process/backend/src/services/auth.service.ts#L10-L69) | **Verified** | Generates access and refresh tokens, maintains Redis session keys (`session:${userId}`), and handles token rotation and revocation. |
| **JWT Utility** | [`Admission_process/backend/src/utils/jwt.util.ts`](file:///e:/jcererp/Admission_process/backend/src/utils/jwt.util.ts#L1-L16) | **Verified** | Wraps `jsonwebtoken` sign and verify methods using the symmetric signing secret. |
| **Auth Middleware** | [`Admission_process/backend/src/middleware/auth.middleware.ts`](file:///e:/jcererp/Admission_process/backend/src/middleware/auth.middleware.ts#L29-L114) | **Verified** | Verifies token signature, performs zero-trust PostgreSQL database lookup, validates `tokenVersion`, and enforces student inactivity timeouts. |
| **RBAC Matrix** | [`Admission_process/backend/src/middleware/rbac.middleware.ts`](file:///e:/jcererp/Admission_process/backend/src/middleware/rbac.middleware.ts#L8-L69) | **Verified** | Maps system roles to granular operation permissions (`PERMISSION_MATRIX`) and enforces student/parent tenant data isolation. |
| **Rate Limiter** | [`Admission_process/backend/src/middleware/rateLimit.middleware.ts`](file:///e:/jcererp/Admission_process/backend/src/middleware/rateLimit.middleware.ts#L7-L48) | **Verified** | Enforces perimeter request throttling (`globalLimiter`, `authLimiter`, `refreshLimiter`). |
| **CORS Guard** | [`Admission_process/backend/src/middleware/corsConfig.middleware.ts`](file:///e:/jcererp/Admission_process/backend/src/middleware/corsConfig.middleware.ts#L26-L87) | **Verified** | Controls origin whitelisting, credentials, and allows server-to-server requests without `Origin` headers. |
| **User Model** | [`Admission_process/backend/src/models/User.ts`](file:///e:/jcererp/Admission_process/backend/src/models/User.ts#L12-L172) | **Verified** | Defines the `users` schema, password comparison logic, auto-migration hooks, and `tokenVersion` counter. |
| **Audit Service** | [`Admission_process/backend/src/services/securityEvents.service.ts`](file:///e:/jcererp/Admission_process/backend/src/services/securityEvents.service.ts#L118-L167) | **Verified** | Records login successes, login failures, and logouts in the `audit_logs` table. |
| **Frontend Auth Client** | [`Admission_process/frontend/src/services/auth.service.ts`](file:///e:/jcererp/Admission_process/frontend/src/services/auth.service.ts#L41-L140) | **Verified** | Handles client-side login API invocations, Daily OTP state, and `localStorage` token persistence. |
| **Frontend Axios Setup** | [`Admission_process/frontend/src/services/api.ts`](file:///e:/jcererp/Admission_process/frontend/src/services/api.ts#L25-L141) | **Verified** | Configures `baseURL` from `VITE_API_URL`, manages bearer token injection, and coordinates 401 token refresh loops. |

---

## 3. Exact Login API Endpoint

### 3.1 Route Registration and Method
- **HTTP Method:** `POST`
- **Route Paths:** 
  - Canonical: `/api/auth/login`
  - Versioned Alias: `/api/v1/auth/login`
  - *Evidence:* Mounted in [`Admission_process/backend/src/app.ts:L213`](file:///e:/jcererp/Admission_process/backend/src/app.ts#L213) and [`app.ts:L404-L405`](file:///e:/jcererp/Admission_process/backend/src/app.ts#L404-L405).
- **Controller Action:** `login` in [`Admission_process/backend/src/controllers/auth.controller.ts:L119-L276`](file:///e:/jcererp/Admission_process/backend/src/controllers/auth.controller.ts#L119-L276).

### 3.2 Expected Request Body
- **Content-Type:** `application/json`
- **Required Fields:**
  ```json
  {
    "email": "<string>",
    "password": "<string>"
  }
  ```
- **Identifier Handling (Multi-Identifier Acceptance):**  
  Although the JSON property is labelled `"email"`, the controller implements multi-identifier resolution in [`auth.controller.ts:L131-L153`](file:///e:/jcererp/Admission_process/backend/src/controllers/auth.controller.ts#L131-L153):
  1. Searches `User` by lowercase normalized email (`email.trim().toLowerCase()`).
  2. Searches `User` by raw email string (`email`).
  3. Searches `User` by lowercase username (`username = normalizedEmail`).
  4. Searches `User` by raw username (`username = email.trim()`).
  5. Searches `Student` model by student University Seat Number:
     ```typescript
     Student.findOne({
       where: sequelize.where(
         sequelize.fn('LOWER', sequelize.col('usn')),
         trimmedId.toLowerCase()
       )
     });
     ```
     If found, resolves the linked `User` record via `studentMatch.userId`.

### 3.3 Password Verification & Automatic Hashing Upgrade
- Implemented in `User.comparePassword(password)` (`[User.ts:L33-L68](file:///e:/jcererp/Admission_process/backend/src/models/User.ts#L33-L68)`):
  - Checks if `passwordHash` matches secure Bcrypt formatting (starts with `$2`).
  - Calls `await bcrypt.compare(password, this.passwordHash)`.
  - **Legacy Plaintext Protection:** If the stored record is an unhashed legacy string (e.g. from manual database seeding), it compares plaintext directly; if valid, it automatically generates a salt (`bcrypt.genSalt(10)`), hashes the password, and updates PostgreSQL atomically.

### 3.4 Account Status and Authorization Checks
- Implemented in [`auth.controller.ts:L164-L171`](file:///e:/jcererp/Admission_process/backend/src/controllers/auth.controller.ts#L164-L171):
  - `status === 'PENDING_AUTHORIZATION'`: Returns HTTP `403 Forbidden` (`"Your account is pending administrator/dean authorization. Please wait for authorization."`).
  - `status === 'INACTIVE'` or `'SUSPENDED'`: Returns HTTP `403 Forbidden` (`"Your account is inactive or suspended"`).

### 3.5 Two-Factor Daily Login OTP Check (Staff Roles)
- Implemented in [`auth.controller.ts:L183-L251`](file:///e:/jcererp/Admission_process/backend/src/controllers/auth.controller.ts#L183-L251):
  - Function `isDailyOtpRequiredRole(user.role)` targets: `ADMIN`, `SUPER_ADMIN`, `PRINCIPAL`, `DEAN`, `HOD`, `TEACHER`, `FACULTY`.
  - **`STUDENT` and `PARENT` roles are completely exempt from Daily OTP.**
  - If a staff member has not verified a Daily OTP within the past 24 hours:
    - Generates a 6-digit OTP via `otpService.generateAndSaveOtp`.
    - Dispatches email via `emailService.sendDailyLoginOTP`.
    - Returns HTTP `200 OK` with `{ success: true, requiresDailyOtp: true, email: "...", role: "..." }`.
    - Final JWT is withheld until `POST /api/auth/verify-daily-otp` is submitted.

### 3.6 Login Throttling & Protection Mechanisms
- **Endpoint Rate Limiter:** Guarded by `authLimiter` (`[rateLimit.middleware.ts:L24-L33](file:///e:/jcererp/Admission_process/backend/src/middleware/rateLimit.middleware.ts#L24-L33)`):
  - Production: **30 requests per minute per IP**.
  - Development: **1000 requests per minute per IP**.
  - Triggered Response: HTTP `429 Too Many Requests` (`"Too many authentication attempts. Please wait 1 minute and try again."`).
- **Security Audit Logging:** Failed logins trigger `securityEvents.loginFailure` recording IP, User-Agent, identifier, and reason in the `audit_logs` table (`[securityEvents.service.ts:L122-L134](file:///e:/jcererp/Admission_process/backend/src/services/securityEvents.service.ts#L122-L134)`).

---

## 4. Sanitized Login Request and Response

### 4.1 Successful Direct Login (Student Role)
#### Request
```http
POST /api/auth/login HTTP/1.1
Host: api.jcer.edu.in
Content-Type: application/json

{
  "email": "student@jcer.edu.in",
  "password": "CorrectStudentPassword123"
}
```

#### Response
```http
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8

{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImUxYjJkMTgwLTJhNWMtNGQzNy04ZjU2LTliMTY4OTJlOGZhMiIsInJvbGUiOiJTVFVERU5UIiwidHYiOjEsImlhdCI6MTczMDI3MDAwMCwiZXhwIjoxNzMwODc0ODAwfQ.mockSignatureValue...",
    "user": {
      "id": "e1b2d180-2a5c-4d37-8f56-9b16892e8fa2",
      "email": "student@jcer.edu.in",
      "role": "STUDENT",
      "name": "Alex Kumar",
      "firstName": "Alex",
      "lastName": "Kumar",
      "phone": "9876543210",
      "profileImage": "https://cdn-icons-png.flaticon.com/512/3135/3135715.png",
      "mustChangePassword": false,
      "system": "ERP",
      "isHod": false,
      "isFaculty": false,
      "workspaces": []
    }
  }
}
```

### 4.2 Successful Staff Login Requiring Daily OTP
#### Request
```http
POST /api/auth/login HTTP/1.1
Host: api.jcer.edu.in
Content-Type: application/json

{
  "email": "faculty@jcer.edu.in",
  "password": "CorrectFacultyPassword123"
}
```

#### Response
```http
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8

{
  "success": true,
  "requiresDailyOtp": true,
  "email": "faculty@jcer.edu.in",
  "role": "TEACHER",
  "message": "Daily OTP verification required for teacher login."
}
```

### 4.3 Error Responses
- **Missing Credentials (HTTP 400 Bad Request):**
  ```json
  { "error": "Email and password are required" }
  ```
- **Invalid Password or Unregistered User (HTTP 401 Unauthorized):**
  ```json
  { "error": "Invalid email or password" }
  ```
- **Deactivated or Suspended Account (HTTP 403 Forbidden):**
  ```json
  { "error": "Your account is inactive or suspended" }
  ```
- **Pending Dean/Administrator Approval (HTTP 403 Forbidden):**
  ```json
  { "error": "Your account is pending administrator/dean authorization. Please wait for authorization." }
  ```
- **Rate Limit Triggered (HTTP 429 Too Many Requests):**
  ```json
  { "error": "Too many authentication attempts. Please wait 1 minute and try again." }
  ```

---

## 5. JWT Generation and Validation

### 5.1 Token Specifications
- **JWT Library:** `jsonwebtoken` (v9.0.2) (`[package.json:L41](file:///e:/jcererp/Admission_process/backend/package.json#L41)`).
- **Signing Algorithm:** Symmetric HMAC-SHA256 (`HS256`).
- **Signing Secret:** Loaded from environment variable `JWT_SECRET` (`[jwt.util.ts:L6](file:///e:/jcererp/Admission_process/backend/src/utils/jwt.util.ts#L6)`).
- **Expiration Configuration:** Loaded from environment variable `JWT_EXPIRY` with fallback to `'7d'` (`[jwt.util.ts:L7](file:///e:/jcererp/Admission_process/backend/src/utils/jwt.util.ts#L7)`).

### 5.2 Access Token Claims & Structure
Tokens are signed in `generateToken` (`[jwt.util.ts:L9-L11](file:///e:/jcererp/Admission_process/backend/src/utils/jwt.util.ts#L9-L11)`):
```typescript
export const generateToken = (payload: { id: string; role: string; tv: number }): string => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY as any });
};
```
Decoded Access Token structure:
```json
{
  "id": "e1b2d180-2a5c-4d37-8f56-9b16892e8fa2",
  "role": "STUDENT",
  "tv": 1,
  "iat": 1730270000,
  "exp": 1730874800
}
```
> [!IMPORTANT]
> **Claim Verification:** The ERP JWT payload **only** contains `id`, `role`, and `tv`. It **does not** contain `email`, `firstName`, `lastName`, student `usn`, `iss` (issuer), or `aud` (audience).

### 5.3 Refresh Token Architecture
- **Signing Secret:** `JWT_REFRESH_SECRET` (distinct from `JWT_SECRET`) (`[auth.service.ts:L7](file:///e:/jcererp/Admission_process/backend/src/services/auth.service.ts#L7)`).
- **Expiration:** Hardcoded to `'7d'` (`[auth.service.ts:L8](file:///e:/jcererp/Admission_process/backend/src/services/auth.service.ts#L8)`).
- **Redis State:** Stored under key `session:${userId}` with a 7-day TTL (`[redis.service.ts:L7-L10](file:///e:/jcererp/Admission_process/backend/src/services/redis.service.ts#L7-L10)`).
- **Token Rotation:** Every invocation of `POST /api/auth/refresh-token` validates the Redis session, invalidates the old token, and generates a fresh token pair (`[auth.service.ts:L34-L57](file:///e:/jcererp/Admission_process/backend/src/services/auth.service.ts#L34-L57)`).

### 5.4 Token Validation Middleware (`authMiddleware`)
Protected ERP endpoints validate requests via `authMiddleware` in [`auth.middleware.ts:L29-L114`](file:///e:/jcererp/Admission_process/backend/src/middleware/auth.middleware.ts#L29-L114):
1. **Header Extraction:** Extracts token from `Authorization: Bearer <token>` or query parameter `token`.
2. **Cryptographic Check:** Verifies signature and expiration against `JWT_SECRET`.
3. **Zero-Trust Database Lookup:** Queries PostgreSQL directly: `User.findByPk(decoded.id)`.
4. **Status Check:** Enforces `user.status === 'ACTIVE'`.
5. **Token Version Verification:** Compares `decoded.tv === user.tokenVersion`. If mismatched (due to logout or password reset), immediately aborts with HTTP 401.
6. **Inactivity Timeout:** For `STUDENT` users, checks elapsed time since `user.lastActivityAt`. If greater than 60 minutes (`STUDENT_INACTIVITY_TIMEOUT_MINUTES`), terminates session with code `'SESSION_INACTIVE'`.
7. **Request Context:** Attaches verified database record to `req.user`.

### 5.5 Client Token Storage & Cookie Settings
- **Access Token:** Stored in browser `localStorage.setItem('token', token)` (`[auth.service.ts:L46](file:///e:/jcererp/Admission_process/frontend/src/services/auth.service.ts#L46)`).
- **User Object:** Stored in browser `localStorage.setItem('user', JSON.stringify(user))`.
- **Refresh Token Cookie Settings:**
  - Name: `refreshToken`
  - `httpOnly`: `true`
  - `secure`: `true` in production (`process.env.NODE_ENV === 'production'`)
  - `sameSite`: `'strict'` (withheld on all cross-origin requests)
  - `maxAge`: `604800000` (7 days in milliseconds)

---

## 6. User Database and Role Structure

### 6.1 Database Schema & Tables
- **Database Engine:** PostgreSQL.
- **Primary Authentication Table:** `users` (`[User.ts:L71-L169](file:///e:/jcererp/Admission_process/backend/src/models/User.ts#L71-L169)`).
- **Stable Primary Key:** `id` (PostgreSQL `UUID` generated via `DataTypes.UUIDV4`).
- **Core User Fields:**
  - `id`: UUID (Primary Key).
  - `email`: VARCHAR(100), unique, validated by `isEmail`.
  - `username`: VARCHAR(50), unique, nullable.
  - `passwordHash`: VARCHAR(255), stores 60-character Bcrypt hash.
  - `role`: ENUM (`'SUPER_ADMIN'`, `'ADMIN'`, `'HOD'`, `'TEACHER'`, `'STUDENT'`, `'PARENT'`, `'PRINCIPAL'`, `'DEAN'`).
  - `status`: ENUM (`'ACTIVE'`, `'INACTIVE'`, `'SUSPENDED'`, `'PENDING_AUTHORIZATION'`).
  - `tokenVersion`: INTEGER (default `1`).
  - `lastActivityAt`: TIMESTAMP WITH TIME ZONE.

### 6.2 Extended Role Tables
Role details are segregated into dedicated satellite tables linked via foreign key `userId` to `users.id`:
- **Students (`students`):** Stores `usn` (e.g. `2JC22CS001`), `enrollmentNumber`, `batchYear`, `departmentId`, `semester`, `section` (`[Student.ts:L41-L100](file:///e:/jcererp/Admission_process/backend/src/models/Student.ts#L41-L100)`).
- **Teachers / Faculty (`teachers`):** Stores `departmentId`, `designation`, `status` (`ACTIVE`/`ARCHIVED`) (`[Teacher.ts:L26-L93](file:///e:/jcererp/Admission_process/backend/src/models/Teacher.ts#L26-L93)`).
- **Heads of Department (`hods`):** Stores `departmentId`, `tenureStartDate`, `isActive` (`[HOD.ts:L17-L66](file:///e:/jcererp/Admission_process/backend/src/models/HOD.ts#L17-L66)`).
- **Administrators (`admins`):** Stores `employeeId`, `designation` (`[Admin.ts:L15-L45](file:///e:/jcererp/Admission_process/backend/src/models/Admin.ts#L15-L45)`).

### 6.3 Decoupled Identity Reference for SignalSafe
SignalSafe can reference existing ERP users cleanly without replicating passwords or user records:
1. SignalSafe's database maintains its own `users` table.
2. The SignalSafe `users` table records `erp_user_id` (`UUID`, matching `users.id` in ERP).
3. SignalSafe stores local profile attributes (`email`, `full_name`, `role`, `department`).
4. **SignalSafe never stores ERP password hashes, salts, or raw passwords.**

---

## 7. Current-User/Profile API

The ERP provides two dedicated endpoints to retrieve the authenticated user's profile and capabilities:

### 7.1 Status Profile Endpoint (`GET /api/auth/status`)
- **HTTP Method:** `GET`
- **Route:** `/api/auth/status` (or `/api/v1/auth/status`)
- **Authentication:** Required (`Authorization: Bearer <token>`).
- **Controller Action:** `status` in [`auth.controller.ts:L330-L358`](file:///e:/jcererp/Admission_process/backend/src/controllers/auth.controller.ts#L330-L358).
- **Response Format:**
  ```json
  {
    "success": true,
    "data": {
      "user": {
        "id": "e1b2d180-2a5c-4d37-8f56-9b16892e8fa2",
        "email": "student@jcer.edu.in",
        "role": "STUDENT",
        "name": "Alex Kumar",
        "firstName": "Alex",
        "lastName": "Kumar",
        "phone": "9876543210",
        "profileImage": "https://cdn-icons-png.flaticon.com/512/3135/3135715.png",
        "mustChangePassword": false,
        "department": {
          "id": "7b8f9a21-4d32-4981-a472-88746c1920ee",
          "name": "Computer Science and Engineering",
          "code": "CSE"
        },
        "system": "ERP",
        "isHod": false,
        "isFaculty": false,
        "workspaces": []
      }
    }
  }
  ```

### 7.2 Workspaces Capability Endpoint (`GET /api/auth/workspaces`)
- **HTTP Method:** `GET`
- **Route:** `/api/auth/workspaces` (alias: `/api/me/workspaces`)
- **Authentication:** Required (`Authorization: Bearer <token>`).
- **Controller Action:** `getUserWorkspaces` in [`auth.controller.ts:L1293-L1340`](file:///e:/jcererp/Admission_process/backend/src/controllers/auth.controller.ts#L1293-L1340).
- **Response Format:** Returns active dashboard capabilities for multi-role faculty (e.g. HOD, Dean, Faculty switcher).

---

## 8. Cross-Origin and Deployment Configuration

### 8.1 Network and Port Mapping
- **Local Development Ports:**
  - ERP Backend API: `http://localhost:5000` (or `http://127.0.0.1:5000`).
  - ERP Frontend: `http://localhost:5173`.
  - SignalSafe Frontend: Default Vite port (e.g. `http://localhost:5174` or `5175`).
  - SignalSafe Backend: Custom port (e.g. `http://localhost:8000` or `5050`).
- **Production Cloud Deployment:**
  - ERP Frontend: Cloudflare Pages (`https://jcererp.pages.dev`).
  - ERP Backend: Deployed on Render (`render.yaml`) and/or Railway (`railway.json`).
  - SignalSafe: Expected independent domain (e.g. `https://signalsafe.jcer.edu.in` or Vercel).

### 8.2 CORS Configuration (`corsConfig.middleware.ts`)
- Configured in [`corsConfig.middleware.ts:L26-L87`](file:///e:/jcererp/Admission_process/backend/src/middleware/corsConfig.middleware.ts#L26-L87).
- Supports dynamic origins matching `.pages.dev`, `.onrender.com`, `.railway.app`, `.vercel.app`, and tunnel proxies.
- Includes `credentials: true`.
- **Server-to-Server Requests:** Line 29 explicitly allows requests lacking an `Origin` header (`if (!origin) return callback(null, true);`). A separate backend server can invoke ERP endpoints over HTTP/HTTPS without browser CORS blocking.

### 8.3 Authentication Environment Variables
| Variable Name | Component | Verified Functionality |
| :--- | :--- | :--- |
| `NODE_ENV` | Backend | Determines production logging, SSL, and cookie security flags. |
| `PORT` | Backend | Server listener port (default: `5000`). |
| `DATABASE_URL` | Backend | PostgreSQL connection string. |
| `REDIS_URL` | Backend | Redis connection string for session management. |
| `JWT_SECRET` | Backend | Symmetric HMAC secret for Access Token signing. |
| `JWT_EXPIRY` | Backend | Access Token lifespan (e.g. `'7d'`). |
| `JWT_REFRESH_SECRET` | Backend | Secret for Refresh Token signing. |
| `CORS_ORIGIN` | Backend | Comma-separated list of allowed frontend origins. |
| `FRONTEND_URL` | Backend | Primary ERP frontend URL. |
| `VITE_API_URL` | Frontend | Base URL for ERP API requests (`https://api.yourdomain.com/api`). |

---

## 9. Security Findings

1. **Symmetric Secret Sharing is an Architectural Anti-Pattern:**
   - The ERP signs tokens using symmetric HMAC (`HS256`).
   - If SignalSafe attempts to verify ERP JWTs locally, the ERP's `JWT_SECRET` would have to be copied into SignalSafe's environment. If SignalSafe were ever compromised, an attacker could forge tokens with full administrative privileges on the ERP.
2. **ERP JWTs Omit Identity Claims:**
   - The ERP JWT contains only `{ id, role, tv }`. It omits user email, names, and student USNs. Verifying the token signature offline does not yield the user's identity.
3. **Missing Token Issuer (`iss`) and Audience (`aud`):**
   - The ERP JWT does not set or check `iss` or `aud`. Tokens cannot be cryptographically scoped to a specific application audience.
4. **Stateful Invalidation Dependency:**
   - ERP's `authMiddleware` validates `user.tokenVersion === decoded.tv` on every request against PostgreSQL. A detached token check conducted outside the ERP cannot detect if an account was suspended or logged out.
5. **Staff Daily OTP Blocks Automated Proxying:**
   - Staff roles require an interactive 6-digit email OTP. If SignalSafe permits faculty/admin login, it must either implement the 2-step OTP modal or the ERP must provide a dedicated internal credential verification endpoint.
6. **Perimeter Throttling on Login (`authLimiter`):**
   - The production rate limit of 30 requests/minute per IP will be overwhelmed if all campus students submit credentials through the SignalSafe backend's single egress IP address.
7. **Strict Cross-Origin Cookie Isolation:**
   - The ERP refresh token cookie uses `sameSite: 'strict'`, preventing it from being transmitted to or read by any external domain.

---

## 10. Integration Options Comparison

| Evaluation Metric | Option A: SignalSafe Backend Calls ERP Login API | Option B: Validate ERP JWT in SignalSafe | Option C: OAuth 2.0 / SSO / Dedicated Internal API |
| :--- | :--- | :--- | :--- |
| **Current ERP Code Compatibility** | **100% Compatible** (Endpoint is operational today) | **Incompatible** (Token lacks claims & uses symmetric key) | **Partial** (No OAuth2 provider exists; internal API easily added) |
| **Credential Security** | **High** (Passwords passed in memory directly to ERP backend) | **N/A** (Relies on external token handoff) | **Highest** (Centralized identity delegation) |
| **Cryptographic Secret Isolation** | **Complete Isolation** (SignalSafe uses its own JWT secret) | **Critical Risk** (Requires sharing ERP `JWT_SECRET`) | **Complete Isolation** (Separate keys or mutual API keys) |
| **Rate Limit Impact** | **High Risk** (Subject to 30 req/min `authLimiter`) | **None** (Offline verification) | **Controlled** (Internal service bypass) |
| **Staff Daily OTP Handling** | Requires forwarding Daily OTP challenges | Cannot handle offline | Configurable per service |
| **User Profile Data** | Returns complete profile (`id`, `role`, `name`, `dept`) | Fails (JWT lacks identity claims) | Returns complete profile |
| **Verdict** | **Recommended for Immediate Implementation** (with IP rate-limit adjustment) | **Not Recommended** (Violates security boundaries) | **Recommended for Long-Term Multi-App Strategy** |

---

## 11. Recommended SignalSafe Authentication Architecture

### 11.1 Architectural Model: Delegated Server-to-Server Authentication with Independent Sessions
The recommended approach utilizes **Option A** with strict security isolation:

1. **Clean Separation of Concerns:**
   - SignalSafe provides its own login screen.
   - SignalSafe's backend receives credentials over HTTPS and proxies them in-memory to the ERP backend.
   - SignalSafe never stores ERP passwords.
2. **Independent Session Tokens:**
   - The ERP returns its ERP JWT and user payload to the SignalSafe backend.
   - The SignalSafe backend **discards the ERP JWT** and issues a brand-new **SignalSafe JWT** signed with `SIGNALSAFE_JWT_SECRET`.
   - The SignalSafe JWT encodes: `{ userId, erpUserId, role, email }`.
3. **Local Identity Shadow Record:**
   - SignalSafe's database stores:
     - `id`: SignalSafe internal UUID.
     - `erp_user_id`: ERP User UUID.
     - `email`: User email.
     - `role`: Role string (`STUDENT`, `FACULTY`, `ADMIN`).
     - `department`: Department name/code.
     - `created_at` / `updated_at`.
   - Cybersecurity incidents, phishing reports, and threat logs in SignalSafe link to SignalSafe's internal user ID.

---

## 12. Proposed Authentication Flow Diagram

```
+---------------------------------------------------------------------------------------------------+
|                                 SIGNALSAFE CAMPUS AUTHENTICATION FLOW                             |
+---------------------------------------------------------------------------------------------------+

 [ JCER Digital Portal ]                               [ SignalSafe Campus Frontend ]
   (Cloudflare Pages)                                    (Vite React Web App)
           |                                                           |
           | User clicks "SignalSafe"                                  | 1. User enters ERP Email & Password
           +---------------------------------------------------------->|
                                                                       | 2. POST /api/auth/login
                                                                       |    { email, password }
                                                                       v
                                                        [ SignalSafe Campus Backend ]
                                                                       |
                                                                       | 3. Server-to-Server HTTPS POST
                                                                       |    /api/auth/login
                                                                       |    (or /api/auth/internal/verify)
                                                                       v
                                                        [ JCER ERP Backend API ]
                                                                       |
                                                +----------------------+----------------------+
                                                | 4. Verify Identity & Status                 | 4b. Verify OTP State
                                                v                                             v
                                      [ PostgreSQL Database ]                         [ Redis Store ]
                                        - users (comparePassword)                       - session:${id}
                                        - students (USN match)
                                                |
                                                | 5. HTTP 200 OK
                                                |    { token, user: { id, email, role, name, ... } }
                                                v
                                        [ JCER ERP Backend API ]
                                                |
                                                | 6. Returns authenticated ERP user profile
                                                v
                                  [ SignalSafe Campus Backend ]
                                                |
                                                | 7. Upsert local user record by erp_user_id
                                                v
                                      [ SignalSafe Database ]
                                        - users (erp_user_id, email, role)
                                        - scam_reports, threat_logs
                                                |
                                                | 8. Issue SignalSafe JWT (SIGNALSAFE_JWT_SECRET)
                                                |    Set HTTP-only session cookie / return token
                                                v
                                  [ SignalSafe Campus Frontend ]
                                                |
                                                | 9. Save session & navigate
                                                v
                                  [ SignalSafe Role Dashboard ]
                                    - Student Scam Shield Dashboard
                                    - Faculty Cyber Safety Dashboard
                                    - Security Administrator Dashboard
```

---

## 13. Exact Files That Would Need Modification

> [!NOTE]
> In accordance with the audit guidelines, **no existing files were modified**. The following files are identified for future modification when integration begins:

1. **[`Admission_process/backend/src/middleware/rateLimit.middleware.ts`](file:///e:/jcererp/Admission_process/backend/src/middleware/rateLimit.middleware.ts#L24-L33):**
   - *Target Lines:* 24–33 (`authLimiter`).
   - *Modification:* Add an IP whitelist or trusted header check (`x-internal-service-key`) to exempt requests originating from the SignalSafe backend server from the 30 req/min limit.
2. **[`Admission_process/backend/src/middleware/corsConfig.middleware.ts`](file:///e:/jcererp/Admission_process/backend/src/middleware/corsConfig.middleware.ts#L12-L24):**
   - *Target Lines:* 12–24 (`defaultAllowedOrigins`).
   - *Modification:* Add the SignalSafe production frontend domain (e.g. `https://signalsafe.jcer.edu.in`) to the origin whitelist if direct browser requests are needed.
3. *(Optional / Recommended for Staff SSO)* **[`Admission_process/backend/src/routes/auth.routes.ts`](file:///e:/jcererp/Admission_process/backend/src/routes/auth.routes.ts#L10-L16):**
   - *Target Lines:* 10–16.
   - *Modification:* Register `router.post('/internal/verify-credentials', internalServiceGuard, authController.verifyInternalCredentials);`.
4. *(Optional / Recommended for Staff SSO)* **[`Admission_process/backend/src/controllers/auth.controller.ts`](file:///e:/jcererp/Admission_process/backend/src/controllers/auth.controller.ts#L119):**
   - *Target Lines:* Adjacent to `login`.
   - *Modification:* Add `verifyInternalCredentials` controller returning verified user profile without triggering the interactive 2FA Daily OTP email for satellite apps.

---

## 14. Minimum Required ERP Changes

To achieve 100% production readiness for SignalSafe, the ERP backend requires only **two minimal adjustments**:

### 14.1 Whitelist SignalSafe Backend IP in Rate Limiter
In [`rateLimit.middleware.ts`](file:///e:/jcererp/Admission_process/backend/src/middleware/rateLimit.middleware.ts#L24-L33), update `authLimiter` to skip rate limiting for the SignalSafe backend IP or for requests bearing a pre-shared service key:
```typescript
export const authLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: isDev ? 1000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    const trustedIps = (process.env.TRUSTED_SERVICE_IPS || '').split(',');
    return trustedIps.includes(req.ip || '');
  },
  message: {
    error: 'Too many authentication attempts. Please wait 1 minute and try again.',
  },
});
```

### 14.2 (If Staff Access Required) Exemption or Proxy for Daily OTP
If faculty and administrators must log into SignalSafe:
- **Approach 1:** SignalSafe frontend implements a 6-digit OTP verification modal that proxies to ERP's `/api/auth/verify-daily-otp`.
- **Approach 2 (Cleaner):** ERP provides a dedicated internal endpoint `POST /api/auth/internal/verify-credentials` secured with an `INTERNAL_SERVICE_KEY`, which verifies credentials against PostgreSQL and returns user profile data directly.

---

## 15. SignalSafe Backend Responsibilities

The SignalSafe backend must implement the following operations:
1. **Login API Proxy Handler (`POST /api/auth/login`):**
   - Receives `{ email, password }` from the SignalSafe frontend.
   - Sends an HTTPS POST request to the ERP backend's `/api/auth/login`.
   - Disables TLS certificate validation bypass (enforces strict SSL).
2. **Identity Shadowing & Synchronization:**
   - Extracts `user.id`, `user.email`, `user.role`, `user.name`, and `user.department` from ERP's response.
   - Executes an upsert query in SignalSafe's PostgreSQL/MongoDB database:
     - Locates existing record where `erp_user_id = user.id`.
     - Updates email, name, role, and last login timestamp.
     - Inserts a new record if this is the user's first login.
3. **Session Token Issuance:**
   - Generates a SignalSafe JWT using its own private secret (`SIGNALSAFE_JWT_SECRET`).
   - Issues the token to the frontend in an HTTP-only, secure, `SameSite=Lax` cookie or JSON payload.
4. **Role Routing:**
   - Maps the ERP role (`STUDENT`, `TEACHER`, `ADMIN`) to SignalSafe access permissions:
     - `STUDENT` -> Student Scam Shield Dashboard (screenshot & URL scanning).
     - `TEACHER` / `FACULTY` -> Faculty Security Awareness Dashboard.
     - `ADMIN` / `SUPER_ADMIN` -> Campus Threat Management & Incident Response Console.

---

## 16. Unverified Details and Open Questions

| Item | Status | Impact / Open Question |
| :--- | :--- | :--- |
| **SignalSafe User Scope** | **Unverified** | Will SignalSafe be restricted to Students, or will Faculty, HODs, Deans, and Principals also use it? If staff use it, Daily OTP handling is mandatory. |
| **SignalSafe Backend Egress IP** | **Unverified** | Will the SignalSafe backend have a static public IP address for IP whitelisting in `rateLimit.middleware.ts`? |
| **SignalSafe Deployment Domain** | **Unverified** | Will SignalSafe be hosted on a subdomain of `jcer.edu.in` (e.g. `signalsafe.jcer.edu.in`) or an independent cloud domain? Subdomain hosting simplifies cookie policy. |
| **Active Production Backend Host** | **Partially Verified** | The repo contains configs for Render (`render.yaml`) and Railway (`railway.json`). The exact live production endpoint URL must be confirmed before configuring SignalSafe. |

---

## 17. Implementation Readiness Assessment

### Final Verdict: **PRODUCTION READY (With Rate-Limit Whitelist)**

- **Immediate Usability:** The existing JCER ERP authentication system **can support student authentication for SignalSafe immediately** without code changes in local development.
- **Production Pre-requisite:** Before deploying to live student traffic, the ERP backend's `authLimiter` must be updated to whitelist the SignalSafe backend's server IP to prevent HTTP 429 throttling.
- **Architectural Integrity:** Both systems remain cleanly decoupled. ERP retains complete ownership of passwords and user records; SignalSafe maintains complete ownership of cybersecurity scam reports and incident telemetry.

---
*Report Generated: October 2026*  
*Target File: `e:/jcererp/JCER_AUTHENTICATION_AUDIT_FOR_SIGNALSAFE.md`*
