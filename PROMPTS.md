# StallSync - Master AI Development Prompt

This document provides a single, comprehensive prompt for generating the StallSync application. It is designed to be given to an AI coding assistant (like the one in Firebase Studio) to build the app from the ground up with a mobile-first, responsive design philosophy.

## Master Prompt

"Hello! Your task is to build a complete stock and sales management web application called **StallSync**. Please follow these requirements meticulously.

### 1. Core Objective & Tech Stack

Build a comprehensive stock and sales management application. The application must be built using the following tech stack:
*   **Framework:** Next.js (with App Router)
*   **Language:** TypeScript
*   **UI Library:** ShadCN UI Components
*   **Styling:** Tailwind CSS
*   **Backend & Database:** Firebase (Authentication and Firestore)
*   **AI Integration:** Genkit with Google AI (Gemini)

The final application must be **fully mobile-responsive** using a mobile-first approach. All layouts, tables, forms, and dialogs must be optimized for both small and large screens.

### 2. User Roles & Core Features

Implement a role-based access control system with three roles: **Admin**, **Manager**, and **Staff**.

*   **Admin:** Full access to everything. Can manage users, create sites/stalls, and view all data across the system.
*   **Manager:** Can manage assigned sites. They can manage stock, record sales, and view reports for the sites they oversee. They cannot manage users or create new sites.
*   **Staff:** Operates within an assigned site and stall. They can manage stock quantities and record sales for their specific context only.

### 3. Data Models (Types)

Create all necessary TypeScript type definitions and Zod schemas in the `/src/types/` directory. This includes:
*   `AppUser`: For user details including `uid`, `email`, `displayName`, `role`, `defaultSiteId`, `defaultStallId`, and `managedSiteIds`.
*   `Site`: For business locations.
*   `Stall`: For counters/sub-locations within a Site.
*   `StockItem`: For inventory items, including quantity, price, cost, thresholds, and its `siteId` and `stallId`. An item with a `siteId` but null `stallId` is "Master Stock". An item with both is "Stall Stock". A stall stock item should have an `originalMasterItemId` to link it back to its master item.
*   `SaleTransaction`: For sales records.
*   `StockMovementLog`: To log every change in inventory (sales, allocations, updates).
*   `FoodItemExpense` & `FoodSaleTransaction`: For the specialized food stall module.

### 4. Mobile-First Layout & Authentication

1.  **Authentication:**
    *   Create a login page at `/login`. Public sign-up must be disabled.
    *   User creation will be an admin-only feature available within the app.
    *   Use Firebase Authentication for user accounts.
    *   Store the `AppUser` data (including the user's role) in a `users` collection in Firestore, with the document ID matching the Firebase Auth UID.

2.  **Global Context & Layout:**
    *   Implement an `AuthContext` to manage the authenticated user's state (`AppUser` object) and their active context (`activeSiteId`, `activeStallId`).
    *   Create the main application layout for authenticated users. This layout must be mobile-first and include:
        *   A **collapsible sidebar** for navigation. On mobile, this should be an off-canvas menu (hamburger menu).
        *   A **header** containing the mobile menu trigger, a `SiteStallSelector` component for Admins/Managers to change their active context, and a `UserNav` dropdown for profile and sign-out. The header controls must adapt gracefully to mobile screen widths.

### 5. Core Feature Implementation (CRUD & Workflows)

Develop the main application features under the `/` route (e.g., `/dashboard`, `/items`, `/sales`). All pages must be responsive.

1.  **Dashboard:** Create a dashboard that displays key metrics (e.g., total sales, low stock alerts) and quick actions. The dashboard cards must reflow into a single column on mobile.
2.  **Stock Item Management (`/items`):**
    *   Build a page to display `StockItem`s based on the user's active context.
    *   Implement controls for filtering by category, stock status, and location. These controls should stack vertically on mobile.
    *   Display the items in a **responsive table**. On mobile screens, hide less critical columns (e.g., "Last Updated", "Cost Price") to avoid horizontal scrolling.
    *   Implement the following actions for items via a dropdown menu:
        *   **Update Stock:** A dialog to directly change an item's quantity.
        *   **Allocate to Stall:** (Master stock only) Move a quantity of an item from master stock to a stall.
        *   **Return to Master:** (Stall stock only) Return quantity from a stall item back to its master item.
        *   **Transfer to Stall:** Move quantity from one stall item to another.
        *   **Edit & Delete:** Standard CRUD actions. Deleting a master item should be prevented if it has active allocations to stalls.
    *   Implement **batch actions** for stall items (e.g., Batch Delete, Batch Set Quantity, Batch Edit Details).
    *   Create the "Add/Edit Item" form. This form must be responsive.

3.  **Sales Management (`/sales`):**
    *   Create a "Record Sale" form that is optimized for mobile, with form fields stacking vertically.
    *   Create a "Sales History" page with a responsive table.

### 6. Admin-Specific Features

Implement the following features, accessible only to users with the 'admin' role.

1.  **User Management (`/users`):** A page to view all users and manage their roles and site/stall assignments in a responsive table. This page should include a "Create User" dialog with a vertically scrollable form for mobile devices.
2.  **Site & Stall Management (`/admin/sites`):** Pages to create, edit, and delete sites and their associated stalls.

### 7. Advanced Features

1.  **AI Integration (Genkit):**
    *   Create a flow to **generate product descriptions** from an item's name and category, accessible via a button on the item form.
    *   Create a flow to **summarize sales trends** on the reports page.
2.  **Food Stall Module (`/foodstall`):**
    *   Create a separate module for managing food stall finances.
    *   Include pages to record daily sales and itemized expenses.
    *   Build a dedicated dashboard and financial report for this module.
    *   All pages must be mobile-friendly.
3.  **Settings & Data Export (`/settings`):** Create a settings page allowing managers and admins to export stock and sales data to CSV.

Please begin with the initial project setup, and then proceed through the features as outlined. Ensure every component and page is built with mobile-responsiveness as a primary goal."
