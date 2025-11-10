import dotenv from 'dotenv'
import cron from 'node-cron'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import puppeteer from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import { createClient } from '@supabase/supabase-js'
import axios from 'axios'
import winston from 'winston'
import 'winston-daily-rotate-file'
import { postToInstagram as postToInstagramHelper } from './helpers/post.js'
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
  apiUrl: process.env.API_URL || 'http://localhost:3001',
  cron: process.env.CRON_SCHEDULE || '*/5 * * * *',
  headless: process.env.HEADLESS === 'true',
  maxPostsPerHour: parseInt(process.env.MAX_POSTS_PER_HOUR || '5', 10),
  maxPostsPerDay: parseInt(process.env.MAX_POSTS_PER_DAY || '25', 10),
  minDelayMs: parseInt(process.env.MIN_DELAY_BETWEEN_POSTS_MS || '120000', 10),
  maxDelayMs: parseInt(process.env.MAX_DELAY_BETWEEN_POSTS_MS || '300000', 10),
  pageLoadTimeout: parseInt(process.env.PAGE_LOAD_TIMEOUT || '30000', 10),
  logLevel: (process.env.LOG_LEVEL || 'info').toLowerCase(),
  logToFile: process.env.LOG_TO_FILE === 'true',
}

// Initialize Supabase client (service role in bot)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Logging helpers
function nowIso() {
  return new Date().toISOString()
}

const transport = new (winston.transports.DailyRotateFile)({
  dirname: path.join(__dirname, 'logs'),
  filename: 'bot-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '10m',
  maxFiles: '7d',
})
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
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

// Utility
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function randomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

// Queue fetching
async function fetchQueue(limit = 5) {
  try {
    // Prefer backend queue API if available
    const { data: { session } } = await supabase.auth.getSession()
    const headers = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}

    const url = `${CONFIG.apiUrl}/api/queue?limit=${limit}`
    const { data } = await axios.get(url, { headers, timeout: 20000 })
    return data.queue || []
  } catch (err) {
    log('warn', 'Queue API unavailable, falling back to Supabase query', { error: err.message })

    // Fallback: query Supabase directly
    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('posts')
      .select(`
        *,
        post_accounts (
          id,
          account_id,
          status,
          account:accounts (
            id,
            instagram_username,
            password_encrypted,
            cookies,
            is_active
          )
        )
      `)
      .eq('status', 'pending')
      .lte('scheduled_at', now)
      .order('scheduled_at', { ascending: true })
      .limit(limit)

    if (error) throw error
    return data || []
  }
}

// Perform the posting using puppeteer
async function postToInstagram(page, post, account) {
  try {
    // 1. Login to Instagram (try cookies first, then password if needed)
    const savedCookies = account.cookies || null
    let password = null
    
    // Decrypt password if available (for fallback when cookies fail)
    if (account.password_encrypted) {
      try {
        password = decryptPassword(account.password_encrypted)
      } catch (decryptError) {
        log('warn', `Failed to decrypt password for @${account.instagram_username}`, { error: decryptError.message })
        // Continue without password - will rely on cookies only
      }
    }
    
    log('info', `Logging in to Instagram for @${account.instagram_username}`)
    const loginResult = await loginToInstagram(
      page,
      account.instagram_username,
      password,
      savedCookies
    )
    
    if (!loginResult.success) {
      throw new Error(`Login failed: ${loginResult.error || 'Unknown error'}. Please check credentials.`)
    }
    
    // Save cookies if login was successful and used password
    if (!loginResult.usedCookies && password) {
      try {
        const cookies = await page.cookies()
        await supabase
          .from('accounts')
          .update({ cookies })
          .eq('id', account.id)
        log('info', `Saved new cookies for @${account.instagram_username}`)
      } catch (cookieError) {
        log('warn', `Failed to save cookies for @${account.instagram_username}`, { error: cookieError.message })
      }
    }
    
    log('info', `Successfully logged in to @${account.instagram_username}`, { usedCookies: loginResult.usedCookies })
    
    // 2. Post the image and caption
    log('info', `Posting image and caption for post ${post.id}`)
    const postResult = await postToInstagramHelper(
      page,
      post.image_url,
      post.caption || '',
      {
        navigationTimeoutMs: CONFIG.pageLoadTimeout,
        processingWaitMs: 10000,
        username: account.instagram_username,
      }
    )
    
    if (!postResult.success) {
      throw new Error(postResult.error || 'Posting failed')
    }
    
    return {
      success: true,
      url: postResult.url || null,
    }
  } catch (error) {
    log('error', `Error in postToInstagram for @${account.instagram_username}`, { error: error.message })
    return {
      success: false,
      error: error.message || 'Unknown error',
    }
  }
}

