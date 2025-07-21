
# StallSync - Application Documentation

## Table of Contents

1.  [Introduction](#introduction)
2.  [Tech Stack](#tech-stack)
3.  [Project Structure](#project-structure)
4.  [Setup and Installation](#setup-and-installation)
    *   [Prerequisites](#prerequisites)
    *   [Environment Variables (.env.local) - **CRITICAL STEP**](#environment-variables-envlocal---critical-step)
    *   [Firebase Project Setup](#firebase-project-setup)
    *   [Running the Application](#running-the-application)
5.  [Core Features & Functionality](#core-features--functionality)
    *   [Authentication & Roles](#authentication--roles)
    *   [Dashboard](#dashboard)
    *   [Stock & Sales Module](#stock--sales-module)
    *   [Food Stall Module](#food-stall-module)
    *   [Staff Management Module](#staff-management-module)
    *   [Administration Module](#administration-module)
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

StallSync is a comprehensive business management application designed for organizations with multiple sites and stalls (e.g., retail counters, storage areas). It allows users to track inventory, record sales, manage staff finances and attendance, and gain insights into their operations. The application is broken down into three main modules: Stock & Sales, Food Stall management, and Staff management. It features role-based access control (Admin, Manager, Staff), is fully mobile-responsive, and leverages AI for tasks like product description generation and sales trend summarization.

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

*   **`/functions`**: Contains Firebase Cloud Functions code (e.g., `createAuthUser`).
*   **`/src/ai`**: Genkit AI integration files.
*   **`/src/app`**: Next.js App Router.
    *   `(app)/`: Authenticated routes and layouts.
        *   `dashboard/`, `items/`, `profile/`, `reports/`, `sales/`, `settings/`, `support/`, `users/`: Core feature pages.
        *   `foodstall/`: Routes for the Food Stall Management module.
        *   `staff/`: Routes for the Staff Management module.
        *   `admin/`: Admin-specific pages.
        *   `layout.tsx`: Main authenticated layout with sidebar and header.
    *   `(auth)/`: Authentication-related pages (login).
    *   `api/`: Next.js API routes (server-side logic).
*   **`/src/components`**: Reusable UI components, organized by feature.
*   **`/src/contexts`**: React Context providers (AuthContext, ThemeContext).
*   **`/src/hooks`**: Custom React hooks (e.g., `use-user-management`, `use-toast`).
*   **`/src/lib`**: Utility functions and Firebase configuration.
*   **`/src/types`**: TypeScript type definitions and Zod schemas for data models.

---

## 4. Setup and Installation

### Prerequisites

*   Node.js (v18 or later recommended)
*   npm or yarn
*   Firebase CLI (`npm install -g firebase-tools`)

### Environment Variables (.env.local) - **CRITICAL STEP**

The application **will not function** without connecting to your Firebase project.

1.  **Create File**: In the project root, create a file named `.env.local`.
2.  **Add Keys**: Copy the following template into `.env.local` and replace placeholders with your Firebase project credentials.

    ```env
    # --------------------------------------------------------------------------
    # FIREBASE CLIENT SDK CONFIGURATION (REQUIRED FOR THE APP TO RUN)
    # Get these from Firebase Console > Project Settings (⚙️) > Your Web App
    # --------------------------------------------------------------------------
    NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
    NEXT_PUBLIC_FIREBASE_APP_ID=1:...:web:...

    # --------------------------------------------------------------------------
    # FIREBASE ADMIN SDK CONFIGURATION (REQUIRED FOR SERVER-SIDE ACTIONS)
    # Get from Firebase Console > Project Settings > Service Accounts > Generate new private key
    # Paste the entire contents of the downloaded JSON file as a single-line string.
    # --------------------------------------------------------------------------
    GOOGLE_APPLICATION_CREDENTIALS_JSON='{"type": "service_account", "project_id": "...", ...}'

    # --------------------------------------------------------------------------
    # GENKIT / GOOGLE AI (if using specific API key)
    # --------------------------------------------------------------------------
    # GEMINI_API_KEY=...
    ```

3.  **Restart Server**: You **must restart** your Next.js development server for changes to take effect.

### Firebase Project Setup

1.  **Create Firebase Project:** [console.firebase.google.com](https://console.firebase.google.com/).
2.  **Register Web App:** Add a Web App to your project.
3.  **Enable Authentication:** Enable "Email/Password" sign-in method.
4.  **Enable Firestore:** Create a Firestore Database in **production mode**.
5.  **Deploy Security Rules:** Deploy `firestore.rules` using the Firebase CLI: `firebase deploy --only firestore:rules`. **CRITICAL: Review these rules before production.**
6.  **Deploy Indexes:** Deploy `firestore.indexes.json`: `firebase deploy --only firestore:indexes`.
7.  **Enable Cloud Functions:** Go to Functions in the Firebase console and click "Get started".

### Running the Application

1.  **Install Dependencies:** `npm install`
2.  **Run Development Server:** `npm run dev` (App runs on `http://localhost:9002`)
3.  **Run Tests:** `npm test`

---

## 5. Core Features & Functionality

### Authentication & Roles

*   **Login:** Users sign in with email and password at `/login`. Public sign-up is disabled.
*   **Roles:**
    *   **Admin:** Full access to all features, including user creation, site/stall management, and system-wide data.
    *   **Manager:** Manages assigned sites. Can view/manage stock, sales, and staff for their sites.
    *   **Staff:** Operates within an assigned site and stall. Can record sales and manage stock for their specific context.
*   **User Creation:** Admins create new users via the "User Management" page.

### Dashboard

*   Provides an overview of key metrics: total items, sales, low stock alerts.
*   Displays a 7-day sales chart.
*   Lists items low on stock and recent sales transactions.
*   Data is contextual based on the active site/stall selected in the header.

### Stock & Sales Module

*   **Path:** `/items`, `/sales`, `/reports`
*   **Stock Management (`/items`):**
    *   View, filter, and search stock items.
    *   Differentiates between **Master Stock** (site-level) and **Stall Stock** (allocated from master).
    *   Perform actions: Update Quantity, Allocate to Stall, Return to Master, Transfer between Stalls, Edit, Delete.
    *   Batch actions for stall items (e.g., Batch Delete, Batch Set Quantity).
*   **Sales Management (`/sales`):**
    *   Record sales for the active stall (`/sales/record`).
    *   View sales history with filters (`/sales/history`).
    *   View detailed, printable sale receipts (`/sales/history/[saleId]`).
*   **Sales Reports (`/reports`):**
    *   View key performance metrics (Total Sales, COGS, Profit, etc.).
    *   Displays top-selling items.
    *   Includes an AI-generated summary of sales trends.

### Food Stall Module

*   **Path:** `/foodstall/...`
*   **Dashboard (`/foodstall/dashboard`):** Overview of food stall metrics like sales, expenses, and net profit for a selected period.
*   **Expense Tracking (`/foodstall/expenses`):** Record and view food-related expenses by category.
*   **Sales Tracking (`/foodstall/sales`):** Record and view daily sales summaries, broken down by meal times and payment methods.
*   **Activity Log (`/foodstall/activity-log`):** Chronological log of all food stall sales and expense activities.
*   **Financial Reports (`/foodstall/reports`):** Analyze financial performance including profit, expenses, and top spending categories.
*   **Vendor Management:** Admins can manage a central list of food vendors via Settings.

### Staff Management Module

*   **Path:** `/staff/...` (Visible to Managers and Admins)
*   **Staff Dashboard (`/staff/dashboard`):** Key metrics like total staff, projected salary, and today's attendance status.
*   **Staff List (`/staff/list`):** View all staff and managers. Admins can edit profiles.
*   **Attendance (`/staff/attendance`):** A monthly register to mark attendance (Present, Absent, Leave, Half-day). Includes holiday management for Admins.
*   **Salary Advances (`/staff/advances`):** Record and view salary advances given to staff.
*   **Payroll (`/staff/payroll`):** Automatically calculates monthly salary based on base pay, attendance, and advances. Allows recording of salary payments.
*   **Activity Log (`/staff/activity-log`):** Chronological log of all staff-related activities (attendance changes, payments, etc.).

### Administration Module

*   **Path:** `/users`, `/admin/...` (Visible to Admins only)
*   **User Management (`/users`):**
    *   View, create, and manage all user accounts.
    *   Edit user roles and site/stall assignments.
    *   Set user status to active/inactive.
*   **Site & Stall Management (`/admin/sites`):**
    *   Create, edit, and delete Sites (business locations).
    *   For each site, create, edit, and delete Stalls (sub-locations).
*   **Profile & Settings:**
    *   **Profile (`/profile`):** Users can update their display name and set default filter preferences.
    *   **Settings (`/settings`):**
        *   Export stock and sales data to CSV files.
        *   Import stock and food expense data from CSV files.
        *   Admins can access a "Danger Zone" to reset application data.

### AI-Powered Features

*   **Item Description Generation:** On the "Add/Edit Item" form, AI can generate a product description from the item's name and category.
*   **Sales Trend Summary:** On the "Sales Reports" page, AI provides a textual summary of sales trends based on the current data.

---
## 6. Key Components Overview

(A brief list, refer to code for full details)

*   **`/src/components/admin`**: `ActivityLogClientPage`, `SiteForm`, `SitesTable`, `StallForm`, `StallsTable`.
*   **`/src/components/auth`**: `LoginForm`.
*   **`/src/components/dashboard`**: `DashboardSalesChart`.
*   **`/src/components/foodstall`**: `FoodExpensesClientPage`, `FoodSalesClientPage`, `FoodStallReportClientPage`.
*   **`/src/components/items`**: `ItemControls`, `ItemForm`, `ItemTable`.
*   **`/src/components/layout`**: `AppHeaderContent`, `AppSidebarNav`, `UserNav`.
*   **`/src/components/reports`**: `ReportControls`, `SalesSummaryReportClientPage`.
*   **`/src/components/sales`**: `RecordSaleForm`, `SalesHistoryClientPage`, `SalesHistoryControls`, `SalesTable`.
*   **`/src/components/shared`**: `PageHeader`, `CsvImportDialog`.
*   **`/src/components/staff`**: Components for staff dashboard, list, attendance, payroll, and advances.
*   **`/src/components/users`**: `CreateUserDialog`, `UserManagementClientPage`, `UserTable`.

---

## 7. Context Providers

*   **`AuthContext` (`/src/contexts/AuthContext.tsx`):**
    *   Manages Firebase authentication state (`user`, `loading`).
    *   Stores the `AppUser` object with role and preferences.
    *   Handles sign-in and sign-out.
    *   Manages the currently active `siteId`, `stallId`, and their corresponding `Site` and `Stall` objects.
*   **`ThemeContext` (`/src/contexts/ThemeContext.tsx`):**
    *   Manages application theme (light, dark, system).

---

## 8. Backend Services

### Firebase Functions

*   **`createAuthUser` (`/functions/src/index.ts`):** A callable Cloud Function that allows an authenticated admin user to create a new Firebase Authentication user.

### Next.js API Routes

*   **`/api/admin/create-user/route.ts`:** `POST` route for an admin to create a new Firebase Authentication user.
*   **`/api/admin/delete-user/[uid]/route.ts`:** `DELETE` route for an admin to delete a Firebase Authentication user.
*   **`/api/admin/reset-data/route.ts`:** `POST` route for an admin to reset application transactional data.
*   **`/api/admin/reset-staff-data/route.ts`:** `POST` route for an admin to reset staff transactional data (attendance, payroll).
*   **`/api/csv-import/route.ts`:** `POST` route for an admin to import data from a CSV file for stock or food expenses.

---

## 9. AI Integration (Genkit)

StallSync uses Genkit for AI-powered features, configured in `src/ai/genkit.ts`.

*   **`generateItemDescriptionFlow`:** Generates a product description for a stock item.
*   **`summarizeSalesTrendsFlow`:** Generates a textual summary of sales trends.

---

## 10. Data Models (Types)

TypeScript interfaces and Zod schemas define the structure of data in `src/types/`. Key types include:

*   `AppUser`, `StaffDetails`, `SalaryAdvance`, `StaffAttendance`
*   `StockItem`, `SaleTransaction`, `Site`, `Stall`, `StockMovementLog`
*   `FoodItemExpense`, `FoodSaleTransaction`, `FoodVendor`

---

## 11. Deployment

The project is structured for easy deployment to Firebase Hosting and Firebase App Hosting.
*   **`firebase.json`:** Configures Firebase Hosting, Functions deployment, and Emulator settings.
*   **`apphosting.yaml`:** Configuration for Firebase App Hosting for the Next.js backend.
*   **Deployment Commands:** Use `firebase deploy` to deploy all services, or `firebase deploy --only <service>` for specific services.

---

## 12. User Journeys

### Admin User

1.  **Login:** Accesses the system.
2.  **Site/Stall Setup:** Creates a "Main Warehouse" site and two stalls: "Retail A" and "Storage B".
3.  **User Creation:** Navigates to "User Management". Creates a "Manager" for "Main Warehouse" and a "Staff" member for "Retail A".
4.  **Master Stock:** Adds items to the "Main Warehouse" master stock.
5.  **Allocation:** Allocates stock from master to "Retail A".
6.  **Staff Management:** Navigates to "Staff" -> "Attendance" to review the monthly attendance register.
7.  **Monitor Operations:** Reviews dashboards, sales history, and reports for any site.

### Manager User

1.  **Login:** Selects their managed site ("Main Warehouse") from the header.
2.  **Dashboard:** Views aggregated data for "Main Warehouse".
3.  **Stock Transfer:** Transfers items from "Storage B" to "Retail A".
4.  **Record Sale:** Records a sale occurring at "Retail A".
5.  **Staff Payroll:** Navigates to "Staff" -> "Payroll" to review the monthly salary calculations for their staff. Records a salary payment.
6.  **Reports:** Generates sales and financial reports for "Main Warehouse".

### Staff User

1.  **Login:** Context is automatically set to their assigned stall ("Retail A").
2.  **Dashboard:** Views dashboard specific to "Retail A", including low stock alerts.
3.  **Record Sale:** Navigates to "Record Sale" to process a customer transaction. Stock is automatically decremented.
4.  **Sales History:** Views their own sales history.
5.  **Food Stall Operations:** If assigned, navigates to "Food Stall" -> "Add Expense" to record a grocery purchase.

---

## 13. Production Readiness Considerations

(Summary - see code comments for more details)

*   **Firestore Security Rules:** The `firestore.rules` file provides a detailed set of rules. **CRITICAL: These must be reviewed and tested thoroughly before production.**
*   **Testing Strategy:** The project includes a Jest testing setup. A full production app would require expanding unit, integration, and end-to-end tests.
*   **Logging and Monitoring:** The app uses `console.log`. Production systems should integrate a structured logging service (e.g., Google Cloud Logging, Sentry).
*   **Backup and Restore:** Use Firebase's Point-in-Time Recovery (PITR) and consider scheduled automated exports for critical data.
*   **Legal and Compliance:** Implement a Privacy Policy and Terms of Service as required by your jurisdiction.

This document should give you a solid foundation. Remember that documentation is a living thing and should be updated as the application evolves!
