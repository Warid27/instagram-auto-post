import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import puppeteer from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import { createClient } from '@supabase/supabase-js'
import winston from 'winston'
import 'winston-daily-rotate-file'
import { getAccountStats, getPostComments } from './helpers/review.js'
import { crawlAccountPosts } from './helpers/crawling.js'
import axios from 'axios'

// Load environment variables
dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Configure puppeteer-extra with stealth
puppeteer.use(StealthPlugin())

// Config
const CONFIG = {
  headless: process.env.HEADLESS !== 'false', // Default to headless (true) unless explicitly set to false
  pageLoadTimeout: parseInt(process.env.PAGE_LOAD_TIMEOUT || '30000', 10),
  logLevel: (process.env.LOG_LEVEL || 'info').toLowerCase(),
  backendApiUrl: process.env.BACKEND_API_URL || process.env.API_URL || 'http://localhost:3001',
  notifySecret: process.env.REVIEW_NOTIFY_SECRET || process.env.BOT_INTERNAL_SECRET || null,
}

// Initialize Supabase client (service role in bot)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Logging setup
const transport = new (winston.transports.DailyRotateFile)({
  dirname: path.join(__dirname, 'logs'),
  filename: 'reviewer-bot-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '10m',
  maxFiles: '7d',
})

const logger = winston.createLogger({
  level: CONFIG.logLevel,
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [transport, new winston.transports.Console({ format: winston.format.simple() })],
})

function log(level, message, meta = {}) {
  const validLevels = ['error', 'warn', 'info', 'verbose', 'debug', 'silly']
  const logLevel = validLevels.includes(level) ? level : 'info'
  if (typeof logger[logLevel] === 'function') {
    logger[logLevel](message, meta)
  } else {
    logger.info(message, meta)
  }
}

async function logActivity(type, message, details = '', userId = null) {
  log(type, message, { details })
  try {
    const logEntry = {
      action: message,
      status: type,
      details: typeof details === 'string' ? { details } : details,
    }
    if (userId) {
      logEntry.user_id = userId
    }
    await supabase.from('bot_logs').insert(logEntry)
  } catch {}
}

async function notifyBackend(userId, payload) {
  if (!CONFIG.backendApiUrl || !CONFIG.notifySecret) return
  try {
    await axios.post(
      `${CONFIG.backendApiUrl.replace(/\/$/, '')}/api/reviewer/notify`,
      { ...payload, userId },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-internal-key': CONFIG.notifySecret,
        },
        timeout: 15000,
      }
    )
  } catch (error) {
    log('warn', 'Failed to notify backend about review status', {
      error: error.message,
      endpoint: `${CONFIG.backendApiUrl}/api/reviewer/notify`,
    })
  }
}

/**
 * Review a single account
 * @param {string} accountId - Account ID to review
 * @param {string} userId - User ID who owns the account
 * @returns {Promise<{success: boolean, reviewId?: string, error?: string}>}
 */
