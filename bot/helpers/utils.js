/**
 * Utility functions for the bot
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// Supabase client (service role key for server-side bot)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Download image from URL to local file
 * @param {string} imageUrl - URL of the image to download
 * @param {string} filename - Name for the saved file
 * @returns {Promise<string>} - Path to the downloaded file
 */
export async function downloadImage(imageUrl, filename) {
  try {
    const response = await axios({
      url: imageUrl,
      method: 'GET',
      responseType: 'stream',
    });

    const downloadsDir = path.join(__dirname, '../downloads');
    if (!fs.existsSync(downloadsDir)) {
      fs.mkdirSync(downloadsDir, { recursive: true });
    }

    const filepath = path.join(downloadsDir, filename);
    const writer = fs.createWriteStream(filepath);

    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => resolve(filepath));
      writer.on('error', reject);
    });
  } catch (error) {
    throw new Error(`Failed to download image: ${error.message}`);
  }
}

/**
 * Generate random delay between min and max values
 * @param {number} min - Minimum delay in milliseconds
 * @param {number} max - Maximum delay in milliseconds
 * @returns {number} - Random delay value
 */
export function randomDelay(min = 2000, max = 5000) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Log message with timestamp
 * @param {string} level - Log level (info, warn, error)
 * @param {string} message - Log message
 * @param {object} data - Additional data to log
 */
export function log(level, message, data = {}) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  
  if (level === 'error') {
    console.error(logMessage, data);
  } else if (level === 'warn') {
    console.warn(logMessage, data);
  } else {
    console.log(logMessage, data);
  }
}

/**
 * Human-like typing into a Puppeteer element handle
 * @param {import('puppeteer').ElementHandle} element
 * @param {string} text
 */
export async function humanType(element, text) {
  if (!element || !text) return;
  for (const ch of text) {
    // occasional typo simulation (~5%)
    const doTypo = Math.random() < 0.05;
    if (doTypo) {
      const wrongChar = String.fromCharCode(97 + Math.floor(Math.random() * 26));
      await element.type(wrongChar, { delay: randomDelay(50, 150) });
      await element.type('\b', { delay: randomDelay(30, 90) });
    }

    await element.type(ch, { delay: randomDelay(50, 150) });

    // occasional longer pause
    if (Math.random() < 0.15) {
      await sleep(randomDelay(300, 500));
    }
  }
}

/**
 * Random human-like mouse movement with a smooth-ish curve
 * @param {import('puppeteer').Page} page
 */
export async function randomMouseMove(page) {
  try {
    const vp = page.viewport();
    const width = vp?.width || 1280;
    const height = vp?.height || 800;

    const startX = Math.floor(Math.random() * width * 0.8) + 10;
    const startY = Math.floor(Math.random() * height * 0.8) + 90;
    const endX = Math.floor(Math.random() * width * 0.8) + 10;
    const endY = Math.floor(Math.random() * height * 0.8) + 90;

    // control point to create a simple quadratic curve
    const ctrlX = Math.floor((startX + endX) / 2) + Math.floor((Math.random() - 0.5) * 200);
    const ctrlY = Math.floor((startY + endY) / 2) + Math.floor((Math.random() - 0.5) * 200);

    const steps = Math.floor(Math.random() * 20) + 20;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = (1 - t) * (1 - t) * startX + 2 * (1 - t) * t * ctrlX + t * t * endX;
      const y = (1 - t) * (1 - t) * startY + 2 * (1 - t) * t * ctrlY + t * t * endY;
      await page.mouse.move(x, y, { steps: 1 });
      await sleep(randomDelay(5, 20));
    }
  } catch {}
}

/**
 * Check daily post limit for an account (default 25/day). Resets if day changed.
 * @param {string|number} accountId
 * @returns {Promise<boolean>} - true if allowed to post
 */
