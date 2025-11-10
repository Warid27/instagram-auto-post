import { loginToInstagram } from './login.js'
import { decryptPassword } from '../utils/encryption.js'

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function random(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/**
 * Extract number from text (e.g., "1,234" -> 1234, "1.2K" -> 1200)
 */
function parseCount(text) {
  if (!text) return 0
  if (typeof text !== 'string' && typeof text !== 'number') return 0
  
  // If it's already a number, return it
  if (typeof text === 'number') return Math.floor(text)
  
  const cleaned = text.toString().trim().replace(/,/g, '')
  
  // Handle K, M suffixes
  const lower = cleaned.toLowerCase()
  if (lower.endsWith('k')) {
    const num = parseFloat(cleaned.slice(0, -1))
    return Math.floor(num * 1000)
  }
  if (lower.endsWith('m')) {
    const num = parseFloat(cleaned.slice(0, -1))
    return Math.floor(num * 1000000)
  }
  
  const parsed = parseFloat(cleaned)
  return isNaN(parsed) ? 0 : Math.floor(parsed)
}

/**
 * Get account stats from profile page
 * Returns: { postsCount, followersCount, followingCount }
 */
export async function getAccountStats(page, username) {
  try {
    // Navigate to profile
    await page.goto(`https://www.instagram.com/${username}/`, {
      waitUntil: 'networkidle2',
      timeout: 60000
    })
    
    await sleep(random(2000, 4000))
    
    // Extract stats from profile page
    const stats = await page.evaluate(() => {
      const stats = {
        postsCount: 0,
        followersCount: 0,
        followingCount: 0
      }
      
      // Find all stat elements - Instagram uses various selectors
      const statSelectors = [
        'header section ul li',
        'header section div[role="menubar"] li',
        'header section ul[role="menubar"] li'
      ]
      
      let statElements = []
      for (const selector of statSelectors) {
        statElements = Array.from(document.querySelectorAll(selector))
        if (statElements.length >= 3) break
      }
      
      if (statElements.length >= 3) {
        // Usually: Posts, Followers, Following
        const postsText = statElements[0]?.textContent || ''
        const followersText = statElements[1]?.textContent || ''
        const followingText = statElements[2]?.textContent || ''
        
        // Extract numbers
        const postsMatch = postsText.match(/[\d,KMkm]+/)
        const followersMatch = followersText.match(/[\d,KMkm]+/)
        const followingMatch = followingText.match(/[\d,KMkm]+/)
        
        if (postsMatch) {
          stats.postsCount = postsMatch[0]
        }
        if (followersMatch) {
          stats.followersCount = followersMatch[0]
        }
        if (followingMatch) {
          stats.followingCount = followingMatch[0]
        }
      }
      
      // Fallback: Try to find in meta tags or script tags
      if (stats.postsCount === 0) {
        const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
        for (const script of scripts) {
          try {
            const data = JSON.parse(script.textContent)
            if (data.interactionStatistic) {
              for (const stat of data.interactionStatistic) {
                if (stat.interactionType === 'https://schema.org/FollowAction') {
                  stats.followersCount = stat.userInteractionCount || 0
                }
              }
            }
          } catch (e) {
            // Ignore JSON parse errors
          }
        }
      }
      
      return stats
    })
    
    // Parse the counts
    return {
      postsCount: parseCount(stats.postsCount),
      followersCount: parseCount(stats.followersCount),
      followingCount: parseCount(stats.followingCount)
    }
  } catch (error) {
    throw new Error(`Failed to get account stats: ${error.message}`)
  }
}

/**
 * Get post URLs from profile (recent posts)
 * Returns: Array of post URLs
 */
export async function getPostUrls(page, username, limit = 12) {
  try {
    // Navigate to profile if not already there
    const currentUrl = page.url()
    if (!currentUrl.includes(`/${username}/`)) {
      await page.goto(`https://www.instagram.com/${username}/`, {
        waitUntil: 'networkidle2',
        timeout: 60000
      })
      await sleep(random(2000, 3000))
    }
    
    // Scroll to load more posts
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight)
    })
    await sleep(random(1000, 2000))
    
    // Extract post URLs
    const postUrls = await page.evaluate((maxPosts) => {
      const urls = []
      const postLinks = Array.from(document.querySelectorAll('a[href*="/p/"]'))
      
      for (const link of postLinks) {
        const href = link.getAttribute('href')
        if (href && href.startsWith('/p/')) {
          const fullUrl = href.startsWith('http') ? href : `https://www.instagram.com${href}`
          if (!urls.includes(fullUrl)) {
            urls.push(fullUrl)
          }
          if (urls.length >= maxPosts) break
        }
      }
      
      return urls
    }, limit)
    
    return postUrls
  } catch (error) {
    throw new Error(`Failed to get post URLs: ${error.message}`)
  }
}

