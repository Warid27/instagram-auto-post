import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Configure puppeteer with stealth plugin
puppeteer.use(StealthPlugin());

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function random(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function typeWithDelays(page, selector, text) {
  try {
    await page.focus(selector);
    // Clear any existing text first
    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (el) el.value = '';
    }, selector);
    
    for (const char of text) {
      await page.type(selector, char, { delay: random(50, 150) });
      if (Math.random() < 0.15) {
        await sleep(random(100, 350));
      }
    }
  } catch (error) {
    // Fallback: use evaluate to set value directly
    try {
      await page.evaluate((sel, txt) => {
        const el = document.querySelector(sel);
        if (el) {
          el.value = txt;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, selector, text);
    } catch (fallbackError) {
      throw new Error(`Failed to type into ${selector}: ${error.message}`);
    }
  }
}

async function randomMouseMovements(page) {
  try {
    const viewport = await page.viewport();
    const width = viewport?.width || 1920;
    const height = viewport?.height || 1080;
    const moves = random(5, 12);
    for (let i = 0; i < moves; i++) {
      const x = random(10, width - 10);
      const y = random(80, height - 10);
      await page.mouse.move(x, y, { steps: random(5, 15) });
      await sleep(random(50, 200));
    }
  } catch (error) {
    // Ignore mouse movement errors - not critical
    console.warn('Mouse movement error (non-fatal):', error.message);
  }
}

async function elementExists(page, selector, timeout = 3000) {
  try {
    await page.waitForSelector(selector, { timeout });
    return true;
  } catch {
    return false;
  }
}

async function clickByText(page, text) {
  try {
    // Try XPath first (if available)
    const candidates = [
      `//button[normalize-space(text())='${text}']`,
      `//div[normalize-space(text())='${text}']`,
      `//span[normalize-space(text())='${text}']`,
    ];
    
    // Check if $x is available
    if (typeof page.$x === 'function') {
      for (const xpath of candidates) {
        try {
          const elements = await page.$x(xpath);
          if (elements && elements.length > 0) {
            await elements[0].click();
            return true;
          }
        } catch (e) {
          continue;
        }
      }
    }
    
    // Fallback: Use evaluate to find and click element by text
    const clicked = await page.evaluate((searchText) => {
      const buttons = Array.from(document.querySelectorAll('button, div, span'));
      const element = buttons.find(el => {
        const text = el.textContent?.trim();
        return text === searchText || text?.includes(searchText);
      });
      
      if (element) {
        element.click();
        return true;
      }
      return false;
    }, text);
    
    return clicked;
  } catch (error) {
    console.warn('clickByText error (non-fatal):', error.message);
    return false;
  }
}

async function clickLoginButton(page) {
  const loginButtonSelectors = [
    'button[type="submit"]',
    'button._acan._acap._acas._acav',
    'div[role="button"][tabindex="0"]'
  ];

  for (const selector of loginButtonSelectors) {
    try {
      await page.waitForSelector(selector, { timeout: 5000 });
      const button = await page.$(selector);
      if (button) {
        await button.click();
        return true;
      }
    } catch (error) {
      continue;
    }
  }

  // Fallback: look for element containing "Log in" text
  const clicked = await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll('button, div[role="button"], span'));
    const element = candidates.find((el) => {
      const text = el.textContent?.trim().toLowerCase();
      return text === 'log in' || text === 'log in to instagram' || text === 'log in with instagram';
    });
    if (element) {
      element.click();
      return true;
    }
    return false;
  });

  return clicked;
}

async function isLoggedIn(page) {
  if (await elementExists(page, 'svg[aria-label="Home"]', 5000)) return true;
  if (await elementExists(page, 'a[href="/accounts/edit/"]', 2000)) return true;
  return false;
}

async function loadCookies(page, cookies) {
  try {
    for (const c of cookies) {
      const cookie = { ...c };
      delete cookie.expires;
      await page.setCookie(cookie);
    }
  } catch (e) {
    // ignore
  }
}

