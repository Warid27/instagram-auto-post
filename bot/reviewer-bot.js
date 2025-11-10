import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import puppeteer from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import { createClient } from '@supabase/supabase-js'
import winston from 'winston'
import 'winston-daily-rotate-file'
import { reviewAccount } from './helpers/review.js'

// Load environment variables
dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Configure puppeteer-extra with stealth
puppeteer.use(StealthPlugin())

// Config
const CONFIG = {
  headless: process.env.HEADLESS === 'true',
  pageLoadTimeout: parseInt(process.env.PAGE_LOAD_TIMEOUT || '30000', 10),
  logLevel: (process.env.LOG_LEVEL || 'info').toLowerCase(),
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

    // Launch browser
    browser = await puppeteer.launch({
      headless: CONFIG.headless ? 'new' : false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
      ],
    })

    const page = await browser.newPage()
    page.setDefaultNavigationTimeout(CONFIG.pageLoadTimeout)

    // Perform review
    log('info', `Reviewing account @${account.instagram_username}`)
    await logActivity('info', `Collecting account stats for @${account.instagram_username}`, {
      accountId,
      username: account.instagram_username,
    }, userId)
    const reviewResult = await reviewAccount(page, account)

    if (!reviewResult.success) {
      throw new Error(reviewResult.error || 'Review failed')
    }

    await logActivity('info', `Account stats collected for @${account.instagram_username}`, {
      accountId,
      username: account.instagram_username,
      stats: reviewResult.accountStats,
    }, userId)

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

      const postRecords = reviewResult.posts.map((post) => ({
        review_id: reviewId,
        post_url: post.url,
        views_count: post.viewsCount,
        likes_count: post.likesCount,
        comments_count: post.commentsCount,
      }))

      const { error: postsError } = await supabase
        .from('account_review_posts')
        .insert(postRecords)

      if (postsError) {
        log('warn', `Failed to save some post stats: ${postsError.message}`, { reviewId })
        await logActivity('warning', `Failed to save post stats: ${postsError.message}`, {
          accountId,
          reviewId,
        }, userId)
        // Don't fail the whole review if post stats fail
      } else {
        await logActivity('success', `Post stats saved: ${reviewResult.posts.length} posts`, {
          accountId,
          reviewId,
          postCount: reviewResult.posts.length,
        }, userId)
      }
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

