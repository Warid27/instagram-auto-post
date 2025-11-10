import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { downloadImage, randomDelay, sleep, log } from './utils.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const SCREENSHOTS_DIR = path.join(__dirname, '..', 'screenshots')
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true })

// Default selectors (configurable via options)
const DEFAULT_SELECTORS = {
  createButton: [
    'svg[aria-label="New post"]',
    'svg[aria-label="Create"]',
    '[data-testid="new-post-button"]',
  ],
  fileInput: [
    'input[type="file"]',
    'form input[type="file"]',
    'input[type="file"][accept*="image"]',
    'input[type="file"][accept*="video"]',
    'input[type="file"][multiple]'
  ],
  nextButton: [
    'button._acan._acap._acas',
    'div[role="dialog"] button._acan._acap._acas',
    'button[type="button"][aria-label*="Next"]',
  ],
  captionTextarea: [
    'textarea[aria-label*="Write a caption" i]',
    'textarea[placeholder*="Write a caption" i]',
    'div[role="dialog"] textarea',
    'div[role="textbox"]',
    '[contenteditable="true"]',
    'textarea',
  ],
  shareButton: [
    'button._acan._acap._acat',
    'div[role="dialog"] button._acan._acap._acat',
    'button[type="button"][aria-label*="Share"]',
  ],
  successToast: [
    'div[role="alert"]:has-text("shared")',
    'div[role="status"]:has-text("shared")',
  ],
}

async function screenshotStep(page, name) {
  try {
    const filename = `post-${new Date().toISOString().replace(/[:.]/g, '-')}-${name}.png`
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, filename), fullPage: true })
  } catch {}
}

async function queryAny(page, selectors) {
  for (const sel of selectors) {
    const el = await page.$(sel)
    if (el) return el
  }
  return null
}

function xpathLiteral(str) {
  if (!str.includes('"')) return `"${str}"`
  if (!str.includes("'")) return `'${str}'`
  const parts = str.split('"')
  const concatParts = parts.map(part => `"${part}"`).join(', "\"", ')
  return `concat(${concatParts})`
}

async function findElementByText(page, texts = []) {
  const textArray = Array.isArray(texts) ? texts : [texts]
  const tags = ['button', 'div[@role="button"]', 'span', 'a']
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const lower = 'abcdefghijklmnopqrstuvwxyz'

  for (const rawText of textArray) {
    if (!rawText) continue
    const target = rawText.trim()
    if (!target) continue
    const literal = xpathLiteral(target.toLowerCase())

    for (const tag of tags) {
      const xpath = `//${tag}[contains(translate(normalize-space(.), '${upper}', '${lower}'), ${literal})]`
      try {
        const handles = await page.$x(xpath)
        if (handles && handles.length > 0) {
          return handles[0]
        }
      } catch (e) {
        continue
      }
    }
  }
  return null
}

async function waitForElementBySelectorsOrText(page, selectors = [], texts = [], timeout = 20000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const el = selectors.length > 0 ? await queryAny(page, selectors) : null
    if (el) return el

    if (texts && texts.length > 0) {
      const textEl = await findElementByText(page, texts)
      if (textEl) return textEl
    }

    await sleep(200)
  }
  throw new Error(`Timeout waiting for selectors/text: ${[...selectors, ...(texts || [])].join(' | ')}`)
}

async function clickElementByText(page, texts = []) {
  const list = Array.isArray(texts) ? texts : [texts]
  for (const text of list) {
    const clicked = await page.evaluate((targetText) => {
      if (!targetText) return false
      const lowerTarget = targetText.toLowerCase()
      const elements = Array.from(document.querySelectorAll('button, div[role="button"], span, a'))
      const el = elements.find((node) => {
        const txt = node.textContent?.trim().toLowerCase()
        return txt === lowerTarget || txt?.includes(lowerTarget)
      })
      if (el) {
        el.click()
        return true
      }
      return false
    }, text)

    if (clicked) {
      await sleep(300)
      return true
    }
  }
  return false
}

async function waitForFileInput(page, selectors, timeout = 20000) {
  const start = Date.now()
  const selectButtonTexts = [
    'Select from computer',
    'Choose from computer',
    'Select files',
    'Upload from computer',
    'Select file',
  ]

  while (Date.now() - start < timeout) {
    const input = await queryAny(page, selectors)
    if (input) return input

    const clicked = await clickElementByText(page, selectButtonTexts)
    if (clicked) {
      await sleep(500)
      const inputAfter = await queryAny(page, selectors)
      if (inputAfter) return inputAfter
    }

    await sleep(200)
  }

  throw new Error(`Timeout waiting for file input selectors: ${selectors.join(' | ')}`)
}

