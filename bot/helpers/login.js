import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function random(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

async function typeWithDelays(page, selector, text) {
  try {
    await page.focus(selector)
    await page.evaluate((sel) => {
      const el = document.querySelector(sel)
      if (el) el.value = ''
    }, selector)

    for (const char of text) {
      await page.type(selector, char, { delay: random(50, 150) })
      if (Math.random() < 0.15) {
        await sleep(random(100, 350))
      }
    }
  } catch (error) {
    try {
      await page.evaluate((sel, value) => {
        const el = document.querySelector(sel)
        if (el) {
          el.value = value
          el.dispatchEvent(new Event('input', { bubbles: true }))
          el.dispatchEvent(new Event('change', { bubbles: true }))
        }
      }, selector, text)
    } catch (fallbackError) {
      throw new Error(`Failed to type into ${selector}: ${error.message}`)
    }
  }
}

async function randomMouseMovements(page) {
  try {
    const viewport = await page.viewport()
    const width = viewport?.width || 1920
    const height = viewport?.height || 1080
    const moves = random(5, 12)
    for (let i = 0; i < moves; i++) {
      const x = random(10, width - 10)
      const y = random(80, height - 10)
      await page.mouse.move(x, y, { steps: random(5, 15) })
      await sleep(random(50, 200))
    }
  } catch (error) {
    console.warn('randomMouseMovements warning:', error.message)
  }
}

async function elementExists(page, selector, timeout = 3000) {
  try {
    await page.waitForSelector(selector, { timeout })
    return true
  } catch {
    return false
  }
}

async function clickByText(page, text) {
  try {
    const candidates = [
      `//button[normalize-space(text())='${text}']`,
      `//div[normalize-space(text())='${text}']`,
      `//span[normalize-space(text())='${text}']`,
    ]

    if (typeof page.$x === 'function') {
      for (const xpath of candidates) {
        try {
          const elements = await page.$x(xpath)
          if (elements && elements.length > 0) {
            await elements[0].click()
            return true
          }
        } catch (e) {
          continue
        }
      }
    }

    const clicked = await page.evaluate((searchText) => {
      const buttons = Array.from(document.querySelectorAll('button, div[role="button"], span'))
      const element = buttons.find((el) => {
        const text = el.textContent?.trim()
        return text === searchText || text?.includes(searchText)
      })
      if (element) {
        element.click()
        return true
      }
      return false
    }, text)

    return clicked
  } catch (error) {
    console.warn('clickByText warning:', error.message)
    return false
  }
}

async function clickLoginButton(page) {
  const selectors = [
    'button[type="submit"]',
    'button._acan._acap._acas._acav',
    'button:has-text("Log in")',
    'div[role="button"][tabindex="0"]'
  ]

  for (const selector of selectors) {
    try {
      await page.waitForSelector(selector, { timeout: 5000 })
      const btn = await page.$(selector)
      if (btn) {
        await btn.click()
        return true
      }
    } catch (e) {
      continue
    }
  }

  const clicked = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('button, div[role="button"], span'))
    const el = nodes.find((node) => {
      const text = node.textContent?.trim().toLowerCase()
      return text === 'log in' || text === 'log in to instagram' || text === 'login'
    })
    if (el) {
      el.click()
      return true
    }
    return false
  })

  return clicked
}

async function isLoggedIn(page) {
  // Heuristics: presence of home icon or profile nav
  if (await elementExists(page, 'svg[aria-label="Home"]', 5000)) return true
  if (await elementExists(page, 'a[href="/accounts/edit/"]', 2000)) return true
  return false
}

async function saveCookiesForAccount(instagramUsername, cookies) {
  try {
    await supabase
      .from('accounts')
      .update({ cookies })
      .eq('instagram_username', instagramUsername.toLowerCase())
  } catch (e) {
    // Non-fatal
  }
}

async function loadCookies(page, cookies) {
  try {
    // Clean domain cookies to match current domain
    for (const c of cookies) {
      // Puppeteer expects sameSite as 'Lax'|'Strict'|'None'
      const cookie = { ...c }
      delete cookie.expires // puppeteer uses 'expires' but it's okay to omit
      await page.setCookie(cookie)
    }
  } catch (e) {
    // ignore
  }
}

