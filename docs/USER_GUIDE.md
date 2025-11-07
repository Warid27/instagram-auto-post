# User Guide

## Adding Instagram Accounts
1. Open the Dashboard and navigate to Accounts.
2. Click Add Account.
3. Enter Instagram username and password for the test/business account.
4. Save. The bot will log in using secure automation when needed.

Notes:
- Passwords are encrypted at rest.
- You can deactivate accounts without deleting them.

## Creating and Scheduling Posts
1. Go to Create Post.
2. Paste an image URL and write a caption.
3. Select one or more accounts to post to.
4. Choose a schedule time or post now.
5. Submit to queue.

## Understanding Post Statuses
- pending: Awaiting scheduled time or bot availability.
- processing: Bot picked up the job and is posting.
- completed: Post succeeded. URL may be attached if available.
- failed: Post failed. Check the error and logs; you can retry.

## Monitoring and Logs
- Bot Health: `http://localhost:3002/health`
- Bot Logs: `http://localhost:3002/logs`
- Backend Health: `http://localhost:3001/health`

## Troubleshooting
- Login/2FA: Use non-2FA accounts. If 2FA prompts, manual intervention may be required.
- File input not found: Instagram UI changes. Update selectors in `bot/helpers/post.js` or override via options.
- RLS errors: Ensure the dashboard uses anon key; backend/bot use service role key.
- Not posting: Check process manager lock, CRON schedule, and `/health` nextRun.
- Rate limits: Daily counters per account apply; spread posts.

## Best Practices to Avoid Bans
- Use realistic delays; avoid aggressive schedules.
- Prefer business accounts; avoid frequent logins from different locations.
- Keep captions and actions human-like; the bot simulates typing and mouse moves.
- Monitor failed attempts and pause after repeated failures.
