# 🎬 Movie Ticket Booking App

A full-stack MERN application for browsing movies, watching trailers, and booking cinema tickets with real-time seat selection and payment integration.

## 🚀 Features

### 👤 User Features

- **Browse Movies**: View "Now Playing" movies fetched from TMDB API.
- **Movie Details**: Watch trailers, view cast, rating, and synopsis.
- **Seat Selection**: Interactive theater layout to select seats.
- **Secure Payments**: Integrated with Stripe for secure ticket purchasing.
- **Authentication**: User sign-up and login via Clerk.
- **Email Notifications**: Instant booking confirmation emails with unique **QR Codes** for theater entry.
- **Dashboard**: View booking history and favorite movies.

### 🛡️ Admin Features

- **Dashboard**: Overview of total bookings, revenue, and active shows.
- **Manage Shows**: Add new movie screenings with custom dates, times, and prices.
- **Booking Management**: View all user bookings.

## 🛠️ Tech Stack

- **Frontend**: React.js, Vite, Tailwind CSS, Lucide React
- **Backend**: Node.js, Express.js
- **Database**: MongoDB (Atlas)
- **Authentication**: Clerk
- **Payments**: Stripe
- **External APIs**: TMDB (The Movie Database)
- **Background Jobs**: Inngest (for user sync and email orchestration)
- **Email Service**: Resend
- **QR Code**: qrcode-node
- **Deployment**: Vercel

## ⚙️ Installation & Setup

### Prerequisites

- Node.js installed
- MongoDB Atlas account
- Clerk account
- Stripe account
- TMDB API Key

### 1. Clone the Repository

```bash
git clone <repository-url>
cd Movie-Ticket-booking
```

### 2. Backend Setup

```bash
cd server
npm install
```

Create a `.env` file in the `server` directory:

```env
MONGODB_URI=your_mongodb_connection_string
PORT=3000
TMDB_API_KEY=your_tmdb_api_key

# Clerk Auth
CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
CLERK_SECRET_KEY=your_clerk_secret_key

# Stripe
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key

# Inngest (Required for background tasks)
INNGEST_EVENT_KEY=your_inngest_event_key
INNGEST_SIGNING_KEY=your_inngest_signing_key

# Resend (Required for emails)
RESEND_API_KEY=your_resend_api_key
```

Start the server:

```bash
npm run server
```

### 3. Frontend Setup

```bash
cd client
npm install
```

Create a `.env` file in the `client` directory:

```env
VITE_BASE_URL=http://localhost:3000
VITE_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
VITE_TMDB_IMAGE_BASE_URL=https://image.tmdb.org/t/p/original
VITE_CURRENCY=$
```

Start the client:

```bash
npm run dev
```

## 🚀 Deployment on Vercel

### 1. Server Deployment

- Push your `server` folder code to GitHub.
- Import the project in Vercel.
- Add all Environment Variables from `server/.env`.
- **Important**: Allow access from anywhere (`0.0.0.0/0`) in MongoDB Atlas Network Access.

### 2. Client Deployment

- Push your `client` folder code to GitHub.
- Import the project in Vercel.
- Add Environment Variables from `client/.env`.
- **Critical**: Set `VITE_BASE_URL` to your **deployed server URL** (e.g., `https://your-server.vercel.app`).

## 🛠️ Testing Background Jobs (Inngest)

To test the email flow and user sync locally:

1. Start your local server (`npm run server`).
2. Run the Inngest local development server:
   ```bash
   npx inngest-cli@latest dev -u http://localhost:3000/api/inngest
   ```
3. Open the Inngest Dev Server (usually at `http://localhost:8288`) to view event logs and trigger dry-runs.
