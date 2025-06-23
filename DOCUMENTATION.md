
# StallSync - Application Documentation

## Table of Contents

1.  [Introduction](#introduction)
2.  [Tech Stack](#tech-stack)
3.  [Project Structure](#project-structure)
4.  [Setup and Installation](#setup-and-installation)
    *   [Prerequisites](#prerequisites)
    *   [Environment Variables (.env.local)](#environment-variables-envlocal)
    *   [Firebase Project Setup](#firebase-project-setup)
    *   [Running the Application](#running-the-application)
5.  [Core Features & Functionality](#core-features--functionality)
    *   [Authentication & Roles](#authentication--roles)
    *   [Dashboard](#dashboard)
    *   [Stock Item Management](#stock-item-management)
    *   [Sales Recording & History](#sales-recording--history)
    *   [Food Stall Management](#food-stall-management)
    *   [User Management (Admin)](#user-management-admin)
    *   [Site & Stall Management (Admin)](#site--stall-management-admin)
    *   [Activity Log (Admin)](#activity-log-admin)
    *   [Reporting (Manager & Admin)](#reporting-manager--admin)
    *   [Profile Management](#profile-management)
    *   [Settings (Manager & Admin)](#settings-manager--admin)
    *   [AI-Powered Features](#ai-powered-features)
6.  [Key Components Overview](#key-components-overview)
7.  [Context Providers](#context-providers)
8.  [Backend Services](#backend-services)
    *   [Firebase Functions](#firebase-functions)
    *   [Next.js API Routes](#nextjs-api-routes)
9.  [AI Integration (Genkit)](#ai-integration-genkit)
10. [Data Models (Types)](#data-models-types)
11. [Deployment](#deployment)
12. [User Journeys](#user-journeys)
    *   [Admin User](#admin-user)
    *   [Manager User](#manager-user)
    *   [Staff User](#staff-user)
13. [Production Readiness Considerations](#production-readiness-considerations)
    *   [Firestore Security Rules](#firestore-security-rules)
    *   [Testing Strategy](#testing-strategy)
    *   [Logging and Monitoring](#logging-and-monitoring)
    *   [Backup and Restore](#backup-and-restore)
    *   [Legal and Compliance](#legal-and-compliance)

---

## 1. Introduction

StallSync is a comprehensive stock and sales management application designed for businesses with multiple sites and stalls (e.g., retail counters, storage areas). It allows users to track inventory, record sales, manage staff, and gain insights into their operations. It also includes a dedicated module for managing food stall specific expenses and sales. The application features role-based access control (Admin, Manager, Staff), is fully mobile-responsive, and leverages AI for tasks like product description generation and sales trend summarization.

---

## 2. Tech Stack

*   **Frontend:** Next.js (v15+ with App Router), React (v18+), TypeScript
*   **UI:** ShadCN UI Components, Tailwind CSS
*   **State Management:** React Context API (for Auth and Theme)
*   **Forms:** React Hook Form with Zod for validation
*   **Charts:** Recharts (via ShadCN UI Charts)
*   **Backend:** Firebase (Authentication, Firestore, Cloud Functions for Firebase)
*   **AI Integration:** Genkit (with Google AI/Gemini models)
*   **Testing:** Jest, React Testing Library
*   **Deployment:** Configured for Firebase App Hosting (see `apphosting.yaml`) and Firebase Hosting (for static parts, though primarily server-rendered with Next.js).

---

## 3. Project Structure

A brief overview of important directories:

*   **`/.firebase`**: Firebase emulator data (usually gitignored).
*   **`/functions`**: Contains Firebase Cloud Functions code (e.g., `createAuthUser`).
*   **`/public`**: Static assets (currently none significant).
*   **`/src/ai`**: Genkit AI integration files.
    *   `flows/`: Defines specific AI-powered flows (e.g., item description, sales summary).
    *   `genkit.ts`: Genkit initialization and configuration.
*   **`/src/app`**: Next.js App Router.
    *   `(app)/`: Authenticated routes and layouts for the main retail/stock management.
        *   `admin/`: Admin-specific pages.
        *   `dashboard/`, `items/`, `profile/`, `reports/`, `sales/`, `settings/`, `support/`, `users/`: Feature-specific pages.
        *   `layout.tsx`: Main authenticated layout with sidebar and header (reused by other sections).
    *   `(auth)/`: Authentication-related pages (login).
    *   `foodstall/`: Authenticated routes for the Food Stall Management module (e.g., `/foodstall/dashboard`).
        *   `activity-log/`: Activity log specific to food stall operations.
        *   `dashboard/`: Food stall dashboard.
        *   `expenses/`: Food stall expense tracking pages.
        *   `reports/`: Food stall financial reports.
        *   `sales/`: Food stall sales tracking pages.
        *   `layout.tsx`: Layout for the food stall section (reuses the main app layout).
    *   `api/`: Next.js API routes (server-side logic).
    *   `error.tsx`: Global error boundary.
    *   `globals.css`: Global styles and Tailwind CSS theme.
    *   `layout.tsx`: Root layout for the entire application.
    *   `loading.tsx`: Global loading UI.
    *   `page.tsx`: Root page, usually redirects based on auth state.
*   **`/src/components`**: Reusable UI components.
    *   `admin/`, `auth/`, `items/`, `layout/`, `reports/`, `sales/`, `shared/`, `users/`, `dashboard/`: Feature-specific components.
    *   `foodstall/`: Components specific to the food stall module (e.g., `FoodExpensesTable`, `FoodSalesTable`, `FoodStallReportClientPage`).
    *   `ui/`: ShadCN UI primitive components (Accordion, Button, Card, etc.).
*   **`/src/contexts`**: React Context providers.
    *   `AuthContext.tsx`: Manages user authentication state, active site/stall context.
    *   `ThemeContext.tsx`: Manages application theme (light/dark/system).
*   **`/src/hooks`**: Custom React hooks (e.g., `use-toast`, `use-mobile`).
*   **`/src/lib`**: Utility functions and configurations.
    *   `firebaseConfig.ts`: Firebase client SDK configuration.
    *   `foodStallLogger.ts`: Utility for logging food stall sales and expenses.
    *   `stockLogger.ts`: Utility for logging stock movements.
    *   `utils.ts`: General utility functions (e.g., `cn` for Tailwind class merging).
    *   `__tests__/`: Directory for unit tests for library functions.
*   **`/src/types`**: TypeScript type definitions for data models.
    *   `food.ts`, `food_log.ts`: Data models for food stall management.
*   **Root Files:**
    *   `next.config.ts`, `tailwind.config.ts`, `tsconfig.json`, `package.json`, etc.
    *   `firebase.json`, `firestore.rules`, `firestore.indexes.json`, `storage.rules`: Firebase project configuration and rules.
    *   `apphosting.yaml`: Configuration for Firebase App Hosting.
    *   `jest.config.js`, `jest.setup.js`: Jest testing configuration.

---

## 4. Setup and Installation

### Prerequisites

*   Node.js (v18 or later recommended)
*   npm or yarn
*   Firebase CLI (`npm install -g firebase-tools`)

### Environment Variables (.env.local)

Create a `.env.local` file in the root of your project. This file is crucial for connecting to your Firebase project and other services. **Do not commit this file to version control.**

```env
# Firebase Client SDK Configuration (for Next.js frontend)
NEXT_PUBLIC_FIREBASE_API_KEY=YOUR_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=YOUR_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID=YOUR_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=YOUR_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=YOUR_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID=YOUR_FIREBASE_APP_ID
# NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=YOUR_FIREBASE_MEASUREMENT_ID (Optional)

# Firebase Admin SDK Configuration (for Cloud Functions & Next.js API Routes acting as backend)
# This is typically a JSON string for the service account key.
# Ensure it's properly escaped if stored directly as a string.
# For deployed environments, it's often better to set this via the hosting provider's secret management.
# For local Firebase Emulator Suite, GOOGLE_APPLICATION_CREDENTIALS might not be needed if emulators are auto-configured.
# If deploying to Firebase Hosting/Functions or App Hosting, these can often be auto-detected or configured in the environment.
# GOOGLE_APPLICATION_CREDENTIALS_JSON='{"type": "service_account", ...}' # Option 1: Paste JSON content as string
# GOOGLE_APPLICATION_CREDENTIALS=/path/to/your/serviceAccountKey.json # Option 2: Path to service account file (preferred for local dev if not using JSON string)


# Google OAuth Credentials (for Google Sheets API integration)
# These should NOT be prefixed with NEXT_PUBLIC_ as they are sensitive.
GOOGLE_CLIENT_ID=YOUR_GOOGLE_OAUTH_CLIENT_ID
GOOGLE_CLIENT_SECRET=YOUR_GOOGLE_OAUTH_CLIENT_SECRET
# Example for local dev: http://localhost:9002/api/auth/google/callback
# Example for prod: https://your-app-domain.com/api/auth/google/callback
GOOGLE_REDIRECT_URI=YOUR_CONFIGURED_GOOGLE_OAUTH_REDIRECT_URI

# Genkit/Google AI - If using a specific API key for Genkit (often configured via gcloud auth or service account)
# GEMINI_API_KEY=YOUR_GEMINI_API_KEY (If not using Application Default Credentials)
```

*   **Firebase Client Config:** Obtain these from your Firebase project settings > Your apps > Select your web app > Firebase SDK snippet (Config).
*   **Firebase Admin SDK (`GOOGLE_APPLICATION_CREDENTIALS_JSON` or `GOOGLE_APPLICATION_CREDENTIALS` path):**
    *   Go to Firebase Console > Project Settings > Service accounts.
    *   Generate a new private key (JSON file).
    *   **Option 1 (Path - Recommended for local dev if not using functions emulator directly):** Set the `GOOGLE_APPLICATION_CREDENTIALS` environment variable in your terminal or `.env.local` to the *path* of this downloaded JSON file (e.g., `GOOGLE_APPLICATION_CREDENTIALS=/path/to/your/serviceAccountKey.json`). Next.js and Firebase Admin SDK might pick this up automatically.
    *   **Option 2 (JSON String):** Copy the *contents* of the JSON file into the `GOOGLE_APPLICATION_CREDENTIALS_JSON` variable in `.env.local` as a single-line, properly escaped JSON string. This is useful for environments where setting a file path is difficult.
    *   **For Cloud Functions & Firebase Hosting/App Hosting:** These services often have their own mechanisms for service account authentication (e.g., using the runtime service account). The Admin SDK `initializeApp()` without arguments will try to use Application Default Credentials.
*   **Google OAuth Credentials:**
    *   Go to Google Cloud Console > APIs & Services > Credentials.
    *   Create an OAuth 2.0 Client ID (for Web application).
    *   Add your `GOOGLE_REDIRECT_URI` to the "Authorized redirect URIs" section.

### Firebase Project Setup

1.  **Create Firebase Project:** If you haven't already, create a project at [console.firebase.google.com](https://console.firebase.google.com/).
2.  **Register Web App:** Add a Web App to your project (see Environment Variables section).
3.  **Enable Authentication:**
    *   Go to Authentication > Sign-in method.
    *   Enable "Email/Password".
4.  **Enable Firestore:**
    *   Go to Firestore Database > Create database.
    *   Start in **production mode** (you'll configure security rules next).
    *   Choose a Firestore location.
5.  **Security Rules (`firestore.rules`):**
    *   Deploy the `firestore.rules` file located in the project root:
        ```bash
        firebase deploy --only firestore:rules
        ```
    *   **It is CRITICAL to review and test these rules thoroughly.** The provided rules aim for a balance of security and functionality for the defined roles but may need further refinement based on specific production requirements.
6.  **Firestore Indexes (`firestore.indexes.json`):**
    *   As you develop and encounter query errors in the Firebase console or Next.js logs that mention missing indexes, Firestore will often provide a link to create them. Add these index definitions to `firestore.indexes.json`.
    *   Deploy indexes: `firebase deploy --only firestore:indexes`
7.  **Enable Cloud Functions:**
    *   Go to Functions in the Firebase console. Click "Get started" if it's your first time.
    *   The application uses a Firebase Function (`createAuthUser`) for admin-initiated user creation, which can be called from the client.

### Running the Application

1.  **Install Dependencies:**
    ```bash
    npm install
    # or
    yarn install
    ```
2.  **Deploy Firebase Functions (if you plan to use the callable `createAuthUser` function directly from client):**
    *   Navigate to the `functions` directory: `cd functions`
    *   Install dependencies: `npm install`
    *   Build functions: `npm run build`
    *   Deploy: `cd ..` (back to root) then `firebase deploy --only functions`
    *   *Note: The app also has a Next.js API route `/api/admin/create-user` that uses the Admin SDK server-side, which might be preferred over direct client calls to the Firebase Function for some architectures.*
3.  **Run Development Server:**
    ```bash
    npm run dev
    ```
    The application will typically be available at `http://localhost:9002`.
4.  **Run Tests:**
    ```bash
    npm test
    # or for watch mode:
    npm run test:watch
    ```
5.  **Build for Production:**
    ```bash
    npm run build
    ```
6.  **Start Production Server:**
    ```bash
    npm run start
    ```

---

## 5. Core Features & Functionality

### Authentication & Roles

*   **Login:** Users sign in with email and password.
*   **Roles:**
    *   **Admin:** Full access to all features, including user management, site/stall creation, and system-wide data.
    *   **Manager:** Manages specific assigned sites. Can view/manage stock and sales for their sites, view reports, and manage their profile.
    *   **Staff:** Operates within an assigned site and potentially a specific stall. Can record sales, manage stock quantities for their context, and view their profile.
*   **User Creation:** Admins create new users via the "User Management" page. Public sign-up is disabled.
*   **Firebase Authentication:** Used for managing user identities.
*   **Firestore `users` collection:** Stores additional user details, including their role and preferences.

### Dashboard

*   Provides an overview of key metrics: total items, sales, items sold today, low stock alerts.
*   Displays a 7-day sales chart.
*   Lists items low on stock.
*   Shows recent sales transactions.
*   Offers quick actions (Record Sale, Add New Item).
*   Data is contextual based on the active site/stall selected in the header and the user's role.

### Stock Item Management

*   **View Items:** List all stock items with filters for search, category, stock status, and stall/location (for admin/manager).
*   **Contextual View:**
    *   **Master Stock:** Items held at the site level, not assigned to a specific stall (`stallId` is `null`).
    *   **Stall Stock:** Items assigned to a specific stall (`stallId` is set). These are typically allocated from Master Stock and have an `originalMasterItemId` linking them back.
*   **Add New Item (`/items/new`):**
    *   Admins/Managers can add items to the selected site's Master Stock or directly to a selected Stall (which then becomes stall-specific stock, optionally linked or created anew).
    *   Staff can add items to their assigned context (if permissions allow, typically master stock for their site).
*   **Edit Item (`/items/[itemId]/edit`):** Update details of an existing item.
*   **Update Stock Quantity:** Directly change the quantity of an item. If it's stall stock linked to master, master stock is adjusted.
*   **Allocate to Stall (Master Stock only):** Move a quantity of a master stock item to a specific stall within the same site. This creates/updates a linked `StockItem` record for the stall.
*   **Return to Master (Stall Stock only):** Return a quantity of a stall stock item back to its original master stock.
*   **Transfer to Stall (Stall Stock only):** Move a quantity of an item from one stall to another within the same site.
*   **Delete Item:**
    *   Deleting a stall item returns its quantity to the master stock (if linked).
    *   Deleting a master item is prevented if it has active allocations to stalls.
*   **Batch Actions (for Stall Items):**
    *   Batch Edit Category/Threshold.
    *   Batch Edit Prices.
    *   Batch Set Stock Quantity.
    *   Batch Delete Selected.
*   **AI Description Generation:** Generate product descriptions using AI on the Item Form.

### Sales Recording & History

*   **Record Sale (`/sales/record`):**
    *   Staff/Managers/Admins can record sales for the currently active stall.
    *   Select items from the stall's available stock, specify quantity.
    *   Total amount is calculated automatically.
    *   Upon recording, stock quantities (both stall and linked master stock) are updated.
*   **Sales History (`/sales/history`):**
    *   View a paginated list of all sales transactions.
    *   Filter by date range.
    *   Managers/Admins can filter by staff member.
    *   Contextual to active site/stall.
*   **Sale Details (`/sales/history/[saleId]`):**
    *   View detailed information for a specific sale, including items sold, quantities, and prices.
    *   Printable receipt format.
*   **Delete Sale (Admin only):** Admins can mark a sale as "deleted" with a justification. This is a soft delete (`isDeleted: true`).

### Food Stall Management

*   **Path:** `/foodstall/...`
*   **Food Stall Dashboard (`/foodstall/dashboard`):** Overview of food stall specific metrics like total sales, total expenses, and net profit for a selected period (Today, Last 7 Days, This Month, All Time).
*   **Expense Tracking:**
    *   Record Food Stall Expenses (`/foodstall/expenses/record`): A detailed form to input purchases of groceries, supplies, etc. by category.
    *   View Expenses (`/foodstall/expenses`): A paginated and filterable list of all food stall expenses.
*   **Sales Tracking:**
    *   Manage Daily Sales (`/foodstall/sales/record`): A form to input and edit the total sales for a specific day, broken down by meal times (Breakfast, Lunch, Dinner, Snacks) and payment methods (HungerBox, UPI, Other).
    *   View Sales (`/foodstall/sales`): A paginated list of all daily sales summaries.
*   **Activity Log (`/foodstall/activity-log`):** View a paginated history of all recorded sales and expenses for food stalls.
*   **Financial Reports (`/foodstall/reports`):** A dedicated report page to analyze food stall financial performance, including total sales, total expenses, net profit, and top expense categories for a given period.
*   **Dedicated Data Models:** Uses `FoodItemExpense` and `FoodSaleTransaction` types defined in `src/types/food.ts`.

### User Management (Admin)

*   **Path:** `/users`
*   **View Users:** List all registered users with their display name, email, role, and assignments.
*   **Create User:** Admins can create new users (Auth + Firestore document) by providing email, password, display name, and role.
    *   **Staff Assignment:** Assign a default site and optionally a default stall.
    *   **Manager Assignment:** Assign one or more sites for the manager to oversee.
*   **Edit User Role:** Admins can change the role of existing users (except their own).
*   **Manage Assignments:**
    *   Admins can change default site/stall for Staff.
    *   Admins can change managed sites for Managers.
*   **Delete User Document:** Admins can delete a user's Firestore document. *Note: This does not delete the Firebase Authentication user record, which must be done via the Firebase Console.*

### Site & Stall Management (Admin)

*   **Manage Sites (`/admin/sites`):**
    *   View a list of all created sites.
    *   Add New Site (`/admin/sites/new`): Define site name and optional location.
    *   Edit Site (`/admin/sites/[siteId]/edit`): Update site details.
    *   Delete Site: Permanently removes a site. Associated stalls are *not* automatically deleted and become orphaned.
*   **Manage Stalls (`/admin/sites/[siteId]/stalls`):**
    *   View stalls specific to a selected site.
    *   Add New Stall (`/admin/sites/[siteId]/stalls/new`): Define stall name and type for the parent site.
    *   Edit Stall (`/admin/sites/[siteId]/stalls/[stallId]/edit`): Update stall details.
    *   Delete Stall: Permanently removes a stall.

### Activity Log (Admin)

*   **Path:** `/admin/activity-log`
*   View a paginated, detailed history of stock movements across all sites and stalls.
*   Logs include: item creation, updates, sales, allocations, returns, transfers, deletions.
*   Each log entry details the user, item, location, quantity change, and timestamp.

### Reporting (Manager & Admin)

*   **Path:** `/reports`
*   **Sales Summary Report:**
    *   View key performance metrics for a selected date range and site/stall context:
        *   Total Sales, Total Items Sold, Total COGS, Total Profit.
        *   Number of Sales, Average Sale Value, Profit Margin.
    *   Displays top-selling items by quantity.
    *   Includes an AI-generated summary of sales trends.

### Profile Management

*   **Path:** `/profile`
*   All users can view and update their display name.
*   **Default Preferences:** Users can set default filter preferences for the Item List and Sales History pages.
*   **Context Assignment (Role-Dependent):**
    *   **Admin:** Can set their *personal default viewing context* (site/stall) which applies when they log in.
    *   **Manager:** Cannot set a default site/stall here; their active context is chosen from their managed sites via the header selector. Managed sites are listed for reference.
    *   **Staff:** Their default site/stall are displayed as read-only (assigned by Admin).

### Settings (Manager & Admin)

*   **Path:** `/settings`
*   **Appearance:** (Placeholder for theme switching - currently uses system/localStorage).
*   **Notifications:** (Placeholder for future notification preferences).
*   **Data Export (CSV):**
    *   Export all stock items to a CSV file.
    *   Export all sales data to a CSV file.
*   **Google Sheets Integration:**
    *   Import/Export Stock Items or Sales History with Google Sheets.
    *   **Developer Setup Required:** This feature needs Google Cloud Project credentials, OAuth 2.0 setup (including `GOOGLE_REDIRECT_URI`), and a configured `/api/google-sheets-proxy` backend.
    *   Users will be prompted to authorize with Google if they haven't already.
    *   For exports, a new sheet is created if no Sheet ID is provided, otherwise, the specified sheet is updated.
    *   For imports, a Sheet ID is required, and the sheet must match the expected column headers.

### AI-Powered Features

*   **Item Description Generation:** On the "Add/Edit Item" form, users can click a button to have AI generate a product description based on the item's name and category. Uses `generateItemDescriptionFlow`.
*   **Sales Trend Summary:** On the "Reports" page, an AI-generated textual summary of sales trends is provided based on the current filters and data. Uses `summarizeSalesTrendsFlow`.

---

## 6. Key Components Overview

(A brief list, refer to code for full details)

*   **`/src/components/admin`**: `ActivityLogClientPage`, `SiteForm`, `SitesTable`, `StallForm`, `StallsTable`.
*   **`/src/components/auth`**: `LoginForm` (public sign-up form is deprecated).
*   **`/src/components/context`**: `SiteStallSelector` (used in header for context switching).
*   **`/src/components/dashboard`**: `DashboardSalesChart`.
*   **`/src/components/foodstall`**: `FoodExpensesClientPage`, `FoodSalesClientPage`, `FoodStallReportClientPage`, `FoodExpensesTable`, `FoodSalesTable`.
*   **`/src/components/items`**: `ItemControls`, `ItemForm`, `ItemTable`.
*   **`/src/components/layout`**: `AppHeaderContent`, `AppSidebarNav`, `UserNav`.
*   **`/src/components/reports`**: `ReportControls`, `SalesSummaryReportClientPage`.
*   **`/src/components/sales`**: `RecordSaleForm`, `SalesHistoryClientPage`, `SalesHistoryControls`, `SalesTable`.
*   **`/src/components/shared`**: `PageHeader`.
*   **`/src/components/users`**: `CreateUserDialog`, `UserManagementClientPage`, `UserTable`.
*   **`/src/components/ui`**: Base ShadCN UI components.

---

## 7. Context Providers

*   **`AuthContext` (`/src/contexts/AuthContext.tsx`):**
    *   Manages Firebase authentication state (`user`, `loading`).
    *   Stores the `AppUser` object with role and preferences.
    *   Handles sign-in, sign-up (internal, now deprecated for public use), and sign-out.
    *   Manages the currently active `siteId`, `stallId`, and their corresponding `Site` and `Stall` objects.
    *   Provides functions `setActiveSite` and `setActiveStall` for context switching.
    *   Persists active site/stall IDs to `localStorage` as a convenience.
*   **`ThemeContext` (`/src/contexts/ThemeContext.tsx`):**
    *   Manages application theme (light, dark, system).
    *   Persists theme preference to `localStorage`.

---

## 8. Backend Services

### Firebase Functions

*   **`createAuthUser` (`/functions/src/index.ts`):**
    *   A callable Cloud Function.
    *   Allows an authenticated admin user to create a new Firebase Authentication user.
    *   **Input:** `email`, `password`, `displayName`.
    *   **Output:** `{ uid, email, displayName }` of the newly created auth user.
    *   The client-side `CreateUserDialog` then uses this UID to create the corresponding Firestore user document.
    *   *Alternatively, the project has a Next.js API route (`/api/admin/create-user`) which uses the Admin SDK for user creation and is preferred if the Next.js backend is already running, as it doesn't require separate deployment of this Firebase Function.*

### Next.js API Routes

Located in `/src/app/api/`:

*   **`/admin/create-user/route.ts`:**
    *   **Method:** `POST`
    *   **Purpose:** Allows an authenticated admin to create a new Firebase Authentication user.
    *   **Auth:** Requires a Bearer token (Firebase ID token of the calling admin).
    *   **Input (JSON):** `{ email, password, displayName }`
    *   **Output (JSON):** Success: `{ uid, email, displayName }`, Error: `{ error, details?, code? }`
    *   This route uses the Firebase Admin SDK server-side to create the auth user. The client-side `CreateUserDialog` calls this route.
*   **`/admin/delete-user/[uid]/route.ts`:**
    *   **Method:** `DELETE`
    *   **Purpose:** Allows an authenticated admin to delete a Firebase Authentication user.
    *   **Auth:** Requires a Bearer token (Firebase ID token of the calling admin).
    *   **Input (URL Param):** `uid` of the user to delete.
    *   **Output (JSON):** Success: `{ message }`, Error: `{ error, details?, code? }`
    *   *Note: This API route currently only deletes the Firebase Auth user. Deleting the Firestore document for the user must be handled separately by client-side logic or another API if full cleanup is needed.*
*   **`/admin/reset-data/route.ts`:**
    *   **Method:** `POST`
    *   **Purpose:** Allows an authenticated admin to reset application data (excluding user accounts).
    *   **Auth:** Requires a Bearer token (Firebase ID token of the calling admin).
    *   **Input (JSON):** `{ confirmation: "RESET DATA" }`
    *   **Output (JSON):** Success: `{ message }`, Error: `{ error, details?, code? }`
*   **`/auth/google/callback/route.ts`:**
    *   **Method:** `GET`
    *   **Purpose:** Handles the OAuth 2.0 callback from Google after a user authorizes access (e.g., for Google Sheets integration).
    *   **Input (Query Params):** `code` (authorization code), `state` (Firebase UID of the user).
    *   **Functionality:** Exchanges the `code` for Google API tokens (access, refresh), stores them securely in Firestore under the user's UID (`userGoogleOAuthTokens` collection). Redirects the user back to the settings page.
*   **`/google-sheets-proxy/route.ts`:**
    *   **Method:** `POST`
    *   **Purpose:** Acts as a secure backend proxy for interacting with the Google Sheets API. Prevents exposing API keys or sensitive tokens directly to the client.
    *   **Auth:** Requires a Bearer token (Firebase ID token).
    *   **Input (JSON):** `{ action, dataType, sheetId?, sheetName? }`
        *   `action`: "importStockItems", "exportStockItems", "importSalesHistory", "exportSalesHistory"
        *   `dataType`: "stock", "sales"
        *   `sheetId`: (Optional for export, creates new if blank; Required for import) ID of the Google Sheet.
        *   `sheetName`: (Optional, defaults to 'Sheet1') Name of the specific sheet within the spreadsheet.
    *   **Functionality:**
        *   Retrieves the user's stored Google OAuth tokens.
        *   Refreshes tokens if necessary.
        *   Uses Google Sheets API to perform the requested action (read from or write to the sheet).
        *   Handles data transformation between app format and sheet format.
    *   **Output (JSON):** Success: `{ message, spreadsheetId?, url?, importedCount?, errors? }`, Error: `{ error, details?, needsAuth?, authUrl? }`

---

## 9. AI Integration (Genkit)

StallSync uses Genkit for AI-powered features, configured in `src/ai/genkit.ts` to use Google AI (Gemini models).

*   **`src/ai/flows/generate-item-description-flow.ts`:**
    *   **Purpose:** Generates a product description for a stock item.
    *   **Input:** `itemName`, `itemCategory`.
    *   **Output:** `{ description }`.
    *   Called from the "Add/Edit Item" form.
*   **`src/ai/flows/summarize-sales-trends-flow.ts`:**
    *   **Purpose:** Generates a textual summary of sales trends.
    *   **Input:** Sales statistics (`summaryStats`), top-selling items (`topSellingItems`), date range, optional site/stall names.
    *   **Output:** `{ summary }`.
    *   Called from the "Reports" page.

---

## 10. Data Models (Types)

TypeScript interfaces and Zod schemas define the structure of data used throughout the application. These are located in `src/types/`. Key types include:

*   `AppUser` (`user.ts`): User details, role, preferences.
*   `StockItem` (`item.ts`): Inventory item details.
*   `SaleTransaction`, `SoldItem` (`sale.ts`): Sales record structures.
*   `Site` (`site.ts`): Business location/site details.
*   `Stall` (`stall.ts`): Specific stall/counter details within a site.
*   `StockMovementLog` (`log.ts`): Logs for tracking inventory changes.
*   `UserGoogleOAuthTokens` (`user.ts`): For Google Sheets integration.
*   `FoodItemExpense`, `FoodSaleTransaction` (`food.ts`): Data models for food stall management.
*   `FoodStallActivityLog` (`food_log.ts`): Log for food stall activities.

---

## 11. Deployment

*   **Firebase Hosting/App Hosting:** The project is structured for easy deployment to Firebase.
    *   `firebase.json`: Configures Firebase Hosting (static assets, rewrites), Functions deployment, and Emulator settings.
    *   `apphosting.yaml`: Configuration for Firebase App Hosting (if used for the Next.js backend).
*   **Build Process:** `npm run build` creates an optimized production build in the `.next` directory (and `out` for static export, though less relevant for dynamic features).
*   **Deployment Commands:**
    *   `firebase deploy` (deploys all configured services)
    *   `firebase deploy --only hosting`
    *   `firebase deploy --only functions`
    *   For App Hosting, deployment is usually handled via connected GitHub repositories or `firebase apphosting:backends:deploy`.

---

## 12. User Journeys

### Admin User

1.  **Login:** Accesses the system using their admin credentials.
2.  **Dashboard Overview:** Lands on the dashboard, can select any site and then any stall (or "All Stalls") to view contextual data.
3.  **Site Management:** Navigates to "Manage Sites & Stalls". Creates a new "Main Warehouse" site. Edits its location.
4.  **Stall Management:** Selects "Main Warehouse", then adds two stalls: "Retail Counter A" and "Back Storage".
5.  **User Creation:** Navigates to "User Management".
    *   Creates a "Manager" user, assigns them to manage "Main Warehouse".
    *   Creates a "Staff" user, assigns their default site to "Main Warehouse" and default stall to "Retail Counter A".
6.  **Master Stock Creation:** Navigates to "Stock & Sales" -> "Stock Items". Selects "Main Warehouse" and ensures no specific stall is selected (or selects "Master Stock" filter). Adds new items (e.g., "Product X", "Product Y") to the master stock.
7.  **Stock Allocation:** From the "Stock Items" (Master Stock view), allocates quantities of "Product X" and "Product Y" to "Retail Counter A" and "Back Storage".
8.  **View Activity Log:** Checks the "Stock Activity Log" to see records of item creation and allocation.
9.  **View Reports:** Navigates to "Sales Reports", selects "Main Warehouse" and a date range to see sales summaries (initially zero).
10. **Settings:** Explores "Settings" to check data export options or reset application data.
11. **Profile:** Updates their own display name or default viewing preferences.
12. **Monitor Operations:** Periodically reviews dashboard, sales history for all staff/sites, and reports.
13. **Food Stall Setup (Optional):** If managing a food stall, navigates to "Food Stall" -> "Dashboard", then to "Add Expense" to record initial expenses for groceries via `/foodstall/expenses/record`.

### Manager User

1.  **Login:** Accesses the system. Their `AuthContext` might default to one of their managed sites, or they select one from the header. Their context is always "All Stalls" for the selected site.
2.  **Dashboard:** Views dashboard for their selected managed site (e.g., "Main Warehouse"), with data aggregated from "All Stalls".
3.  **Stock Review:** Navigates to "Stock & Sales" -> "Stock Items".
    *   Views "All Stock (Site-wide)" for "Main Warehouse".
    *   Filters to see only "Retail Counter A" stock (using the stall filter). Notices "Product X" is low.
    *   Filters to see "Back Storage" stock.
4.  **Stock Transfer:** From the "Stock Items" page, finds an item in "Back Storage", uses the item's action menu to "Transfer to Stall", and moves a quantity of "Product X" to "Retail Counter A".
5.  **Record Sale (Context Dependent):** If the manager needs to record a sale, they would navigate to "Stock & Sales" -> "Record Sale". They must first select the specific stall where the sale is occurring from a dropdown on the form itself.
6.  **Sales History:** Views sales history for "Main Warehouse", can filter by staff working there.
7.  **Reports:** Generates sales reports for "Main Warehouse". Uses AI summary.
8.  **Settings:** Exports sales data for "Main Warehouse" to CSV.
9.  **Profile:** Sets their default item filter preferences.
10. **Food Stall Check (If applicable):** If their managed site includes a food stall, they might navigate to "Food Stall" -> "Dashboard" to review recent expenses or sales for that stall. They can also view the "Food Stall Reports".

### Staff User

1.  **Login:** Accesses the system. Their context is automatically set to their assigned default site and stall (e.g., "Main Warehouse", "Retail Counter A"). If no stall is assigned, context is their site's master stock.
2.  **Dashboard:** Views dashboard specific to "Retail Counter A". Sees items low on stock *at their stall*.
3.  **Stock Check:** Navigates to "Stock & Sales" -> "Stock Items". View is automatically filtered to "Retail Counter A".
    *   Updates quantity for "Product X" after a manual count (using "Update Stock" action).
4.  **Record Sale:** Navigates to "Stock & Sales" -> "Record Sale". The form is pre-set to their assigned stall.
    *   Adds "Product X" and "Product Y" to a customer's order from available stall stock.
    *   Completes the sale. Stock for "Product X" and "Product Y" at "Retail Counter A" (and linked master stock) is automatically decremented.
5.  **Sales History:** Views their own sales for "Retail Counter A".
6.  **Profile:** Updates their display name.
7.  **Request Stock (Implicit):** If "Product Y" runs out, they might verbally request more from a manager or from "Back Storage" (system doesn't have a formal request feature, this would be an operational flow leading to a manager/admin performing an allocation or transfer).
8.  **Food Stall Operations (If assigned to a food stall):**
    *   Manages daily sales totals via "Food Stall" -> "Add Sales".
    *   Records expenses for grocery purchases via "Food Stall" -> "Add Expense".

---

## 13. Production Readiness Considerations

Making StallSync fully production-ready involves several key areas beyond core feature development. The application is built to be fully responsive and mobile-friendly.

### Firestore Security Rules

*   **Current Status:** The `firestore.rules` file in the project root provides a detailed set of rules with helper functions for role checks and ownership.
*   **Action Required:** **CRITICAL REVIEW AND TESTING.** Before deploying to production, these rules must be thoroughly audited, tested (using Firebase Emulator Suite or unit tests for rules), and refined to ensure they precisely match the application's access control requirements. Deny by default and only allow specific operations needed by each role for each collection/document. Pay close attention to write rules for `stockItems` to prevent unauthorized quantity or price changes.
    *   Ensure rules for new collections like `foodItemExpenses`, `foodSaleTransactions`, and `foodStallActivityLogs` are added and appropriately secured.

### Testing Strategy

*   **Current Status:** A basic Jest testing environment has been configured (`jest.config.js`, `jest.setup.js`). An example unit test for the `cn` utility function exists in `src/lib/__tests__/utils.test.ts`. Core testing dependencies (`jest`, `@testing-library/react`, `@testing-library/jest-dom`, `@types/jest`, `jest-environment-jsdom`) are included in `package.json`.
*   **Action Required:** Develop a comprehensive testing strategy:
    *   **Unit Tests:**
        *   **Focus:** Individual functions, small React components (especially presentational ones), custom hooks, utility functions (like validation schemas, formatters).
        *   **Tools:** Jest, React Testing Library (for components).
        *   **Goal:** Verify that individual pieces of code work correctly in isolation. Test edge cases and different inputs.
        *   **Example:** The existing test for `cn` in `src/lib/__tests__/utils.test.ts` is a good starting point. Expand this to cover other utilities and critical functions.
    *   **Integration Tests:**
        *   **Focus:** Interactions between several components, API calls (e.g., to `/api/admin/create-user`, `/api/google-sheets-proxy`), interactions with Firebase services (mocked or using emulators), and context providers.
        *   **Tools:** Jest with React Testing Library, potentially MSW (Mock Service Worker) for API mocking, Firebase Emulator Suite.
        *   **Goal:** Ensure that different parts of the application work together as expected. For example, test that submitting a form correctly updates state and calls an API.
    *   **End-to-End (E2E) Tests:**
        *   **Focus:** Simulate full user journeys through the application from a user's perspective, interacting with the UI as a user would.
        *   **Tools:** Frameworks like Playwright or Cypress.
        *   **Goal:** Verify complete workflows across different roles (Admin, Manager, Staff). For example, an Admin creating a user, that user logging in, and performing their role-specific tasks.
        *   E2E tests are generally slower and more resource-intensive but provide the highest confidence that the application works from start to finish.
    *   **Security Rule Tests:**
        *   **Focus:** Specifically verify Firestore security rules.
        *   **Tools:** Firebase Emulator Suite provides tools for testing security rules. You can write test scripts (e.g., using JavaScript with the Firebase Testing SDK) to simulate different authenticated users attempting various Firestore operations and assert whether they are allowed or denied as per the rules.
        *   **Goal:** Ensure data access controls are correctly implemented and prevent unauthorized access or modification. This is critical for production.
    *   **Test Coverage:** Aim for reasonable test coverage, particularly for critical business logic and user flows. Tools like Jest can generate coverage reports.
    *   **Continuous Integration (CI):** Integrate your tests into a CI/CD pipeline (e.g., using GitHub Actions, GitLab CI) to automatically run tests on every code change, preventing regressions from being deployed.

### Logging and Monitoring

*   **Current Status:** The application uses `console.log/warn/error` extensively for client-side and server-side (API routes, Firebase Functions) debugging. Firebase Functions have improved logging.
*   **Action Required:**
    *   **Structured Logging:** For production, integrate a structured logging solution (e.g., send logs to Google Cloud Logging if deploying on Firebase/GCP, or services like Sentry, Datadog). This allows for easier searching, filtering, and analysis of logs.
    *   **Error Monitoring:** Implement real-time error tracking (e.g., Sentry) to capture and alert on unhandled exceptions in production (both frontend and backend).
    *   **Performance Monitoring:** Utilize Firebase Performance Monitoring or similar tools to track app load times, API response times, and other performance metrics.
    *   **Alerting:** Set up alerts for critical errors, high error rates, or performance degradation.

### Backup and Restore

*   **Current Status:** Firebase provides automatic backups of Firestore data (Point-in-Time Recovery - PITR, typically for 7 or 30 days depending on your plan). The application includes manual CSV export features in "Settings".
*   **Action Required:**
    *   **Understand Firebase Backups:** Familiarize yourself with Firebase's PITR capabilities, limitations, and restore procedures.
    *   **Define RPO/RTO:** Determine your Recovery Point Objective (how much data can you afford to lose) and Recovery Time Objective (how quickly do you need to restore service).
    *   **Scheduled Exports (Consider):** For enhanced protection or longer retention, consider implementing scheduled automated exports of critical Firestore collections (e.g., using a Cloud Function triggered by Cloud Scheduler) to a separate storage location (e.g., Google Cloud Storage bucket).
    *   **Test Restore Process:** Regularly test your data restoration process from Firebase backups and any custom exports to ensure you can meet your RTO.
    *   **Data Integrity Checks:** Implement checks or processes to verify data integrity after a restore.

### Legal and Compliance

*   **Current Status:** No specific legal documents (Privacy Policy, Terms of Service) are included.
*   **Action Required:**
    *   **Privacy Policy:** Create and display a comprehensive privacy policy detailing how user data (personal information, usage data, etc.) is collected, used, stored, shared, and protected.
    *   **Terms of Service (ToS):** Define the terms and conditions for using the StallSync application. Include acceptable use, limitations of liability, and intellectual property rights.
    *   **Cookie Consent:** If using cookies for tracking, analytics (beyond essential operational cookies), or non-essential purposes, implement a cookie consent mechanism (e.g., a banner) that complies with regulations like GDPR (for EU users) or CCPA (for California users).
    *   **Data Protection Regulations:** Ensure compliance with relevant data protection laws (e.g., GDPR, CCPA, PIPEDA) based on your target user base and the data you process. This may involve data minimization, user rights (access, rectification, erasure), and data security measures.
    *   **Consult Legal Advice:** For production applications handling sensitive user data or operating in regulated industries, consult with a legal professional to ensure compliance with all applicable laws and regulations.

This document should give you a solid foundation. Remember that documentation is a living thing and should be updated as the application evolves!

    