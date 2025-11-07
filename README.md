# Instagram Automation System

A comprehensive monorepo project for automating Instagram posting operations with a modern dashboard interface, secure backend API, and intelligent bot automation.

## Project Structure

This monorepo consists of three main components:

### 📊 Dashboard (`dashboard/`)
A modern React-based dashboard built with Vite, Tailwind CSS, and shadcn/ui components for managing Instagram automation tasks, viewing analytics, and configuring posting schedules.

### 🔧 Backend (`backend/`)
A secure Express.js API server that handles authentication, manages Instagram accounts, processes posting requests, and integrates with Supabase for data persistence.

### 🤖 Bot (`bot/`)
An intelligent automation bot built with Puppeteer that handles Instagram login, posting, and monitoring operations with stealth capabilities and rate limiting.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18 or higher)
- **npm** (v9 or higher) or **yarn**
- **Supabase Account** (for database and authentication)
- **Git** (for version control)

## Quick Start

### 1. Clone the repository
```bash
git clone <your-repo-url>
cd instagram-automation
```

### 2. Install dependencies

Navigate to each folder and install dependencies:

```bash
# Dashboard
cd dashboard
npm install
cd ..

# Backend
cd backend
npm install
cd ..

# Bot
cd bot
npm install
cd ..
```

### 3. Environment Setup

1. Copy `.env.example` files to `.env` in each folder:
   ```bash
   # Root
   cp .env.example .env

   # Dashboard
   cp dashboard/.env.example dashboard/.env

   # Backend
   cp backend/.env.example backend/.env

   # Bot
   cp bot/.env.example bot/.env
   ```

2. Update all `.env` files with your actual Supabase credentials and configuration values.

### 4. Start Development Servers

Open separate terminal windows/tabs:

**Terminal 1 - Dashboard:**
```bash
cd dashboard
npm run dev
```
Dashboard will be available at `http://localhost:5173`

**Terminal 2 - Backend:**
```bash
cd backend
npm run dev
```
Backend API will be available at `http://localhost:3001`

**Terminal 3 - Bot:**
```bash
cd bot
node index.js
```
Bot will run according to the CRON schedule defined in `.env`

## Folder Structure

```
instagram-automation/
├── README.md
├── .gitignore
├── .env.example
│
├── dashboard/          # React + Vite + Tailwind Dashboard
│   ├── src/
│   │   ├── components/  # Reusable UI components
│   │   ├── pages/      # Page components
│   │   ├── contexts/   # React contexts
│   │   ├── lib/        # Library utilities
│   │   └── utils/      # Helper functions
│   ├── public/         # Static assets
│   └── package.json
│
├── backend/            # Express.js API Server
│   ├── routes/         # API route handlers
│   ├── middleware/     # Express middleware
│   ├── utils/          # Utility functions
│   ├── supabase/       # Supabase client & migrations
│   └── package.json
│
└── bot/                # Puppeteer Automation Bot
    ├── helpers/        # Automation helper functions
    ├── logs/           # Log files
    ├── screenshots/    # Error screenshots
    └── package.json
```

## Setup Instructions

### Supabase Setup

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Go to Project Settings > API
3. Copy your Project URL and API keys
4. Update all `.env` files with these credentials

### Database Schema

*[Database schema setup instructions will be added here]*

### Instagram Account Configuration

*[Instagram account setup instructions will be added here]*

## Development

### Dashboard Development
- Uses Vite for fast HMR (Hot Module Replacement)
- Tailwind CSS for styling
- shadcn/ui components for UI elements

### Backend Development
- Express.js with middleware for security (helmet, rate limiting)
- Supabase for database and authentication
- RESTful API design

### Bot Development
- Puppeteer for browser automation
- Stealth plugins to avoid detection
- Cron scheduling for automated posting
- Error handling with screenshots

## Security Notes

- Never commit `.env` files to version control
- Use service role keys only in backend/bot, never in frontend
- Rotate JWT secrets regularly
- Implement proper rate limiting for production
- Use environment-specific configurations

## License

*[Add your license here]*

## Contributing

*[Add contributing guidelines here]*

## Support

*[Add support information here]*

---

## Comprehensive Setup Guide

### 1) Prerequisites

- Node.js 18+
- npm or yarn
- Supabase account
- Instagram Business accounts

### 2) Supabase Setup

1. Create a new project at `https://supabase.com`.
2. Run the SQL migrations from `backend/supabase/migrations/001_initial_schema.sql` (SQL Editor → Run).
3. Create a storage bucket named `instagram-posts` (Storage → Create bucket).
4. Get API keys (Settings → API):
   - Project URL
   - `anon` key (Dashboard)
   - `service_role` key (Backend/Bot only)
5. Ensure RLS policies are enabled. The migration file already includes policies. Example excerpt:

```sql
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own posts"
  ON posts FOR SELECT USING (auth.uid() = user_id);
```

### 3) Environment Variables

Create `.env` files for each component.

- Dashboard (`dashboard/.env`):
  - `VITE_SUPABASE_URL=`
  - `VITE_SUPABASE_ANON_KEY=`

- Backend (`backend/.env`):
  - `SUPABASE_URL=`
  - `SUPABASE_SERVICE_ROLE_KEY=`
  - `PORT=3001`
  - `JWT_SECRET=`

- Bot (`bot/.env`):
  - `SUPABASE_URL=`
  - `SUPABASE_SERVICE_ROLE_KEY=`
  - `HEADLESS=true`
  - `CRON_SCHEDULE=*/5 * * * *`
  - `HEALTH_CHECK_PORT=3002`

### 4) Installation Steps

```bash
# Install dependencies
cd dashboard && npm install
cd ../backend && npm install
cd ../bot && npm install

# Run development
cd dashboard && npm run dev
cd backend && npm start
cd bot && node process-manager.js
```

- Dashboard: `http://localhost:5173`
- Backend: `http://localhost:3001`
- Bot health: `http://localhost:3002/health`

### 5) Deployment

- Dashboard: Vercel (set `VITE_SUPABASE_*`)
- Backend: Vercel Serverless or Railway (set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`)
- Bot: PM2/Docker/local or VPS (entrypoint: `node process-manager.js`)

### 6) Testing

1. Use a test Instagram account.
2. Add account in dashboard.
3. Create a test post (image URL + caption).
4. Monitor bot logs (`bot/logs` or `GET /logs`).
5. Verify the post on Instagram.

### Troubleshooting

- Login/2FA issues: use non-2FA accounts or handle manually.
- Selectors changed: adjust in `bot/helpers/post.js` or pass overrides.
- Supabase RLS errors: confirm you use `anon` (dashboard) and `service_role` (backend/bot); re-run migration.
- Bot overlap/runs: use process manager (`bot/process-manager.js`), check `/health` and cron.
- Rate limits: DB columns `posts_today`, `last_post_at` must exist; keep delays realistic.
- Timezone: schedule in UTC or account for offsets.
- Post URL missing: Instagram may not expose after share; confirm via profile feed.