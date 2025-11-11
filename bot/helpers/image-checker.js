/**
 * Image similarity checking utilities
 */

import sharp from 'sharp'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'
import axios from 'axios'
import { log } from './utils.js'

/**
 * Download image from URL to buffer
 * @param {string} imageUrl - URL of the image
 * @returns {Promise<Buffer>} - Image buffer
 */
async function downloadImageBuffer(imageUrl) {
  try {
    const response = await axios({
      url: imageUrl,
      method: 'GET',
      responseType: 'arraybuffer',
      timeout: 30000,
    })
    return Buffer.from(response.data)
  } catch (error) {
    throw new Error(`Failed to download image: ${error.message}`)
  }
}

/**
 * Extract image URL from Instagram post page
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @param {string} postUrl - Instagram post URL
 * @returns {Promise<string|null>} - Image URL or null if not found
 */
export async function extractImageFromPost(page, postUrl) {
  try {
    log('info', 'Extracting image from Instagram post', { postUrl })
    
    // Navigate to post
    await page.goto(postUrl, { waitUntil: 'networkidle2', timeout: 30000 })
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    // Try multiple strategies to find the image
    const imageUrl = await page.evaluate(() => {
      // Strategy 1: Look for img tag with src containing cdninstagram
      const images = Array.from(document.querySelectorAll('img'))
      for (const img of images) {
        const src = img.getAttribute('src') || img.getAttribute('srcset')
        if (src && (src.includes('cdninstagram.com') || src.includes('scontent'))) {
          // Get the highest resolution version
          if (src.includes(',')) {
            const sources = src.split(',').map(s => s.trim())
            // Find the largest resolution (usually last one)
            const largest = sources[sources.length - 1].split(' ')[0]
            return largest
          }
          return src
        }
      }
      
      // Strategy 2: Look for meta tags (og:image)
      const metaImage = document.querySelector('meta[property="og:image"]')
      if (metaImage) {
        const content = metaImage.getAttribute('content')
        if (content) return content
      }
      
      // Strategy 3: Look for article img
      const article = document.querySelector('article')
      if (article) {
        const articleImg = article.querySelector('img')
        if (articleImg) {
          const src = articleImg.getAttribute('src') || articleImg.getAttribute('srcset')
          if (src) {
            if (src.includes(',')) {
              const sources = src.split(',').map(s => s.trim())
              return sources[sources.length - 1].split(' ')[0]
            }
            return src
          }
        }
      }
      
      return null
    })
    
    if (!imageUrl) {
      log('warn', 'Could not extract image URL from post', { postUrl })
      return null
    }
    
    log('info', 'Extracted image URL from post', { postUrl, imageUrl })
    return imageUrl
  } catch (error) {
    log('error', 'Failed to extract image from post', { error: error.message, postUrl })
    throw error
  }
}

/**
 * Normalize images to same size and format for comparison
 * @param {Buffer} imageBuffer1 - First image buffer
 * @param {Buffer} imageBuffer2 - Second image buffer
 * @param {number} width - Target width (default: 800)
 * @param {number} height - Target height (default: 800)
 * @returns {Promise<{image1: Buffer, image2: Buffer, width: number, height: number}>}
 */
async function normalizeImages(imageBuffer1, imageBuffer2, width = 800, height = 800) {
  try {
    // Resize both images to same dimensions
    const normalized1 = await sharp(imageBuffer1)
      .resize(width, height, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png()
      .toBuffer()
    
    const normalized2 = await sharp(imageBuffer2)
      .resize(width, height, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png()
      .toBuffer()
    
    return {
      image1: normalized1,
      image2: normalized2,
      width,
      height,
    }
  } catch (error) {
    throw new Error(`Failed to normalize images: ${error.message}`)
  }
}

/**
 * Calculate image similarity using pixel comparison
 * @param {Buffer} imageBuffer1 - First image buffer
 * @param {Buffer} imageBuffer2 - Second image buffer
 * @returns {Promise<number>} - Similarity score (0.0 to 1.0, where 1.0 is identical)
 */
export async function calculateImageSimilarity(imageBuffer1, imageBuffer2) {
  try {
    log('info', 'Calculating image similarity')
    
    // Normalize images to same size
    const { image1, image2, width, height } = await normalizeImages(imageBuffer1, imageBuffer2)
    
    // Parse PNG images
    const img1 = PNG.sync.read(image1)
    const img2 = PNG.sync.read(image2)
    
    // Create diff image
    const diff = new PNG({ width, height })
    
    // Compare pixels
    const numDiffPixels = pixelmatch(
      img1.data,
      img2.data,
      diff.data,
      width,
      height,
      {
        threshold: 0.1, // Sensitivity (0.0 to 1.0)
        includeAA: false, // Don't count anti-aliasing as differences
      }
    )
    
    // Calculate similarity score
    const totalPixels = width * height
    const similarity = 1 - (numDiffPixels / totalPixels)
    
    log('info', 'Image similarity calculated', {
      similarity: similarity.toFixed(4),
      diffPixels: numDiffPixels,
      totalPixels,
    })
    
    return Math.max(0, Math.min(1, similarity)) // Clamp between 0 and 1
  } catch (error) {
    log('error', 'Failed to calculate image similarity', { error: error.message })
    throw error
  }
}

/**
 * Compare original image with posted image
 * @param {string} originalImageUrl - URL of original image (Cloudinary)
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @param {string} postUrl - Instagram post URL
 * @returns {Promise<{similarity: number, success: boolean, error?: string}>}
 */
export async function compareImages(originalImageUrl, page, postUrl) {
  let originalBuffer = null
  let postedImageUrl = null
  
  try {
    log('info', 'Starting image comparison', { originalImageUrl, postUrl })
    
    // Download original image
    log('info', 'Downloading original image')
    originalBuffer = await downloadImageBuffer(originalImageUrl)
    
    // Extract posted image URL from Instagram
    log('info', 'Extracting posted image from Instagram')
    postedImageUrl = await extractImageFromPost(page, postUrl)
    
    if (!postedImageUrl) {
      throw new Error('Could not extract image from Instagram post')
    }
    
    // Download posted image
    log('info', 'Downloading posted image', { postedImageUrl })
    const postedBuffer = await downloadImageBuffer(postedImageUrl)
    
    // Calculate similarity
    log('info', 'Calculating similarity')
    const similarity = await calculateImageSimilarity(originalBuffer, postedBuffer)
    
    log('info', 'Image comparison completed', {
      similarity: similarity.toFixed(4),
      originalImageUrl,
      postUrl,
    })
    
    return {
      success: true,
      similarity,
    }
  } catch (error) {
    log('error', 'Image comparison failed', {
      error: error.message,
      originalImageUrl,
      postUrl,
    })
    
    return {
      success: false,
      similarity: null,
      error: error.message,
    }
  }
}

