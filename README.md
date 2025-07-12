
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

# Google OAuth Credentials (for Google Sheets feature)
# See documentation for how to get these from Google Cloud Console
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:9002/api/auth/google/callback

# Genkit/Google AI (if applicable)
# GEMINI_API_KEY=...
```
**IMPORTANT:** After creating or modifying `.env.local`, you **must restart your Next.js development server** for the changes to take effect.

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

For an in-depth understanding of the application architecture, all features, advanced setup (like Google Sheets integration), data models, and user journeys, please refer to the **[DOCUMENTATION.md](DOCUMENTATION.md)** file.

## Deployment

The application is structured for deployment to Firebase Hosting and Firebase App Hosting. Refer to the "Deployment" section in [DOCUMENTATION.md](DOCUMENTATION.md) for more details.