export async function checkDailyLimit(accountId) {
  try {
    const { data: account, error } = await supabase
      .from('accounts')
      .select('id, posts_today, last_post_at')
      .eq('id', accountId)
      .single();

    if (error) throw error;
    const postsToday = account?.posts_today || 0;
    const lastPostAt = account?.last_post_at ? new Date(account.last_post_at) : null;

    const now = new Date();
    let currentCount = postsToday;

    // Reset if last post not same UTC date
    const isSameDay = lastPostAt && lastPostAt.toISOString().slice(0, 10) === now.toISOString().slice(0, 10);
    if (!isSameDay && postsToday > 0) {
      await supabase
        .from('accounts')
        .update({ posts_today: 0 })
        .eq('id', accountId);
      currentCount = 0;
    }

    return currentCount < 25;
  } catch (e) {
    log('warn', 'checkDailyLimit failed, defaulting to allow', { error: e.message, accountId });
    return true;
  }
}

/**
 * Update post status for a given post/account and increment account counter on success
 * @param {string} postId
 * @param {string} accountId
 * @param {'pending'|'processing'|'completed'|'failed'} status
 * @param {{ error_message?: string, instagram_post_url?: string }} data
 */
export async function updatePostStatus(postId, accountId, status, data = {}) {
  try {
    const update = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (status === 'completed') {
      update.posted_at = new Date().toISOString();
      if (data.instagram_post_url) update.instagram_post_url = data.instagram_post_url;
      update.error_message = null;
    } else if (status === 'failed') {
      update.error_message = data.error_message || 'Unknown error';
    }

    await supabase
      .from('post_accounts')
      .update(update)
      .eq('post_id', postId)
      .eq('account_id', accountId);

    if (status === 'completed') {
      // Increment posts_today and set last_post_at
      const { data: accRow } = await supabase
        .from('accounts')
        .select('posts_today')
        .eq('id', accountId)
        .single();
      const current = accRow?.posts_today || 0;
      await supabase
        .from('accounts')
        .update({ posts_today: current + 1, last_post_at: new Date().toISOString() })
        .eq('id', accountId);
    }
  } catch (e) {
    log('warn', 'updatePostStatus failed', { error: e.message, postId, accountId, status });
  }
}

/**
 * Puppeteer browser launch configuration
 */
export function getBrowserConfig() {
  const headless = (process.env.HEADLESS || 'true') === 'true';
  return {
    headless,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    defaultViewport: { width: 1920, height: 1080 },
  };
}

/**
 * Save cookies for an account
 * @param {string} accountId
 * @param {Array<object>} cookies
 */
export async function saveCookies(accountId, cookies) {
  try {
    // Optional: compute min expiry across cookies if present
    let minExpiry = null;
    for (const c of cookies || []) {
      if (typeof c.expires === 'number' && c.expires > 0) {
        const expMs = c.expires * 1000;
        if (!minExpiry || expMs < minExpiry) minExpiry = expMs;
      }
    }
    const cookiesExpiresAt = minExpiry ? new Date(minExpiry).toISOString() : null;

    await supabase
      .from('accounts')
      .update({ cookies, cookies_expires_at: cookiesExpiresAt })
      .eq('id', accountId);
  } catch (e) {
    log('warn', 'saveCookies failed', { error: e.message, accountId });
  }
}

/**
 * Load cookies for an account if not expired
 * @param {string} accountId
 * @returns {Promise<Array<object>|null>}
 */
export async function loadCookies(accountId) {
  try {
    const { data: acc, error } = await supabase
      .from('accounts')
      .select('cookies, cookies_expires_at')
      .eq('id', accountId)
      .single();
    if (error) throw error;
    if (!acc?.cookies) return null;

    if (acc.cookies_expires_at) {
      const exp = new Date(acc.cookies_expires_at);
      if (Date.now() > exp.getTime()) return null;
    }
    return acc.cookies;
  } catch (e) {
    log('warn', 'loadCookies failed', { error: e.message, accountId });
    return null;
  }
}

/**
 * Take a timestamped screenshot to screenshots/ folder
 * @param {import('puppeteer').Page} page
 * @param {string} filename Base filename without timestamp
 */
export async function takeScreenshot(page, filename) {
  try {
    const dir = path.join(__dirname, '..', 'screenshots');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const safe = filename.replace(/[^a-z0-9_-]/gi, '_');
    const full = path.join(dir, `${ts}-${safe}.png`);
    await page.screenshot({ path: full, fullPage: true });
    return full;
  } catch (e) {
    log('warn', 'takeScreenshot failed', { error: e.message });
    return null;
  }
}

