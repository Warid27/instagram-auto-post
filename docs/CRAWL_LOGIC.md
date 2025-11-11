# Crawl Logic

Purpose: Collect per-post analytics (likes, comments count) for an Instagram profile and attach sample comments for each post. Designed to be resilient to UI/layout variations.

## Entry points
- Manual review: `bot/reviewer-bot.js` calls the crawler after fetching account stats.
- Standalone: `bot/crawling-bot.js` can be run directly for ad-hoc crawls. It logs to `bot_logs` and to `bot/logs/crawling-bot-*.log`.

## High-level flow
1) Login is handled earlier by the caller using cookies/password.
2) Fetch account stats with `getAccountStats(page, username)`.
3) If `postsCount >= 1`, start crawling:
   - Find post URLs from the profile grid.
   - For each URL:
     - Open the post page (navigation is fine; opening a new tab is not required).
     - Extract likes and comments count (views ignored).
     - Optionally extract a list of comments.
4) Persist analytics under the review:
   - `account_reviews` row.
   - `account_review_posts` rows with `post_url`, `likes_count`, `comments_count`.
   - `review_comments` rows for extracted comments.

## How post URLs are discovered
We favor stable, data-backed sources; then fall back to DOM parsing:

1) Web Profile API (preferred):
   - GET `https://www.instagram.com/api/v1/users/web_profile_info/?username=<username>`
   - Filter out clips/reels/igtv; build canonical URLs: `https://www.instagram.com/p/<shortcode>/`
2) __NEXT_DATA__ fallback:
   - Parse `script#__NEXT_DATA__` for `graphql.user.edge_owner_to_timeline_media.edges`.
   - Same filtering and canonical URL building as above.
3) DOM fallback (resilient to class-name changes):
   - Scan all anchors on the profile page.
   - Extract shortcode via regex `/\/p\/([A-Za-z0-9_-]+)/` from `href`.
   - Build canonical URL `https://www.instagram.com/p/<shortcode>/`.
   - Works for both `/p/<code>` and `/<username>/p/<code>` href formats.
   - Scroll the page up to several times to load more grid items.

Notes:
- We deliberately exclude reels/clips from crawling for now.
- We wait for `article` and perform multiple scrolls to accommodate lazy-loaded grids.

## Per-post analytics extraction
For each post URL:
- Navigate to the URL.
- Extract counts using multiple strategies:
  - JSON-LD `interactionStatistic` in `script[type="application/ld+json"]`.
  - Pattern matching within `article` text and aria-labels.
  - Final fallback: match in full page text.
- Normalize counts (handle 1.2K/3.4M formats).
- Comments collection:
  - Heuristics to find comment elements and replies.
  - Store as flat list; replies are marked `is_reply`.

## Logging and diagnostics
- Reviewer bot logs key steps to `bot_logs` and `bot/logs/reviewer-bot-*.log`.
- Crawling bot also logs to `bot/logs/crawling-bot-*.log`.
- If zero URLs are found unexpectedly, the reviewer bot captures a full-page screenshot in `bot/screenshots/` for inspection.

## Scalability hooks
- `helpers/crawling.js` exposes a small, composable `crawlAccountPosts` function:
  - Options for `maxPosts`, delays, toggling views, etc.
  - Can be parallelized by launching multiple pages if needed.
- Post/comment extraction logic is centralized in `helpers/review.js` for easy maintenance.

## Why we don’t need to “click”
- We use canonical post URLs and navigate directly (equivalent to clicking).
- Opening in a new tab is not required for scraping counts reliably.


