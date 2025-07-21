
# StallSync - Stock & Sales Management

StallSync is a comprehensive business management application designed for organizations operating multiple sites and stalls. It empowers users to efficiently track inventory, record sales, manage staff attendance and payroll, and gain valuable insights into their business operations through detailed reporting.

The application features role-based access control (Admin, Manager, Staff) to ensure appropriate data access and functionality for different user types. It also leverages AI for features like product description generation and sales trend summarization.

**For detailed technical documentation, setup instructions, feature explanations, and user journeys, please see [DOCUMENTATION.md](DOCUMENTATION.md).**

## Key Technologies

*   **Frontend:** Next.js (App Router), React, TypeScript
*   **UI:** ShadCN UI Components, Tailwind CSS
*   **State Management:** React Context API
*   **Backend & Database:** Firebase (Authentication, Firestore, Cloud Functions)
*   **AI Integration:** Genkit (with Google AI/Gemini models)

## Core Features

*   **Role-Based Authentication:** Admin, Manager, and Staff roles with distinct permissions.
*   **Multi-Module System:**
    *   **Stock & Sales:** Manage multi-site inventory, master/stall stock, allocations, transfers, sales recording, and reporting.
    *   **Food Stall Management:** Dedicated module for tracking food-related expenses, daily sales by mealtime, and financial reports.
    *   **Staff Management:** Track attendance, manage salary advances, and process monthly payroll based on attendance and deductions.
*   **Admin Controls:** Manage users, sites, and stalls. Reset application data securely.
*   **Data Management:** Import/Export stock and expense data via CSV.
*   **AI-Powered Features:** Generate product descriptions and sales summaries automatically.

## Getting Started

### Prerequisites

*   Node.js (v18 or later recommended)
*   npm or yarn
*   Firebase CLI (`npm install -g firebase-tools`)
*   A Firebase Project (set up as described in [DOCUMENTATION.md](DOCUMENTATION.md))

### 1. Clone the Repository

```bash
git clone <repository-url>
cd stallsync-project # Or your project directory name
```

### 2. Environment Variables (**CRITICAL STEP**)

This application **WILL NOT RUN** without your Firebase project credentials. You must create a `.env.local` file in the root of your project to provide these keys.

**Refer to the "Environment Variables (.env.local)" section in [DOCUMENTATION.md](DOCUMENTATION.md) for a complete list of required variables and detailed steps on how to obtain them.**

_Example `.env.local` structure:_
```env
# Firebase Client SDK Configuration (from Firebase Console -> Project Settings -> Your Web App)
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=1:...:web:...

# Firebase Admin SDK Configuration (for server-side operations)
# See documentation for how to get this JSON from Firebase Console -> Service Accounts
GOOGLE_APPLICATION_CREDENTIALS_JSON='{"type": "service_account", ...}'

# Genkit/Google AI (if applicable)
# GEMINI_API_KEY=...
```
**IMPORTANT:** After creating or modifying `.env.local`, you **must restart your Next.js development server** for the changes to take effect.

### 3. Firebase Project Setup

Follow the detailed steps in the **"Firebase Project Setup"** section of [DOCUMENTATION.md](DOCUMENTATION.md). This includes:
*   Creating a Firebase project.
*   Registering your Web App.
*   Enabling Firebase Authentication (Email/Password).
*   Setting up Firestore Database and deploying Security Rules (`firestore.rules`) and Indexes (`firestore.indexes.json`).
*   Enabling Cloud Functions.

### 4. Install Dependencies

```bash
npm install
# or
yarn install
```

### 5. Run the Development Server

```bash
npm run dev
```
The application will typically be available at `http://localhost:9002`.

### 6. Build for Production

```bash
npm run build
```

### 7. Start Production Server (Locally)

```bash
npm run start
```

## Detailed Documentation

For an in-depth understanding of the application architecture, all features, advanced setup, data models, and user journeys, please refer to the **[DOCUMENTATION.md](DOCUMENTATION.md)** file.

## Deployment

The application is structured for deployment to Firebase Hosting and Firebase App Hosting. Refer to the "Deployment" section in [DOCUMENTATION.md](DOCUMENTATION.md) for more details.