/**
 * Get post stats (views, likes, comments) from a post page
 * Returns: { viewsCount, likesCount, commentsCount }
 */
export async function getPostStats(page, postUrl) {
  try {
    await page.goto(postUrl, {
      waitUntil: 'networkidle2',
      timeout: 60000
    })
    
    await sleep(random(2000, 3000))
    
    const stats = await page.evaluate(() => {
      const result = {
        viewsCount: 0,
        likesCount: 0,
        commentsCount: 0
      }
      
      // Try to get from JSON-LD or script tags first (most reliable)
      const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
      for (const script of scripts) {
        try {
          const data = JSON.parse(script.textContent)
          if (data.interactionStatistic) {
            for (const stat of data.interactionStatistic) {
              if (stat.interactionType === 'https://schema.org/LikeAction') {
                result.likesCount = stat.userInteractionCount || 0
              } else if (stat.interactionType === 'https://schema.org/CommentAction') {
                result.commentsCount = stat.userInteractionCount || 0
              }
            }
          }
        } catch (e) {
          // Ignore JSON parse errors
        }
      }
      
      // Try to find in article section (main post content)
      const article = document.querySelector('article')
      if (article) {
        const articleText = article.textContent || ''
        
        // Look for likes - usually appears as "1,234 likes" or "1.2K likes"
        const likesMatch = articleText.match(/([\d,KMkm.]+)\s*likes?/i)
        if (likesMatch && !result.likesCount) {
          result.likesCount = likesMatch[1]
        }
        
        // Look for comments
        const commentsMatch = articleText.match(/([\d,KMkm.]+)\s*comments?/i)
        if (commentsMatch && !result.commentsCount) {
          result.commentsCount = commentsMatch[1]
        }
        
        // Look for views (videos)
        const viewsMatch = articleText.match(/([\d,KMkm.]+)\s*views?/i)
        if (viewsMatch && !result.viewsCount) {
          result.viewsCount = viewsMatch[1]
        }
      }
      
      // Try aria-labels for accessibility
      const allElements = Array.from(document.querySelectorAll('[aria-label]'))
      for (const el of allElements) {
        const ariaLabel = el.getAttribute('aria-label') || ''
        const text = el.textContent || ''
        
        // Likes
        if (ariaLabel.toLowerCase().includes('like') && !result.likesCount) {
          const match = text.match(/[\d,KMkm.]+/) || ariaLabel.match(/[\d,KMkm.]+/)
          if (match) {
            result.likesCount = match[0]
          }
        }
        
        // Comments
        if (ariaLabel.toLowerCase().includes('comment') && !result.commentsCount) {
          const match = text.match(/[\d,KMkm.]+/) || ariaLabel.match(/[\d,KMkm.]+/)
          if (match) {
            result.commentsCount = match[0]
          }
        }
        
        // Views
        if (ariaLabel.toLowerCase().includes('view') && !result.viewsCount) {
          const match = text.match(/[\d,KMkm.]+/) || ariaLabel.match(/[\d,KMkm.]+/)
          if (match) {
            result.viewsCount = match[0]
          }
        }
      }
      
      // Try specific selectors for likes button
      const likeButtons = Array.from(document.querySelectorAll('button, span, a')).filter(el => {
        const text = el.textContent || ''
        const aria = el.getAttribute('aria-label') || ''
        return (text.includes('like') || aria.includes('like')) && /[\d,KMkm]/.test(text)
      })
      
      if (likeButtons.length > 0 && !result.likesCount) {
        const likeText = likeButtons[0].textContent || ''
        const match = likeText.match(/[\d,KMkm.]+/)
        if (match) {
          result.likesCount = match[0]
        }
      }
      
      // Try specific selectors for comments
      const commentButtons = Array.from(document.querySelectorAll('button, span, a')).filter(el => {
        const text = el.textContent || ''
        const aria = el.getAttribute('aria-label') || ''
        return (text.includes('comment') || aria.includes('comment')) && /[\d,KMkm]/.test(text)
      })
      
      if (commentButtons.length > 0 && !result.commentsCount) {
        const commentText = commentButtons[0].textContent || ''
        const match = commentText.match(/[\d,KMkm.]+/)
        if (match) {
          result.commentsCount = match[0]
        }
      }
      
      // Final fallback: search entire page text
      if (!result.likesCount || !result.commentsCount) {
        const pageText = document.body.textContent || ''
        
        // More specific patterns
        const likesPattern = /([\d,KMkm.]+)\s*(?:other\s+)?(?:people\s+)?likes?/i
        const likesMatch = pageText.match(likesPattern)
        if (likesMatch && !result.likesCount) {
          result.likesCount = likesMatch[1]
        }
        
        const commentsPattern = /([\d,KMkm.]+)\s*(?:other\s+)?(?:people\s+)?comments?/i
        const commentsMatch = pageText.match(commentsPattern)
        if (commentsMatch && !result.commentsCount) {
          result.commentsCount = commentsMatch[1]
        }
        
        const viewsPattern = /([\d,KMkm.]+)\s*views?/i
        const viewsMatch = pageText.match(viewsPattern)
        if (viewsMatch && !result.viewsCount) {
          result.viewsCount = viewsMatch[1]
        }
      }
      
      return result
    })
    
    // Parse the counts
    return {
      viewsCount: parseCount(stats.viewsCount),
      likesCount: parseCount(stats.likesCount),
      commentsCount: parseCount(stats.commentsCount)
    }
  } catch (error) {
    throw new Error(`Failed to get post stats for ${postUrl}: ${error.message}`)
  }
}

