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
    await sleep(randomDelay(3000, 6000))

    // Wait for success indicator or dialog to close
    let postUrl = null
    try {
      await Promise.race([
        (async () => { await waitForAnySelector(page, selectors.successToast, 20000) })(),
        sleep(processingWaitMs),
      ])
    } catch {}

    await screenshotStep(page, '07-shared')

    // Try to discover a recent post URL visible in DOM
    try {
      const href = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll('a'))
        const postLink = anchors.find(a => a.href && a.href.includes('/p/'))
        return postLink ? postLink.href : null
      })
      if (href) postUrl = href
    } catch {}

    // 7) Cleanup and finish
    try {
      if (localPath && fs.existsSync(localPath)) fs.unlinkSync(localPath)
    } catch {}

    await sleep(randomDelay(2000, 5000))

    log('info', 'Post flow completed', { postUrl: postUrl || 'unknown' })
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