export async function loginToInstagram(page, username, password, savedCookies) {
  const screenshotsDir = path.join(__dirname, '..', 'screenshots')
  if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true })

  try {
    const viewport = await page.viewport()
    if (!viewport?.width || !viewport?.height) {
      await page.setViewport({ width: 1920, height: 1080 })
    }

    // 1) Try cookies if provided
    if (Array.isArray(savedCookies) && savedCookies.length > 0) {
      await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle2', timeout: 60000 })
      await loadCookies(page, savedCookies)
      await page.reload({ waitUntil: 'networkidle2' })
      await randomMouseMovements(page)

      if (await isLoggedIn(page)) {
        return { success: true, usedCookies: true }
      }
    }

    // 2) Full login flow
    try {
      await page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'domcontentloaded', timeout: 60000 })
    } catch (error) {
      await page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'networkidle0', timeout: 60000 })
    }

    await page.waitForFunction(() => document.readyState === 'complete', { timeout: 30000 })
    await sleep(random(3000, 6000))
    await randomMouseMovements(page)

    const usernameSelectors = [
      'input[name="username"]',
      'input[type="text"][aria-label*="username" i]',
      'input[type="text"][placeholder*="username" i]',
      'input[autocomplete="username"]',
      'input[type="text"]'
    ]

    let usernameSelector = null
    for (const selector of usernameSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 5000 })
        const el = await page.$(selector)
        if (el) {
          usernameSelector = selector
          break
        }
      } catch (e) {
        continue
      }
    }

    if (!usernameSelector) {
      throw new Error('Could not find username input field on Instagram login page.')
    }

    const passwordSelectors = [
      'input[name="password"]',
      'input[type="password"]',
      'input[aria-label*="password" i]',
      'input[autocomplete="current-password"]'
    ]

    let passwordSelector = null
    for (const selector of passwordSelectors) {
      try {
        const el = await page.$(selector)
        if (el) {
          passwordSelector = selector
          break
        }
      } catch (e) {
        continue
      }
    }

    if (!passwordSelector) {
      throw new Error('Could not find password input field on Instagram login page.')
    }

    await typeWithDelays(page, usernameSelector, username)
    await sleep(random(200, 600))
    await typeWithDelays(page, passwordSelector, password)

    const clicked = await clickLoginButton(page)
    if (!clicked) {
      throw new Error('Could not find login button on the Instagram page.')
    }

    // Wait for potential navigation or errors
    // Either logged in indicators, 2FA prompt, or error alert
    const loginOutcome = await Promise.race([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).then(() => 'navigated'),
      page.waitForSelector('div[role="dialog"]', { timeout: 60000 }).then(() => 'dialog'),
      page.waitForSelector('#slfErrorAlert', { timeout: 60000 }).then(() => 'error'),
    ]).catch(() => 'timeout')

    // Check for 2FA dialog (rudimentary)
    if (await elementExists(page, 'input[name="verificationCode"]', 2000) || await elementExists(page, 'input[name="verification_code"]', 2000)) {
      throw new Error('Two-factor authentication required. Manual intervention needed.')
    }

    // Handle post-login modals: Save login info?
    await sleep(1000)
    const notNowClicked = await clickByText(page, 'Not Now')
    if (notNowClicked) {
      await sleep(1000)
    }

    // Turn on notifications?
    const notifNotNow = await clickByText(page, 'Not Now')
    if (notifNotNow) {
      await sleep(1000)
    }

    // Ensure homepage is loaded
    await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle2', timeout: 60000 })

    if (!(await isLoggedIn(page))) {
      // Check for explicit error
      const errText = await page.evaluate(() => {
        const el = document.querySelector('#slfErrorAlert')
        return el ? el.textContent : null
      })
      throw new Error(errText || 'Login failed: could not verify successful login')
    }

    // Save cookies to DB
    const cookies = await page.cookies()
    await saveCookiesForAccount(username, cookies)

    // Clear sensitive variables from memory
    try { username = null } catch {}
    try { password = null } catch {}
    return { success: true, usedCookies: false }
  } catch (error) {
    // Screenshot on failure
    try {
      const filename = `login-error-${new Date().toISOString().replace(/[:.]/g, '-')}.png`
      await page.screenshot({ path: path.join(screenshotsDir, filename), fullPage: true })
    } catch {}

    // Advise wait before retry
    return {
      success: false,
      error: error.message || 'Unknown login error',
      retryAfterMs: 10 * 60 * 1000,
    }
  }
}