/**
 * Review an Instagram account
 * Logs in, gets account stats, and post stats for recent posts
 * Returns: { accountStats, posts: [{ url, stats }] }
 */
export async function reviewAccount(page, account) {
  try {
    // 1. Login to Instagram
    const savedCookies = account.cookies || null
    let password = null
    
    if (account.password_encrypted) {
      try {
        password = decryptPassword(account.password_encrypted)
      } catch (decryptError) {
        throw new Error(`Failed to decrypt password: ${decryptError.message}`)
      }
    }
    
    const loginResult = await loginToInstagram(
      page,
      account.instagram_username,
      password,
      savedCookies
    )
    
    if (!loginResult.success) {
      throw new Error(`Login failed: ${loginResult.error || 'Unknown error'}`)
    }
    
    // 2. Get account stats
    const accountStats = await getAccountStats(page, account.instagram_username)
    
    // 3. Get post URLs (limit to 12 most recent)
    const postUrls = await getPostUrls(page, account.instagram_username, 12)
    
    // 4. Get stats for each post
    const posts = []
    for (const postUrl of postUrls) {
      try {
        const postStats = await getPostStats(page, postUrl)
        posts.push({
          url: postUrl,
          ...postStats
        })
        // Small delay between posts
        await sleep(random(1000, 2000))
      } catch (error) {
        console.warn(`Failed to get stats for post ${postUrl}:`, error.message)
        // Continue with other posts
      }
    }
    
    return {
      success: true,
      accountStats,
      posts
    }
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Unknown error during review'
    }
  }
}