// Process a single post with retries
async function processPost(browser, post) {
  const page = await browser.newPage()
  page.setDefaultNavigationTimeout(CONFIG.pageLoadTimeout)

  // Determine accounts to post to
  const targetAccounts = (post.post_accounts || [])
    .map((pa) => pa.account)
    .filter((acc) => acc && acc.is_active)

  let results = []

  for (const account of targetAccounts) {
    // Check daily limit for the account
    const { data: accountRow } = await supabase
      .from('accounts')
      .select('id, posts_today')
      .eq('id', account.id)
      .single()

    const postsToday = accountRow?.posts_today || 0
    if (postsToday >= CONFIG.maxPostsPerDay) {
      log('warn', `Daily limit reached for @${account.instagram_username}`, { accountId: account.id })
      continue
    }

    // Retry loop up to 3 attempts
    let attempt = 0
    let success = false
    let lastError = null
    let postedUrl = null

    while (attempt < 3 && !success) {
      attempt += 1
      try {
        log('info', `Posting to @${account.instagram_username} (attempt ${attempt})`, { postId: post.id })
        const res = await postToInstagram(page, post, account)
        if (res.success) {
          // If post succeeded but no URL, mark as failed
          if (!res.url) {
            throw new Error('Post succeeded but could not retrieve post URL. Marking as failed.')
          }
          
          success = true
          postedUrl = res.url

          // update post_accounts row
          await supabase
            .from('post_accounts')
            .update({ status: 'completed', instagram_post_url: postedUrl, posted_at: nowIso() })
            .eq('post_id', post.id)
            .eq('account_id', account.id)

          // increment posts_today
          await supabase
            .from('accounts')
            .update({ posts_today: postsToday + 1 })
            .eq('id', account.id)

          await logActivity('success', `Posted to @${account.instagram_username}`, { url: postedUrl || 'N/A', postId: post.id, accountId: account.id }, post.user_id)
        } else {
          throw new Error(res.error || 'Unknown failure while posting')
        }
      } catch (err) {
        lastError = err
        // Categorize errors
        const msg = err.message || ''
        let category = 'system'
        if (/net::|ECONN|ETIMEDOUT|network/i.test(msg)) category = 'network'
        else if (/instagram|csrf|login|2fa/i.test(msg)) category = 'instagram'
        log('error', `Error posting to @${account.instagram_username}`, { error: msg, category })
        try { 
          await supabase.from('bot_logs').insert({ 
            user_id: post.user_id,
            action: 'post', 
            status: 'error', 
            details: { postId: post.id, accountId: account.id, category }, 
            error: msg 
          }) 
        } catch {}

        // update post_accounts row to failed for this attempt
        await supabase
          .from('post_accounts')
          .update({ status: 'failed', error_message: err.message })
          .eq('post_id', post.id)
          .eq('account_id', account.id)

        if (attempt < 3 && category === 'network') {
          const delay = randomDelay(10000, 30000)
          await sleep(delay)
        } else {
          break
        }
      }
    }

    results.push({ accountId: account.id, success, postedUrl, error: lastError?.message })

    // Delay between accounts to avoid detection
    const delayMs = randomDelay(CONFIG.minDelayMs, CONFIG.maxDelayMs)
    log('info', `Waiting ${Math.round(delayMs / 1000)}s before next account`)    
    await sleep(delayMs)
  }

  await page.close()

  // Determine final post status
  const anySuccess = results.some((r) => r.success)
  const allFailed = results.every((r) => !r.success)

  if (anySuccess && !allFailed) {
    await supabase
      .from('posts')
      .update({ status: 'completed', updated_at: nowIso() })
      .eq('id', post.id)
  } else if (allFailed) {
    await supabase
      .from('posts')
      .update({ status: 'failed', updated_at: nowIso() })
      .eq('id', post.id)
  } else {
    // mixed results – keep as processing/pending (optional)
    await supabase
      .from('posts')
      .update({ status: 'processing', updated_at: nowIso() })
      .eq('id', post.id)
  }
}

// Main bot run function
export async function runBot() {
  log('info', '🤖 Bot cycle started')
  let browser = null

  try {
    // Fetch queue
    const queue = await fetchQueue(5)
    if (!queue || queue.length === 0) {
      log('info', 'No pending posts in queue')
      // Log queue check for all users (we don't know which user to log for)
      // This is a general system log, so we'll skip user_id
      return
    }

    // Log queue check - group by user_id
    const usersInQueue = [...new Set(queue.map(p => p.user_id).filter(Boolean))]
    for (const userId of usersInQueue) {
      const userPosts = queue.filter(p => p.user_id === userId)
      await logActivity('info', `Queue check: ${userPosts.length} post(s) found`, {
        postCount: userPosts.length,
        postIds: userPosts.map(p => p.id),
      }, userId)
    }

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

    // Process posts sequentially
    for (const post of queue) {
      try {
        log('info', `Processing post ${post.id}`)

        // Mark as processing
        await supabase
          .from('posts')
          .update({ status: 'processing', updated_at: nowIso() })
          .eq('id', post.id)

        await processPost(browser, post)
      } catch (err) {
        log('error', `Post ${post.id} failed`, { error: err.message })
        await supabase
          .from('posts')
          .update({ status: 'failed', updated_at: nowIso() })
          .eq('id', post.id)
      }
    }

    log('info', '✅ Bot cycle completed')
  } catch (err) {
    log('error', '❌ Unhandled error in bot cycle', { error: err.message })
  } finally {
    if (browser) {
      try {
        await browser.close()
      } catch {}
    }
  }
}

// Only run if this is the main module (not imported)
// Check if this file is being run directly (not imported)
const isMainModule = process.argv[1] && (
  process.argv[1].endsWith('instagram-bot.js') || 
  process.argv[1].endsWith('instagram-bot')
);
if (isMainModule) {
  // Schedule bot
  if (CONFIG.cron && CONFIG.cron !== 'disabled') {
    log('info', `⏰ Scheduling bot with cron: ${CONFIG.cron}`)
    cron.schedule(CONFIG.cron, () => {
      runBot()
    })
  } else {
    log('warn', 'Cron scheduling disabled. Set CRON_SCHEDULE to enable periodic runs.')
  }

  // Graceful shutdown
  async function shutdown() {
    log('info', '🛑 Shutting down bot gracefully...')
    // No persistent browser here; runBot closes its own
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  // Run immediately on startup
  runBot()
}