export async function reviewAccountById(accountId, userId) {
  let browser = null
  let reviewId = null

  try {
    log('info', `Starting review for account ${accountId}`, { accountId, userId })
    await logActivity('info', `Review started for account ${accountId}`, { accountId }, userId)

    // Fetch account details
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('id, instagram_username, password_encrypted, cookies, user_id')
      .eq('id', accountId)
      .eq('user_id', userId)
      .single()

    if (accountError || !account) {
      throw new Error(`Account not found or access denied: ${accountError?.message || 'Unknown error'}`)
    }

    await logActivity('info', `Logging in to Instagram for @${account.instagram_username}`, {
      accountId,
      username: account.instagram_username,
    }, userId)

    // Launch browser in headless mode (no visible window) - runs silently on server
    browser = await puppeteer.launch({
      headless: 'new', // Always run headless - no visible browser window
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1920,1080',
      ],
    })

    const page = await browser.newPage()
    page.setDefaultNavigationTimeout(CONFIG.pageLoadTimeout)

    // Perform review (now uses crawling for per-post analytics)
    log('info', `Reviewing account @${account.instagram_username}`)
    await logActivity('info', `Collecting account stats for @${account.instagram_username}`, {
      accountId,
      username: account.instagram_username,
    }, userId)

    // 1) Account-level stats
    const accountStats = await getAccountStats(page, account.instagram_username)

    await logActivity('info', `Account stats collected for @${account.instagram_username}`, {
      accountId,
      username: account.instagram_username,
      stats: accountStats,
    }, userId)

    // Skip crawl if account shows no posts
    if (!accountStats.postsCount || accountStats.postsCount < 1) {
      await logActivity('warning', `No posts to crawl for @${account.instagram_username}`, {
        accountId,
        username: account.instagram_username,
      }, userId)
      const reviewResult = { success: true, accountStats, posts: [] }

      // Create review record in database
      const reviewDatetime = new Date().toISOString()
      const { data: review, error: reviewError } = await supabase
        .from('account_reviews')
        .insert({
          account_id: accountId,
          user_id: userId,
          review_datetime: reviewDatetime,
          posts_count: reviewResult.accountStats.postsCount,
          followers_count: reviewResult.accountStats.followersCount,
          following_count: reviewResult.accountStats.followingCount,
        })
        .select('id')
        .single()

      if (reviewError) {
        throw new Error(`Failed to save review: ${reviewError.message}`)
      }

      reviewId = review.id
      await logActivity('success', `Review completed (no posts) for @${account.instagram_username}`, {
        accountId,
        reviewId,
      }, userId)

      await browser.close()
      return {
        success: true,
        reviewId,
        accountStats: reviewResult.accountStats,
        postsCount: 0,
      }
    }

    // 2) Crawl recent posts for likes/comments counters
    await logActivity('info', `Crawling recent posts for @${account.instagram_username}`, {
      accountId,
      username: account.instagram_username,
    }, userId)
    const crawl = await crawlAccountPosts(page, account, { maxPosts: 12 })
    if (!crawl.success) {
      throw new Error(crawl.error || 'Crawl failed')
    }
    await logActivity('info', `Crawl completed for @${account.instagram_username}`, {
      accountId,
      username: account.instagram_username,
      postCount: crawl.posts?.length || 0,
      sample: (crawl.posts || []).slice(0, 3).map(p => p.url),
    }, userId)

    // 3) Optionally enrich with comments for each crawled post
    const posts = []
    for (const post of crawl.posts) {
      try {
        await logActivity('info', `Fetching post stats/comments`, { accountId, postUrl: post.url }, userId)
        const comments = await getPostComments(page, post.url)
        posts.push({
          url: post.url,
          viewsCount: post.viewsCount || 0,
          likesCount: post.likesCount || 0,
          commentsCount: post.commentsCount || 0,
          comments: comments || [],
        })
        await logActivity('info', `Fetched post stats/comments`, {
          accountId,
          postUrl: post.url,
          likesCount: post.likesCount || 0,
          commentsCount: post.commentsCount || 0,
        }, userId)
      } catch (_) {
        posts.push({
          url: post.url,
          viewsCount: post.viewsCount || 0,
          likesCount: post.likesCount || 0,
          commentsCount: post.commentsCount || 0,
          comments: [],
        })
      }
    }

    const reviewResult = { success: true, accountStats, posts }

    // If crawl returned zero posts unexpectedly, capture screenshot for diagnostics
    if (!reviewResult.posts || reviewResult.posts.length === 0) {
      try {
        const ts = new Date().toISOString().replace(/[:.]/g, '-')
        const safeUser = (account.instagram_username || 'unknown').replace(/[^a-z0-9_-]/gi, '_')
        const file = path.join(__dirname, 'screenshots', `crawl-${safeUser}-${ts}.png`)
        await fs.promises.mkdir(path.join(__dirname, 'screenshots'), { recursive: true })
        await page.screenshot({ path: file, fullPage: true })
        await logActivity('warning', 'Crawl returned no posts; screenshot saved', { accountId, username: account.instagram_username, screenshot: file }, userId)
      } catch {}
    }

    // Create review record in database
    const reviewDatetime = new Date().toISOString()
    const { data: review, error: reviewError } = await supabase
      .from('account_reviews')
      .insert({
        account_id: accountId,
        user_id: userId,
        review_datetime: reviewDatetime,
        posts_count: reviewResult.accountStats.postsCount,
        followers_count: reviewResult.accountStats.followersCount,
        following_count: reviewResult.accountStats.followingCount,
      })
      .select('id')
      .single()

    if (reviewError) {
      throw new Error(`Failed to save review: ${reviewError.message}`)
    }

    reviewId = review.id

    // Save post stats
    if (reviewResult.posts && reviewResult.posts.length > 0) {
      await logActivity('info', `Collecting post stats: ${reviewResult.posts.length} posts`, {
        accountId,
        reviewId,
        postCount: reviewResult.posts.length,
      }, userId)

      // Save posts and their comments
      for (const post of reviewResult.posts) {
        try {
          // Insert post record
          const { data: savedPost, error: postInsertError } = await supabase
            .from('account_review_posts')
            .insert({
              review_id: reviewId,
              post_url: post.url,
              views_count: post.viewsCount,
              likes_count: post.likesCount,
              comments_count: post.commentsCount,
            })
            .select('id')
            .single()

          if (postInsertError) {
            log('warn', `Failed to save post: ${post.url}`, { error: postInsertError.message })
            continue
          }

          // Save comments if any
          if (post.comments && post.comments.length > 0) {
            const mainComments = post.comments.filter(c => !c.isReply)
            const replies = post.comments.filter(c => c.isReply)

            // Save main comments first
            const mainCommentRecords = mainComments.map(comment => ({
              review_post_id: savedPost.id,
              username: comment.username,
              comment_text: comment.commentText,
              is_reply: false,
              parent_comment_id: null,
            }))

            if (mainCommentRecords.length > 0) {
              const { data: savedMainComments, error: mainCommentsError } = await supabase
                .from('review_comments')
                .insert(mainCommentRecords)
                .select('id, username, comment_text')

              if (mainCommentsError) {
                log('warn', `Failed to save main comments for post ${post.url}`, {
                  error: mainCommentsError.message,
                })
              } else {
                // Try to match replies to parent comments
                // For now, we'll save replies without parent links (can be improved later)
                const replyRecords = replies.map(reply => ({
                  review_post_id: savedPost.id,
                  username: reply.username,
                  comment_text: reply.commentText,
                  is_reply: true,
                  parent_comment_id: null, // Could be improved to match by username/context
                }))

                if (replyRecords.length > 0) {
                  const { error: repliesError } = await supabase
                    .from('review_comments')
                    .insert(replyRecords)

                  if (repliesError) {
                    log('warn', `Failed to save replies for post ${post.url}`, {
                      error: repliesError.message,
                    })
                  }
                }
              }
            }
          }
        } catch (postError) {
          log('warn', `Error processing post ${post.url}`, { error: postError.message })
          // Continue with next post
        }
      }

      await logActivity('success', `Post stats and comments saved: ${reviewResult.posts.length} posts`, {
        accountId,
        reviewId,
        postCount: reviewResult.posts.length,
      }, userId)
    } else {
      await logActivity('warning', `No posts found for @${account.instagram_username}`, {
        accountId,
        reviewId,
      }, userId)
    }

    log('info', `Review completed successfully for @${account.instagram_username}`, {
      reviewId,
      accountId,
      postsCount: reviewResult.posts?.length || 0,
    })

    await logActivity('success', `Review completed for @${account.instagram_username}`, {
      accountId,
      reviewId,
      username: account.instagram_username,
      postsCount: reviewResult.posts?.length || 0,
      stats: reviewResult.accountStats,
    }, userId)

    await notifyBackend(userId, {
      accountId,
      reviewId,
      status: 'completed',
      message: `Review completed for @${account.instagram_username}`,
      postsCount: reviewResult.posts?.length || 0,
      stats: reviewResult.accountStats,
    })

    await browser.close()

    return {
      success: true,
      reviewId,
      accountStats: reviewResult.accountStats,
      postsCount: reviewResult.posts?.length || 0,
    }
  } catch (error) {
    log('error', `Review failed for account ${accountId}`, {
      error: error.message,
      accountId,
      userId,
    })

    await logActivity('error', `Review failed: ${error.message}`, {
      accountId,
      error: error.message,
    }, userId)

    await notifyBackend(userId, {
      accountId,
      reviewId: reviewId || null,
      status: 'failed',
      message: `Review failed for @${accountId}`,
      error: error.message,
    })

    if (browser) {
      try {
        await browser.close()
      } catch {}
    }

    return {
      success: false,
      error: error.message || 'Unknown error during review',
    }
  }
}

/**
 * Review multiple accounts
 * @param {string[]} accountIds - Array of account IDs to review
 * @param {string} userId - User ID who owns the accounts
 * @returns {Promise<{success: boolean, results: Array}>}
 */
export async function reviewAccounts(accountIds, userId) {
  const results = []

  for (const accountId of accountIds) {
    const result = await reviewAccountById(accountId, userId)
    results.push({
      accountId,
      ...result,
    })
  }

  return {
    success: results.every((r) => r.success),
    results,
  }
}

// If run directly (for testing)
if (import.meta.url === `file://${process.argv[1]}`) {
  const accountId = process.argv[2]
  const userId = process.argv[3]

  if (!accountId || !userId) {
    console.error('Usage: node reviewer-bot.js <accountId> <userId>')
    process.exit(1)
  }

  reviewAccountById(accountId, userId)
    .then((result) => {
      console.log('Review result:', result)
      process.exit(result.success ? 0 : 1)
    })
    .catch((error) => {
      console.error('Error:', error)
      process.exit(1)
    })
}