/**
 * Login to Instagram and save cookies for an account
 * @param {string} accountId - Account ID in database
 * @param {string} username - Instagram username
 * @param {string} password - Instagram password
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function loginAccount(accountId, username, password) {
  let browser = null;
  
  try {
    // Launch browser
    browser = await puppeteer.launch({
      headless: process.env.HEADLESS !== 'false',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
      ],
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(60000);
    // Set viewport to ensure it's available
    await page.setViewport({ width: 1920, height: 1080 });

    // Try existing cookies first
    const { data: account } = await supabase
      .from('accounts')
      .select('cookies')
      .eq('id', accountId)
      .single();

    if (account?.cookies && Array.isArray(account.cookies) && account.cookies.length > 0) {
      await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle2', timeout: 60000 });
      await loadCookies(page, account.cookies);
      await page.reload({ waitUntil: 'networkidle2' });
      await randomMouseMovements(page);

      if (await isLoggedIn(page)) {
        // Refresh cookies
        const cookies = await page.cookies();
        await saveCookies(accountId, cookies);
        await browser.close();
        return { success: true, usedCookies: true };
      }
    }

    // Full login flow
    try {
      await page.goto('https://www.instagram.com/accounts/login/', { 
        waitUntil: 'domcontentloaded', 
        timeout: 60000 
      });
    } catch (error) {
      // If navigation fails, try with networkidle0
      await page.goto('https://www.instagram.com/accounts/login/', { 
        waitUntil: 'networkidle0', 
        timeout: 60000 
      });
    }

    // Wait for page to be fully interactive
    await page.waitForFunction(() => document.readyState === 'complete', { timeout: 30000 });
    await sleep(random(3000, 6000));
    await randomMouseMovements(page);

    // Try multiple selectors for username field (Instagram sometimes changes their structure)
    const usernameSelectors = [
      'input[name="username"]',
      'input[type="text"][aria-label*="username" i]',
      'input[type="text"][placeholder*="username" i]',
      'input[autocomplete="username"]',
      'input[type="text"]'
    ];

    let usernameSelector = null;
    for (const selector of usernameSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 5000 });
        const field = await page.$(selector);
        if (field) {
          usernameSelector = selector;
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!usernameSelector) {
      // Take screenshot for debugging
      try {
        const screenshot = await page.screenshot({ encoding: 'base64' });
        console.error('Login page screenshot (base64):', screenshot.substring(0, 100));
      } catch {}
      
      // Check if we're on a challenge/blocked page
      const pageContent = await page.content();
      if (pageContent.includes('challenge') || pageContent.includes('blocked') || pageContent.includes('suspended')) {
        throw new Error('Instagram account may be blocked or require verification. Please check manually.');
      }
      
      throw new Error('Could not find username input field. Instagram page structure may have changed.');
    }

    // Find password field
    const passwordSelectors = [
      'input[name="password"]',
      'input[type="password"]',
      'input[aria-label*="password" i]',
      'input[autocomplete="current-password"]'
    ];

    let passwordSelector = null;
    for (const selector of passwordSelectors) {
      try {
        const field = await page.$(selector);
        if (field) {
          passwordSelector = selector;
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!passwordSelector) {
      throw new Error('Could not find password input field.');
    }

    // Type credentials
    await typeWithDelays(page, usernameSelector, username);
    await sleep(random(200, 600));
    await typeWithDelays(page, passwordSelector, password);

    const clickedLogin = await clickLoginButton(page);
    if (!clickedLogin) {
      throw new Error('Could not find login button on the page.');
    }

    await Promise.race([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).then(() => 'navigated'),
      page.waitForSelector('div[role="dialog"]', { timeout: 60000 }).then(() => 'dialog'),
      page.waitForSelector('#slfErrorAlert', { timeout: 60000 }).then(() => 'error'),
    ]).catch(() => 'timeout');

    // Check for 2FA
    if (await elementExists(page, 'input[name="verificationCode"]', 2000) || 
        await elementExists(page, 'input[name="verification_code"]', 2000)) {
      throw new Error('Two-factor authentication required. Manual intervention needed.');
    }

    // Handle modals
    await sleep(1000);
    await clickByText(page, 'Not Now');
    await sleep(1000);
    await clickByText(page, 'Not Now');

    await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle2', timeout: 60000 });

    if (!(await isLoggedIn(page))) {
      const errText = await page.evaluate(() => {
        const el = document.querySelector('#slfErrorAlert');
        return el ? el.textContent : null;
      });
      throw new Error(errText || 'Login failed: could not verify successful login');
    }

    // Save cookies
    const cookies = await page.cookies();
    console.log(`[login] Saving ${cookies.length} cookies for account ${accountId}`);
    await saveCookies(accountId, cookies);
    console.log(`[login] Cookies saved successfully for account ${accountId}`);

    await browser.close();
    return { success: true, usedCookies: false };
  } catch (error) {
    if (browser) {
      try {
        await browser.close();
      } catch {}
    }
    console.error('Instagram login error:', error);
    return { success: false, error: error.message || 'Unknown login error' };
  }
}

async function saveCookies(accountId, cookies) {
  try {
    const { data, error } = await supabase
      .from('accounts')
      .update({ cookies })
      .eq('id', accountId)
      .select('id, instagram_username');

    if (error) {
      console.error('Failed to save cookies to database:', error);
      throw error;
    }

    const accountName = data?.[0]?.instagram_username || accountId;
    console.log(`[saveCookies] Successfully saved cookies for account ${accountName}, count=${cookies?.length || 0}`);
  } catch (e) {
    console.error('Failed to save cookies:', e);
    throw e;
  }
}

