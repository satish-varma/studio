# StallSync - AI Development Prompts

This document provides a comprehensive list of prompts that can be used with an AI coding assistant (like the one in Firebase Studio) to build the StallSync application from the ground up or to implement its features incrementally.

## Table of Contents

1.  [Initial Project Setup](#1-initial-project-setup)
2.  [Core Data Models (Types)](#2-core-data-models-types)
3.  [Authentication & Context](#3-authentication--context)
4.  [Core Application Layout](#4-core-application-layout)
5.  [Dashboard Feature](#5-dashboard-feature)
6.  [Stock Item Management](#6-stock-item-management)
7.  [Sales Management](#7-sales-management)
8.  [Reporting Feature](#8-reporting-feature)
9.  [Admin - User Management](#9-admin---user-management)
10. [Admin - Site & Stall Management](#10-admin---site--stall-management)
11. [AI Feature Integration (Genkit)](#11-ai-feature-integration-genkit)
12. [Food Stall Module](#12-food-stall-module)
13. [Settings & Data Portability](#13-settings--data-portability)
14. [Final Polish & Mobile Responsiveness](#14-final-polish--mobile-responsiveness)
15. [Testing Setup](#15-testing-setup)

---

### 1. Initial Project Setup

*   **Goal:** Initialize the project with the correct tech stack and basic file structure.
*   **Prompt:** "Set up a new Next.js project using the App Router, TypeScript, Tailwind CSS, and ShadCN UI. Initialize Firebase with Auth and Firestore services. Create a basic folder structure with `/src/app`, `/src/components`, `/src/lib`, `/src/types`, and `/src/contexts`."

### 2. Core Data Models (Types)

*   **Goal:** Define all the necessary TypeScript types for the application's data.
*   **Prompt:** "Create all the necessary TypeScript type definition files inside `/src/types`.
    *   Create `user.ts` for the `AppUser` interface, which should include fields for `uid`, `email`, `displayName`, `role` (as 'staff', 'manager', or 'admin'), `defaultSiteId`, `defaultStallId`, and `managedSiteIds`. Also include a type for `UserGoogleOAuthTokens`.
    *   Create `site.ts` for the `Site` interface with `id`, `name`, and `location`.
    *   Create `stall.ts` for the `Stall` interface with `id`, `name`, `siteId`, and `stallType`.
    *   Create `item.ts` for the `StockItem` interface. Include fields like `id`, `name`, `category`, `description`, `quantity`, `unit`, `price`, `costPrice`, `lowStockThreshold`, `siteId`, `stallId`, and `originalMasterItemId`. Also define a Zod schema for the item form.
    *   Create `sale.ts` for `SaleTransaction` and `SoldItem` interfaces.
    *   Create `log.ts` for the `StockMovementLog` interface to track all inventory changes.
    *   Create an `index.ts` file in `/src/types` to export all these types."

### 3. Authentication & Context

*   **Goal:** Set up user authentication, role management, and global context for auth state and site/stall selection.
*   **Prompt:** "Implement the authentication flow and global context.
    1.  Create `AuthContext.tsx` in `/src/contexts`. This context should manage the Firebase auth state (`user`, `loading`), provide `signIn`, `signUp`, and `signOutUser` functions.
    2.  The `AuthContext` should also fetch the user's data from the `/users/{uid}` collection in Firestore and store the full `AppUser` object.
    3.  Add state management for `activeSiteId` and `activeStallId` to the `AuthContext`. These should be persisted to localStorage and be updatable via `setActiveSite` and `setActiveStall` functions. The context should also store the full `Site` and `Stall` objects for the active selection.
    4.  Create a simple login page at `/app/(auth)/login/page.tsx` with a login form component. Public sign-up should be disabled; user creation will be an admin feature."

### 4. Core Application Layout

*   **Goal:** Build the main application shell with a sidebar and header for authenticated users.
*   **Prompt:** "Create the main application layout for authenticated users.
    1.  In `/app/(app)/layout.tsx`, build a layout that uses a collapsible sidebar for navigation and a header.
    2.  The header (`AppHeaderContent.tsx`) should contain the `SiteStallSelector` component (for admins/managers) and a `UserNav` component with a dropdown for profile and sign-out.
    3.  The sidebar (`AppSidebarNav.tsx`) should display navigation links based on the user's role stored in the `AuthContext`.
    4.  The `SiteStallSelector.tsx` component should allow Admins to select any site and stall, and Managers to select from their `managedSiteIds`."

### 5. Dashboard Feature

*   **Goal:** Create a dashboard page to display key metrics and quick actions.
*   **Prompt:** "Build the Dashboard page at `/app/(app)/dashboard/page.tsx`. It should display key metrics in summary cards, such as 'Total Items', 'Total Sales (Last 7 Days)', 'Items Sold Today', and 'Low Stock Alerts'. Also include a 7-day sales chart, a list of items low on stock, a list of recent sales, and quick action buttons to 'Record Sale' and 'Add New Item'. All data should be reactive to the active site/stall selected in the header."

### 6. Stock Item Management

*   **Goal:** Implement the full CRUD functionality for managing stock items.
*   **Prompt:** "Implement the stock item management feature.
    1.  Create the main page at `/app/(app)/items/page.tsx` which renders an `ItemsClientPage.tsx` component.
    2.  This client page should fetch and display all `StockItem` documents from Firestore that match the user's active site/stall context.
    3.  Create an `ItemControls.tsx` component with filters for search term, category, stock status, and (for admins/managers) stall/location.
    4.  Create an `ItemTable.tsx` component to display the filtered items. Each row should have a dropdown menu with actions.
    5.  Implement the following actions in the `ItemTable`:
        *   **Update Stock:** A dialog to quickly change an item's quantity. This should adjust master stock if the item is a linked stall item.
        *   **Allocate to Stall:** (For master stock only) A dialog to move a specific quantity of an item from master stock to a stall within the same site. This should create or update a linked stall item.
        *   **Return to Master:** (For linked stall stock only) A dialog to return stock from a stall back to its original master item.
        *   **Transfer to Stall:** (For stall stock only) A dialog to move stock from one stall to another within the same site.
        *   **Edit:** Navigate to an edit page.
        *   **Delete:** A dialog to confirm item deletion. Deleting a master item should be prevented if it has active allocations. Deleting a stall item should return its quantity to the master stock.
    6.  Create an `ItemForm.tsx` component for adding and editing items at `/app/(app)/items/new` and `/app/(app)/items/[itemId]/edit`.
    7.  Every stock movement (create, update, sale, allocation, etc.) must be logged in a `stockMovementLogs` collection in Firestore using a `logStockMovement` utility function."

### 7. Sales Management

*   **Goal:** Build the UI for recording new sales and viewing sales history.
*   **Prompt:** "Create the sales management feature.
    1.  Create a 'Record Sale' page at `/app/(app)/sales/record/page.tsx`. The form should allow the user to select one or more items from the available stock of the active stall, enter quantities, and record the transaction.
    2.  When a sale is recorded, the stock quantities of the sold items (both stall and linked master stock) must be updated atomically in a Firestore transaction.
    3.  Create a 'Sales History' page at `/app/(app)/sales/history/page.tsx` that displays a paginated list of all sales transactions for the active context. Include controls to filter by date range and (for admins/managers) by staff member.
    4.  Create a sales detail page at `/app/(app)/sales/history/[saleId]/page.tsx` that shows a printable receipt for a specific transaction."

### 8. Reporting Feature

*   **Goal:** Develop a sales summary report page.
*   **Prompt:** "Build a 'Sales Summary Report' page at `/app/(app)/reports/page.tsx`. This page should be accessible only to managers and admins. It needs to have a date range filter. Based on the filter and the active site/stall context, it should calculate and display KPIs like Total Sales, Total COGS, Total Profit, Profit Margin, and Average Sale Value. It should also list the top-selling items by quantity for the period."

### 9. Admin - User Management

*   **Goal:** Create a page for admins to manage users.
*   **Prompt:** "Create the User Management page for admins at `/app/(app)/users/page.tsx`.
    1.  It should display a table of all users from the `/users` collection in Firestore.
    2.  Include a 'Create User' dialog. This dialog should collect the new user's display name, email, and password. It will call a Next.js API route (`/api/admin/create-user`) to create the Firebase Auth user. After successful auth creation, it should create the corresponding user document in Firestore with the selected role and assignments.
    3.  The table should allow an admin to change a user's role (staff, manager, admin).
    4.  The table should allow an admin to manage assignments: for 'staff', set a default site and stall; for 'manager', assign a list of managed sites.
    5.  Implement a 'Delete User' action that deletes the Firebase Auth user and their Firestore document."

### 10. Admin - Site & Stall Management

*   **Goal:** Build pages for admins to manage business sites and their associated stalls.
*   **Prompt:** "Implement the site and stall management feature for admins.
    1.  Create a page at `/app/(app)/admin/sites/page.tsx` to list all sites. It should allow creating, editing, and deleting sites.
    2.  From the sites list, allow navigating to a page for managing stalls for a specific site, e.g., `/app/(app)/admin/sites/[siteId]/stalls`. This page should list all stalls for that site and allow creating, editing, and deleting them."

### 11. AI Feature Integration (Genkit)

*   **Goal:** Add AI-powered features using Genkit.
*   **Prompt:** "Integrate Genkit AI features into the app.
    1.  Create a flow at `/src/ai/flows/generate-item-description-flow.ts`. This flow should take an item's name and category as input and use a Gemini model to generate a short, marketable product description.
    2.  Add a 'Generate with AI' button to the `ItemForm` that calls this flow and populates the description field.
    3.  Create another flow at `/src/ai/flows/summarize-sales-trends-flow.ts`. This flow should take the sales summary statistics and top-selling items data from the reports page and generate a concise, analytical text summary of the sales trends.
    4.  Display this AI-generated summary on the Sales Summary Report page."

### 12. Food Stall Module

*   **Goal:** Add a completely new section for managing food stall finances.
*   **Prompt:** "Add a new module for Food Stall management under the `/foodstall` route.
    1.  Create new data types `FoodItemExpense` and `FoodSaleTransaction` in `/src/types/food.ts`, and a `FoodStallActivityLog` in `food_log.ts`.
    2.  Build a Food Stall Dashboard at `/foodstall/dashboard` showing Total Sales, Total Expenses, and Net Profit for a selected period.
    3.  Create an 'Add Expense' page at `/foodstall/expenses/record` with a form to log expenses by category (Groceries, Supplies, etc.).
    4.  Create a 'Manage Daily Sales' page at `/foodstall/sales/record` with a form to enter total sales for a day, broken down by meal times and payment methods (HungerBox, UPI, Other).
    5.  Create pages to list all expenses and all daily sales summaries, with pagination.
    6.  Create a 'Financial Reports' page at `/foodstall/reports` to analyze performance.
    7.  Add a link to the Food Stall module in the main sidebar."

### 13. Settings & Data Portability

*   **Goal:** Create a settings page with options for data export.
*   **Prompt:** "Create a Settings page at `/app/(app)/settings/page.tsx`, accessible to managers and admins. Add two data export features:
    1.  'Export Stock Data (CSV)': A button that fetches all stock items and downloads them as a CSV file.
    2.  'Export Sales Data (CSV)': A button that fetches all sales transactions and downloads them as a CSV file.
    3.  (Optional Advanced) Add placeholders for Google Sheets integration."

### 14. Final Polish & Mobile Responsiveness

*   **Goal:** Ensure the application is fully mobile-responsive and professional.
*   **Prompt:** "Perform a full review of the application and apply mobile-friendly enhancements. Ensure all pages, forms, tables, and dialogs are responsive. This includes stacking controls vertically, making tables horizontally scrollable, adjusting font sizes, and ensuring the sidebar collapses correctly on mobile."

### 15. Testing Setup

*   **Goal:** Set up a testing environment and write initial tests.
*   **Prompt:** "Set up Jest and React Testing Library for unit and integration testing. Configure it to work with Next.js and TypeScript. Create an initial test file for a simple utility function (like `cn`) and a basic component test for the `PageHeader` to ensure the setup is working correctly."
