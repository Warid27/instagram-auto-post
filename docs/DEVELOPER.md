# Developer Guide

## Architecture Overview
- Dashboard (React/Vite): user interface for accounts, posts, and monitoring.
- Backend (Express): API layer with Supabase integration and security middleware.
- Bot (Puppeteer): posting automation with process manager and logging.
- Database (Supabase): auth and data storage; RLS policies enforce per-user access.

## Database Schema
- accounts: user-owned Instagram accounts; stores encrypted passwords and cookies.
- posts: post objects with caption, image_url, status, scheduled_at.
- post_accounts: junction table mapping posts to target accounts with per-account status.
- bot_logs: time-stamped activity and error records for bot runs.

See `backend/supabase/migrations/001_initial_schema.sql` for full DDL and RLS policies.

## API Endpoints (summary)
- GET `/health`
- GET `/api` (metadata)
- Accounts: `/api/accounts` CRUD
- Posts: `/api/posts` CRUD + `/api/posts/:id/retry`
- Queue/Upload/Bot: see `backend/routes/*.js`

Errors follow `{ error: true, message, code }` format with appropriate HTTP statuses.

## Bot Flow
1. Process manager schedules cycles via CRON, prevents overlaps.
2. Bot fetches pending posts, logs in (cookies if possible), uploads image, shares.
3. Updates `post_accounts` and `posts` status; writes bot_logs.
4. Error handling categorizes network/instagram/system errors and retries where appropriate.

## Extending the System
- Add new routes under `backend/routes/`, validate with `express-validator`.
- Add new bot helpers in `bot/helpers/` and plug into process manager.
- Update migrations for schema changes; re-run in Supabase.

## Testing
- Dashboard: Vitest + React Testing Library (`npm run test` in dashboard).
- Backend: Jest + Supertest (`npm test` in backend).
- Bot: Jest unit tests with ESM support (`npm test` in bot).

## Logging
- Winston-based rotating logs per component:
  - Backend: `backend/logs/backend-YYYY-MM-DD.log`
  - Bot: `bot/logs/bot-YYYY-MM-DD.log`
- Database activity logs in `bot_logs`.

## Security
- Helmet/CSP, CSRF for non-GET, rate limiting.
- Bcrypt(12) for credentials; redacted logs.
- Supabase RLS for tenant isolation.
