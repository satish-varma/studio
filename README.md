
# StallSync - Stock & Sales Management

StallSync is a comprehensive stock and sales management application designed for businesses operating multiple sites and stalls (e.g., retail counters, market stands, storage areas). It empowers users to efficiently track inventory, record sales transactions, manage staff roles and assignments, and gain valuable insights into their business operations through detailed reporting.

The application features role-based access control (Admin, Manager, Staff) to ensure appropriate data access and functionality for different user types. It also leverages AI for features like product description generation and sales trend summarization.

**For detailed technical documentation, setup instructions, feature explanations, and user journeys, please see [DOCUMENTATION.md](DOCUMENTATION.md).**

## Key Technologies

*   **Frontend:** Next.js (App Router), React, TypeScript
*   **UI:** ShadCN UI Components, Tailwind CSS
*   **State Management:** React Context API
*   **Backend & Database:** Firebase (Authentication, Firestore, Cloud Functions)
*   **AI Integration:** Genkit (with Google AI/Gemini models)

## Core Features

*   Role-Based Authentication (Admin, Manager, Staff)
*   Comprehensive Dashboard with KPIs and Quick Actions
*   Multi-Site and Multi-Stall Inventory Management
    *   Master Stock & Stall-Specific Stock Tracking
    *   Allocations, Transfers, and Returns between Master/Stall
*   Sales Recording and Detailed History
*   User Management (Admin-controlled)
*   Site and Stall Creation/Management (Admin-controlled)
*   Stock Movement Activity Logging
*   Sales & Inventory Reporting with AI Summaries
*   Profile Management with User Preferences
*   Data Export (CSV)
*   Google Sheets Integration (Import/Export stock & sales)
*   AI-Powered Product Description Generation

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

### 2. Environment Variables

Create a `.env.local` file in the root of your project. This file is crucial for connecting to your Firebase project and other services.
**Refer to the "Environment Variables (.env.local)" section in [DOCUMENTATION.md](DOCUMENTATION.md) for a complete list of required variables and how to obtain them.**

_Example `.env.local` structure:_
```env
# Firebase Client SDK Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=YOUR_FIREBASE_API_KEY
# ... other Firebase client vars

# Firebase Admin SDK Configuration (if applicable, see docs)
# GOOGLE_APPLICATION_CREDENTIALS_JSON='{...}' # Or use GOOGLE_APPLICATION_CREDENTIALS path

# Google OAuth Credentials (for Google Sheets)
GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID
# ... other Google OAuth vars

# Genkit/Google AI (if applicable)
# GEMINI_API_KEY=YOUR_GEMINI_API_KEY
```
**Ensure `.env.local` is added to your `.gitignore` file.**

### 3. Firebase Project Setup

Follow the detailed steps in the **"Firebase Project Setup"** section of [DOCUMENTATION.md](DOCUMENTATION.md). This includes:
*   Creating a Firebase project.
*   Registering your Web App.
*   Enabling Firebase Authentication (Email/Password).
*   Setting up Firestore Database and configuring Security Rules (`firestore.rules`) and Indexes (`firestore.indexes.json`).
*   Enabling Cloud Functions.

### 4. Install Dependencies

```bash
npm install
# or
yarn install
```

### 5. Deploy Firebase Functions (if applicable)

The application uses a Firebase Function (`createAuthUser`) for admin-initiated user creation via the `/api/admin/create-user` route, though the API route itself uses the Admin SDK. If you plan to use the callable Firebase Function directly or other functions are added, deploy them:
```bash
# If you have a 'functions' directory:
cd functions
npm install # If not already done at root
npm run build
cd ..
firebase deploy --only functions
```
Alternatively, most backend logic is handled by Next.js API routes which are deployed with the Next.js app.

### 6. Run the Development Server

```bash
npm run dev
```
The application will typically be available at `http://localhost:9002`.

### 7. Build for Production

```bash
npm run build
```

### 8. Start Production Server (Locally)

```bash
npm run start
```

## Detailed Documentation

For an in-depth understanding of the application architecture, all features, advanced setup (like Google Sheets integration), data models, and user journeys, please refer to the **[DOCUMENTATION.md](DOCUMENTATION.md)** file.

## Deployment

The application is structured for deployment to Firebase Hosting and Firebase App Hosting. Refer to the "Deployment" section in [DOCUMENTATION.md](DOCUMENTATION.md) for more details.