async function waitForAnySelector(page, selectors, timeout = 30000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const handle = await queryAny(page, selectors)
    if (handle) return handle
    await sleep(200)
  }
  throw new Error(`Timeout waiting for selectors: ${selectors.join(' | ')}`)
}

async function clickWithRandomOffset(page, elementHandle) {
  const box = await elementHandle.boundingBox()
  if (!box) {
    await elementHandle.click()
    return
  }
  const offsetX = Math.floor(Math.random() * Math.max(1, Math.floor(box.width)))
  const offsetY = Math.floor(Math.random() * Math.max(1, Math.floor(box.height)))
  await page.mouse.click(box.x + offsetX, box.y + offsetY, { delay: randomDelay(10, 60) })
}

async function typeHumanLike(page, selector, text) {
  await page.focus(selector)
  for (const char of text) {
    await page.type(selector, char, { delay: randomDelay(50, 100) })
    if (Math.random() < 0.12) await sleep(randomDelay(120, 300))
  }
}

export async function postToInstagram(page, imageUrl, caption, options = {}) {
  const selectors = { ...DEFAULT_SELECTORS, ...(options.selectors || {}) }
  const navTimeout = options.navigationTimeoutMs || 60000
  const processingWaitMs = options.processingWaitMs || 10000

  // temp file path
  const uniqueName = `ig-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
  let localPath = ''

  try {
    log('info', 'Starting Instagram post flow')

    // 1) Download image
    log('info', 'Downloading image')
    localPath = await downloadImage(imageUrl, uniqueName)
    await screenshotStep(page, '01-downloaded')

    // 2) Ensure on instagram.com
    const url = page.url()
    if (!url.startsWith('https://www.instagram.com')) {
      log('info', 'Navigating to instagram.com')
      await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle2', timeout: navTimeout })
    }
    await sleep(randomDelay(800, 1600))
    await screenshotStep(page, '02-home')

    // 3) Click Create
    log('info', 'Opening Create dialog')
    const createBtn = await waitForAnySelector(page, selectors.createButton, 20000)
    await clickWithRandomOffset(page, createBtn)
    await sleep(randomDelay(1000, 3000))
    await screenshotStep(page, '03-create-clicked')

    // 4) Upload image
    let fileInput = null
    try {
      fileInput = await waitForFileInput(page, selectors.fileInput, 20000)
    } catch (err) {
      log('warn', 'Direct file input not found after create click, navigating to create/select page', { error: err.message })
      try {
        await page.goto('https://www.instagram.com/create/select/', { waitUntil: 'networkidle2', timeout: navTimeout })
        await sleep(randomDelay(1000, 2000))
        fileInput = await waitForFileInput(page, selectors.fileInput, 20000)
      } catch (navErr) {
        throw navErr
      }
    }
    await fileInput.uploadFile(localPath)
    log('info', 'Image uploaded to file input')

    // Wait for processing UI (crop dialog) – then click Next
    await sleep(randomDelay(5000, 10000))
    await screenshotStep(page, '04-after-upload')

    // Some UIs need Next twice (crop -> filters -> caption)
    for (let i = 0; i < 2; i++) {
      try {
        const nextBtn = await waitForElementBySelectorsOrText(page, selectors.nextButton, ['Next'], 15000)
        if (!nextBtn) break
        await clickWithRandomOffset(page, nextBtn)
        await sleep(randomDelay(2000, 4000))
        await screenshotStep(page, `05-next-${i + 1}`)
      } catch (err) {
        log('warn', 'Next button not found', { attempt: i + 1, error: err.message })
        break
      }
    }

    // 5) Add caption
    if (caption && caption.trim().length > 0) {
      log('info', 'Typing caption')
      // Ensure caption field exists (support multiple locales and widget types)
      const captionTexts = ['Write a caption', 'Tulis keterangan', 'Add a caption']
      const captionHandle = await waitForElementBySelectorsOrText(
        page,
        selectors.captionTextarea,
        captionTexts,
        20000
      )
      try { await captionHandle.click({ delay: randomDelay(50, 150) }) } catch {}
      // Type with keyboard to support contenteditable divs
      for (const ch of caption) {
        await page.keyboard.type(ch, { delay: randomDelay(50, 100) })
        if (Math.random() < 0.12) await sleep(randomDelay(120, 300))
      }
      await sleep(randomDelay(500, 1200))
      await screenshotStep(page, '06-caption')
    }

    // 6) Share
    log('info', 'Clicking Share')
    const shareBtn = await waitForElementBySelectorsOrText(page, selectors.shareButton, ['Share'], 20000)
    await clickWithRandomOffset(page, shareBtn)
    
    // Wait longer for post to actually process
    await sleep(randomDelay(5000, 8000))

    // Check for error messages first
    let hasError = false
    try {
      const errorIndicators = await page.evaluate(() => {
        const errorTexts = ['error', 'failed', 'try again', 'something went wrong', 'couldn\'t share']
        const allText = document.body.innerText.toLowerCase()
        return errorTexts.some(text => allText.includes(text))
      })
      if (errorIndicators) {
        log('warn', 'Error indicators found after sharing')
        hasError = true
      }
    } catch {}

    // Wait for success indicator or dialog to close
    let successConfirmed = false
    let postUrl = null
    
    try {
      // Wait for success toast or navigation away from create page
      await Promise.race([
        (async () => {
          try {
            await waitForAnySelector(page, selectors.successToast, 15000)
            successConfirmed = true
          } catch {}
        })(),
        (async () => {
          // Check if we navigated away from create page (indicates success)
          await sleep(8000)
          const currentUrl = page.url()
          if (!currentUrl.includes('/create/')) {
            successConfirmed = true
          }
        })(),
        sleep(15000), // Max wait time
      ])
    } catch {}

    await screenshotStep(page, '07-shared')

    // Try to discover the post URL
    // Strategy: 
    // 1. Check if Instagram redirected us to the new post URL
    // 2. If not, navigate to the user's profile and get the first post
    try {
      // First, check if we're already on a post URL (Instagram sometimes redirects after sharing)
      const currentUrl = page.url()
      if (currentUrl.includes('/p/')) {
        // Extract the post URL
        const match = currentUrl.match(/https?:\/\/www\.instagram\.com\/p\/[^\/]+/)
        if (match) {
          postUrl = match[0] + '/'
          log('info', 'Found post URL from redirect', { postUrl })
        }
      }
      
      // If we don't have a post URL yet, navigate to the user's profile
      if (!postUrl && options.username) {
        log('info', 'Navigating to user profile to find new post', { username: options.username })
        try {
          await page.goto(`https://www.instagram.com/${options.username}/`, { 
            waitUntil: 'networkidle2', 
            timeout: navTimeout 
          })
          await sleep(randomDelay(2000, 3000))
          
          // Get the first post from the profile grid (should be the newly created one)
          const profilePostUrl = await page.evaluate(() => {
            // Look for post links in the profile grid
            const postLinks = Array.from(document.querySelectorAll('a[href*="/p/"]'))
            // Filter to only get links that are actual post links (not in navigation, etc.)
            const gridPosts = postLinks.filter(link => {
              const href = link.getAttribute('href')
              // Profile grid posts are typically in article or div containers
              const parent = link.closest('article, div[role="button"]')
              return parent && href && href.startsWith('/p/')
            })
            
            if (gridPosts.length > 0) {
              const href = gridPosts[0].getAttribute('href')
              // Make sure it's a full URL
              if (href.startsWith('/')) {
                return 'https://www.instagram.com' + href
              }
              return href
            }
            return null
          })
          
          if (profilePostUrl) {
            postUrl = profilePostUrl
            log('info', 'Found post URL from profile', { postUrl })
          }
        } catch (profileErr) {
          log('warn', 'Failed to get post URL from profile', { error: profileErr.message })
        }
      }
      
      // Fallback: if we still don't have a URL, try the old method (but log a warning)
      if (!postUrl) {
        log('warn', 'Using fallback method to find post URL - may not be accurate')
        const href = await page.evaluate(() => {
          const anchors = Array.from(document.querySelectorAll('a[href*="/p/"]'))
          if (anchors.length > 0) {
            return anchors[0].href
          }
          return null
        })
        if (href) {
          postUrl = href
        }
      }
      
      // Verify the URL is valid
      if (postUrl && !postUrl.includes('/p/')) {
        log('warn', 'Invalid post URL format', { postUrl })
        postUrl = null
      }
    } catch (err) {
      log('warn', 'Error discovering post URL', { error: err.message })
    }

    // Additional verification: Try to navigate to the post URL to verify it exists
    let verified = false
    if (postUrl && !hasError) {
      try {
        log('info', 'Verifying post URL exists', { postUrl })
        // Try to navigate to the post URL - if it loads successfully, post exists
        const response = await page.goto(postUrl, { waitUntil: 'networkidle2', timeout: 20000 })
        await sleep(randomDelay(2000, 3000))
        
        // Check if page loaded successfully and is a valid post page
        const postCheck = await page.evaluate((expectedUsername) => {
          // Check for common post page indicators
          const hasPostContent = document.querySelector('article') || 
                                 document.querySelector('[role="main"]') ||
                                 document.body.innerText.includes('Like') ||
                                 document.body.innerText.includes('Comment')
          
          if (!hasPostContent || document.body.innerText.toLowerCase().includes('sorry, this page')) {
            return { isValid: false, username: null }
          }
          
          // Try to extract the username from the post page
          // The username is typically in a link in the post header
          let foundUsername = null
          
          // Look for username link in the post header/article
          const article = document.querySelector('article')
          if (article) {
            const headerLinks = article.querySelectorAll('header a[href^="/"]')
            for (const link of headerLinks) {
              const href = link.getAttribute('href')
              if (href) {
                const match = href.match(/^\/([^\/\?]+)/)
                if (match && match[1] && 
                    match[1] !== 'p' && 
                    match[1] !== 'accounts' && 
                    match[1] !== 'direct' && 
                    match[1] !== 'stories' &&
                    match[1] !== 'explore' &&
                    match[1] !== 'reels') {
                  foundUsername = match[1]
                  break
                }
              }
            }
          }
          
          // Fallback: look for any username link in the main content
          if (!foundUsername) {
            const usernameLinks = Array.from(document.querySelectorAll('a[href^="/"]'))
            for (const link of usernameLinks) {
              const href = link.getAttribute('href')
              if (href) {
                const match = href.match(/^\/([^\/\?]+)/)
                if (match && match[1] && 
                    match[1] !== 'p' && 
                    match[1] !== 'accounts' && 
                    match[1] !== 'direct' && 
                    match[1] !== 'stories' &&
                    match[1] !== 'explore' &&
                    match[1] !== 'reels' &&
                    !match[1].includes('.')) {
                  // Check if this looks like a username (not a path)
                  foundUsername = match[1]
                  break
                }
              }
            }
          }
          
          return { 
            isValid: true, 
            username: foundUsername,
            matchesExpected: expectedUsername ? foundUsername === expectedUsername : null
          }
        }, options.username || null)

        if (postCheck.isValid && response && response.status() < 400) {
          // If we have a username, verify it matches
          if (options.username && postCheck.username) {
            if (postCheck.matchesExpected) {
              verified = true
              log('info', 'Post URL verified - post exists and belongs to correct account', { 
                postUrl, 
                username: postCheck.username 
              })
            } else {
              log('warn', 'Post URL belongs to different account', { 
                postUrl, 
                expected: options.username, 
                found: postCheck.username 
              })
              // Don't verify if it's the wrong account
              verified = false
            }
          } else {
            // If we can't verify username, just check if post is valid
            verified = true
            log('info', 'Post URL verified - post exists', { postUrl })
          }
        } else {
          log('warn', 'Post URL verification failed - post may not exist', { postUrl, status: response?.status() })
        }
      } catch (verifyErr) {
        log('warn', 'Could not verify post URL', { error: verifyErr.message, postUrl })
        // Don't fail if verification fails - might be timing issue or network problem
      }
    }

    // 7) Cleanup and finish
    try {
      if (localPath && fs.existsSync(localPath)) fs.unlinkSync(localPath)
    } catch {}

    // Determine success based on multiple factors
    // Require: no errors AND (verified post OR (success confirmed AND postUrl found))
    // This ensures we don't report success just because we found a random post URL
    const actuallySucceeded = !hasError && (
      verified || // Post URL verified to exist
      (successConfirmed && postUrl) || // Success confirmed AND we have a post URL
      (successConfirmed && !postUrl) // Success confirmed even without URL (might be timing)
    )
    
    if (!actuallySucceeded) {
      log('warn', 'Post may not have succeeded - no clear confirmation', {
        hasError,
        successConfirmed,
        verified,
        postUrl: postUrl || 'none'
      })
      return {
        success: false,
        error: 'Post completion not confirmed - no success indicator or verified post URL found',
        retryAfterMs: 0,
      }
    }

    await sleep(randomDelay(2000, 5000))

    log('info', 'Post flow completed', { postUrl: postUrl || 'unknown', verified })
    return { success: true, url: postUrl || null }
  } catch (error) {
    log('error', 'Post flow failed', { error: error.message })
    await screenshotStep(page, 'error')

    try { if (localPath && fs.existsSync(localPath)) fs.unlinkSync(localPath) } catch {}

    return {
      success: false,
      error: error.message || 'Unknown error during posting',
      retryAfterMs: 0,
    }
  }
}

export default postToInstagram

