import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import puppeteer from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import { createClient } from '@supabase/supabase-js'
import winston from 'winston'
import 'winston-daily-rotate-file'
import { compareImages } from './helpers/image-checker.js'
import { loginToInstagram } from './helpers/login.js'
import { decryptPassword } from './utils/encryption.js'

// Load environment variables
dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Configure puppeteer-extra with stealth
puppeteer.use(StealthPlugin())

// Config
const CONFIG = {
  headless: process.env.HEADLESS !== 'false',
  pageLoadTimeout: parseInt(process.env.PAGE_LOAD_TIMEOUT || '30000', 10),
  logLevel: (process.env.LOG_LEVEL || 'info').toLowerCase(),
  similarityThreshold: parseFloat(process.env.IMAGE_SIMILARITY_THRESHOLD || '0.85'), // 85% similarity threshold
}

// Initialize Supabase client (service role in bot)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Logging setup
const transport = new (winston.transports.DailyRotateFile)({
  dirname: path.join(__dirname, 'logs'),
  filename: 'checker-bot-%DATE%.log',
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
 * Fetch posts that need image similarity checking
 * @param {number} limit - Maximum number of posts to fetch
 * @returns {Promise<Array>} - Array of post_accounts records with post and account info
 */
async function fetchPostsToCheck(limit = 10) {
  try {
    const { data, error } = await supabase
      .from('post_accounts')
      .select(`
        *,
        post:posts (
          id,
          user_id,
          image_url,
          caption
        ),
        account:accounts (
          id,
          instagram_username,
          password_encrypted,
          cookies,
          is_active
        )
      `)
      .eq('status', 'completed')
      .eq('image_similarity_checked', false)
      .not('instagram_post_url', 'is', null)
      .not('post.image_url', 'is', null)
      .order('posted_at', { ascending: true })
      .limit(limit)

    if (error) {
      throw error
    }

    // Filter out records where account or post is null
    return (data || []).filter(
      (pa) => pa.post && pa.account && pa.account.is_active && pa.instagram_post_url
    )
  } catch (error) {
    log('error', 'Failed to fetch posts to check', { error: error.message })
    return []
  }
}

/**
 * Check image similarity for a single post
 * @param {Object} postAccount - post_accounts record with post and account info
 * @param {import('puppeteer').Page} existingPage - Optional existing page to reuse (if null, creates new browser)
 * @returns {Promise<{success: boolean, similarity?: number, error?: string}>}
 */
export async function checkPostImage(postAccount, existingPage = null) {
  let browser = null
  let shouldCloseBrowser = false
  let page = existingPage

  try {
    const { post, account, instagram_post_url, id: postAccountId } = postAccount

    log('info', 'Checking image similarity', {
      postAccountId,
      postId: post.id,
      accountId: account.id,
      postUrl: instagram_post_url,
    })

    // Use existing page if provided, otherwise create new browser
    if (!page) {
      shouldCloseBrowser = true
      browser = await puppeteer.launch({
        headless: CONFIG.headless ? 'new' : false,
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

      page = await browser.newPage()
      page.setDefaultNavigationTimeout(CONFIG.pageLoadTimeout)

      // Login to Instagram (needed to view posts) - only if we created new browser
      const savedCookies = account.cookies || null
      let password = null

      if (account.password_encrypted) {
        try {
          password = decryptPassword(account.password_encrypted)
        } catch (decryptError) {
          log('warn', `Failed to decrypt password for @${account.instagram_username}`, {
            error: decryptError.message,
          })
        }
      }

      log('info', `Logging in to Instagram for @${account.instagram_username}`)
      const loginResult = await loginToInstagram(page, account.instagram_username, password, savedCookies)

      if (!loginResult.success) {
        throw new Error(`Login failed: ${loginResult.error || 'Unknown error'}`)
      }

      // Save cookies if login was successful and used password
      if (!loginResult.usedCookies && password) {
        try {
          const cookies = await page.cookies()
          await supabase.from('accounts').update({ cookies }).eq('id', account.id)
          log('info', `Saved new cookies for @${account.instagram_username}`)
        } catch (cookieError) {
          log('warn', `Failed to save cookies for @${account.instagram_username}`, {
            error: cookieError.message,
          })
        }
      }
    }

    // Compare images
    log('info', 'Comparing images', {
      originalImageUrl: post.image_url,
      postUrl: instagram_post_url,
    })

    const comparisonResult = await compareImages(post.image_url, page, instagram_post_url)

    if (!comparisonResult.success) {
      throw new Error(comparisonResult.error || 'Image comparison failed')
    }

    const similarity = comparisonResult.similarity
    const isSimilar = similarity >= CONFIG.similarityThreshold

    log('info', 'Image similarity check completed', {
      postAccountId,
      similarity: similarity.toFixed(4),
      threshold: CONFIG.similarityThreshold,
      isSimilar,
    })

    // Update database
    const updateData = {
      image_similarity_checked: true,
      image_similarity_score: similarity,
      image_similarity_checked_at: new Date().toISOString(),
      image_similarity_error: null,
    }

    await supabase
      .from('post_accounts')
      .update(updateData)
      .eq('id', postAccountId)

    await logActivity(
      isSimilar ? 'success' : 'warn',
      `Image similarity check completed for post`,
      {
        postAccountId,
        postId: post.id,
        accountId: account.id,
        similarity: similarity.toFixed(4),
        threshold: CONFIG.similarityThreshold,
        isSimilar,
        postUrl: instagram_post_url,
      },
      post.user_id
    )

    // Only close browser if we created it
    if (shouldCloseBrowser && browser) {
      await browser.close()
    }

    return {
      success: true,
      similarity,
      isSimilar,
    }
  } catch (error) {
    log('error', 'Image similarity check failed', {
      error: error.message,
      postAccountId: postAccount?.id,
    })

    // Update database with error
    try {
      await supabase
        .from('post_accounts')
        .update({
          image_similarity_checked: true,
          image_similarity_checked_at: new Date().toISOString(),
          image_similarity_error: error.message,
        })
        .eq('id', postAccount?.id)
    } catch (updateError) {
      log('error', 'Failed to update database with error', { error: updateError.message })
    }

    await logActivity(
      'error',
      `Image similarity check failed: ${error.message}`,
      {
        postAccountId: postAccount?.id,
        error: error.message,
      },
      postAccount?.post?.user_id
    )

    // Only close browser if we created it
    if (shouldCloseBrowser && browser) {
      try {
        await browser.close()
      } catch {}
    }

    return {
      success: false,
      error: error.message,
    }
  }
}

/**
 * Main checker function - processes all posts that need checking
 */
export async function runChecker() {
  log('info', '🔍 Checker cycle started')
  let browser = null

  try {
    // Fetch posts that need checking
    const postsToCheck = await fetchPostsToCheck(10)

    if (!postsToCheck || postsToCheck.length === 0) {
      log('info', 'No posts need image similarity checking')
      return
    }

    log('info', `Found ${postsToCheck.length} post(s) to check`)

    // Process each post
    for (const postAccount of postsToCheck) {
      try {
        await checkPostImage(postAccount, null) // null = create new browser
        // Small delay between checks to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 5000))
      } catch (error) {
        log('error', 'Error checking post', {
          error: error.message,
          postAccountId: postAccount?.id,
        })
        // Continue with next post
      }
    }

    log('info', '✅ Checker cycle completed')
  } catch (err) {
    log('error', '❌ Unhandled error in checker cycle', { error: err.message })
  } finally {
    if (browser) {
      try {
        await browser.close()
      } catch {}
    }
  }
}

// Only run if this is the main module (manual execution)
const isMainModule =
  process.argv[1] &&
  (process.argv[1].endsWith('checker-bot.js') || process.argv[1].endsWith('checker-bot'))

if (isMainModule) {
  // Graceful shutdown
  async function shutdown() {
    log('info', '🛑 Shutting down checker gracefully...')
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  // Run immediately when called manually
  log('info', '🔍 Starting checker bot (manual run)')
  runChecker()
    .then(() => {
      log('info', '✅ Checker completed')
      process.exit(0)
    })
    .catch((error) => {
      log('error', '❌ Checker failed', { error: error.message })
      process.exit(1)
    })
}

