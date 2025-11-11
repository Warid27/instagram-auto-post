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
    const stats = await page.evaluate(async (profileUsername) => {
      const result = {
        postsCount: null,
        followersCount: null,
        followingCount: null,
      }

      const applyCounts = (user) => {
        if (!user || typeof user !== 'object') return
        if (user.edge_owner_to_timeline_media?.count !== undefined) {
          result.postsCount = user.edge_owner_to_timeline_media.count
        }
        if (user.edge_followed_by?.count !== undefined) {
          result.followersCount = user.edge_followed_by.count
        }
        if (user.edge_follow?.count !== undefined) {
          result.followingCount = user.edge_follow.count
        }
        if (typeof user.media_count === 'number') {
          result.postsCount = user.media_count
        }
        if (typeof user.follower_count === 'number') {
          result.followersCount = user.follower_count
        }
        if (typeof user.following_count === 'number') {
          result.followingCount = user.following_count
        }
      }

      // 1) Try Instagram web profile API
      try {
        const response = await fetch(
          `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(profileUsername)}`,
          {
            credentials: 'include',
            headers: {
              'X-IG-App-ID': '936619743392459',
              Accept: 'application/json',
            },
          }
        )
        if (response.ok) {
          const json = await response.json()
          applyCounts(json?.data?.user)
        }
      } catch (e) {
        // Ignore API errors
      }

      // 2) Try __additionalData
      try {
        const additionalData = window.__additionalData
        if (additionalData) {
          const key = `/${profileUsername}/`
          const payload =
            additionalData[key]?.data?.user ||
            additionalData[key]?.data?.graphql?.user ||
            additionalData[key]?.data?.profile_user
          applyCounts(payload)
        }
      } catch (e) {
        // Ignore
      }

      // 3) Try __NEXT_DATA__
      try {
        const nextDataScript = document.querySelector('script#__NEXT_DATA__')
        if (nextDataScript?.textContent) {
          const nextData = JSON.parse(nextDataScript.textContent)
          const graphqlUser = nextData?.props?.pageProps?.graphql?.user
          applyCounts(graphqlUser)

          const apolloState = nextData?.props?.pageProps?.apolloState
          if (apolloState && typeof apolloState === 'object') {
            for (const value of Object.values(apolloState)) {
              if (value && typeof value === 'object') {
                if (
                  value.__typename === 'GraphProfile' ||
                  value.__typename === 'GraphUser' ||
                  value.__typename === 'User' ||
                  value.__typename === 'ProfilePublicUser'
                ) {
                  applyCounts(value)
                }
              }
            }
          }
        }
      } catch (e) {
        // Ignore JSON parse errors
      }

      const extractNumber = (text) => {
        if (!text) return null
        const match = text.replace(/\s+/g, ' ').match(/[\d.,KMkm]+/)
        return match ? match[0] : null
      }

      // 4) Fallback: parse visible DOM elements
      if (result.postsCount === null || result.followersCount === null || result.followingCount === null) {
        const statSelectors = [
          'header section ul li span',
          'header section ul li div span',
          'header section ul li',
          'header section div[role="menubar"] li',
          'header section ul[role="menubar"] li',
        ]

        let statElements = []
        for (const selector of statSelectors) {
          statElements = Array.from(document.querySelectorAll(selector))
          if (statElements.length >= 3) break
        }

        if (statElements.length >= 3) {
          if (result.postsCount === null) {
            result.postsCount = extractNumber(statElements[0]?.textContent || '')
          }
          if (result.followersCount === null) {
            result.followersCount = extractNumber(statElements[1]?.textContent || '')
          }
          if (result.followingCount === null) {
            result.followingCount = extractNumber(statElements[2]?.textContent || '')
          }
        }
      }

      // 5) Final fallback: look through script tags
      if (result.postsCount === null || result.followersCount === null || result.followingCount === null) {
        const scripts = Array.from(
          document.querySelectorAll('script[type="application/ld+json"], script[type="application/json"]')
        )
        for (const script of scripts) {
          try {
            const data = JSON.parse(script.textContent)
            if (data?.mainEntityofPage?.interactionStatistic) {
              applyCounts(data.mainEntityofPage.interactionStatistic)
            }
            if (data?.interactionStatistic) {
              applyCounts(data.interactionStatistic)
            }
            if (data?.entry_data?.ProfilePage?.[0]?.graphql?.user) {
              applyCounts(data.entry_data.ProfilePage[0].graphql.user)
            }
          } catch (e) {
            // Ignore JSON parse errors
          }
        }
      }

      const normalizeValue = (value) => {
        if (value === null || value === undefined) return 0
        if (typeof value === 'number') return value
        if (typeof value === 'string') return value
        return 0
      }

      return {
        postsCount: normalizeValue(result.postsCount),
        followersCount: normalizeValue(result.followersCount),
        followingCount: normalizeValue(result.followingCount),
      }
    }, username)
    
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

    // Ensure profile content is rendered
    try {
      await page.waitForSelector('article', { timeout: 10000 })
    } catch {}

    // Try Web Profile API first for reliability
    try {
      const apiResult = await page.evaluate(async (profileUsername, maxPosts) => {
        function buildUrlFromNode(node) {
          const shortcode = node?.shortcode
          if (!shortcode) return null
          // Only posts (no reels/clips)
          return `https://www.instagram.com/p/${shortcode}/`
        }

        try {
          const response = await fetch(
            `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(profileUsername)}`,
            {
              credentials: 'include',
              headers: { 'X-IG-App-ID': '936619743392459', Accept: 'application/json' },
            }
          )
          if (response.ok) {
            const json = await response.json()
            const edges = json?.data?.user?.edge_owner_to_timeline_media?.edges || []
            const urls = []
            for (const edge of edges) {
              const node = edge?.node
              const productType = (node?.product_type || node?.productType || '').toLowerCase()
              if (productType === 'clips' || productType === 'igtv' || productType === 'reels') continue
              const url = buildUrlFromNode(node)
              if (url && !urls.includes(url)) {
                urls.push(url)
                if (urls.length >= maxPosts) break
              }
            }
            return urls
          }
        } catch (e) {}
        return null
      }, username, limit)

      if (Array.isArray(apiResult) && apiResult.length > 0) {
        return apiResult
      }
    } catch {}

    // Second try: parse __NEXT_DATA__ for timeline media
    try {
      const nextDataUrls = await page.evaluate((maxPosts) => {
        const urls = []
        try {
          const script = document.querySelector('script#__NEXT_DATA__')
          if (!script?.textContent) return urls
          const data = JSON.parse(script.textContent)
          const user =
            data?.props?.pageProps?.graphql?.user ||
            data?.props?.pageProps?.profileUser ||
            null
          const edges = user?.edge_owner_to_timeline_media?.edges || []
          for (const edge of edges) {
            const node = edge?.node
            const shortcode = node?.shortcode
            const productType = (node?.product_type || node?.productType || '').toLowerCase()
            if (!shortcode) continue
            if (productType === 'clips' || productType === 'igtv' || productType === 'reels') continue
            const url = `https://www.instagram.com/p/${shortcode}/`
            if (!urls.includes(url)) {
              urls.push(url)
              if (urls.length >= maxPosts) break
            }
          }
        } catch (e) {}
        return urls
      }, limit)

      if (Array.isArray(nextDataUrls) && nextDataUrls.length > 0) {
        return nextDataUrls
      }
    } catch {}

    // Fallback: scroll a few times and collect anchors for posts only
    const maxScrolls = 8
    const urls = new Set()

    for (let i = 0; i < maxScrolls && urls.size < limit; i++) {
      // Scroll to load grid items
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight)
      })
      await sleep(random(800, 1500))

      const batch = await page.evaluate((maxPosts) => {
        const collected = []
        const anchors = Array.from(document.querySelectorAll('a[href]'))
        for (const a of anchors) {
          const href = a.getAttribute('href') || ''
          // Accept both "/p/<code>" and "/<username>/p/<code>" patterns
          const m = href.match(/\/p\/([A-Za-z0-9_-]+)/)
          if (!m) continue
          const shortcode = m[1]
          const url = `https://www.instagram.com/p/${shortcode}/`
          if (!collected.includes(url)) {
            collected.push(url)
            if (collected.length >= maxPosts) break
          }
        }
        return collected
      }, limit)

      for (const u of batch) {
        urls.add(u)
        if (urls.size >= limit) break
      }
    }

    return Array.from(urls).slice(0, limit)
  } catch (error) {
    throw new Error(`Failed to get post URLs: ${error.message}`)
  }
}

/**
 * Get comments from a post page
 * Returns: Array of { username, commentText, isReply, parentCommentId }
 */
export async function getPostComments(page, postUrl) {
  try {
    await page.goto(postUrl, {
      waitUntil: 'networkidle2',
      timeout: 60000
    })
    
    await sleep(random(2000, 3000))
    
    // Scroll to load more comments
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight)
    })
    await sleep(random(1000, 2000))
    
    // Click "View more comments" if exists
    try {
      const viewMoreButton = await page.$('button:has-text("View more comments"), button:has-text("View replies")')
      if (viewMoreButton) {
        await viewMoreButton.click()
        await sleep(random(1000, 2000))
      }
    } catch (e) {
      // Ignore if button doesn't exist
    }
    
    const comments = await page.evaluate(() => {
      const result = []
      
      // Find all comment containers
      const commentSelectors = [
        'article ul li',
        'article div[role="button"]',
        'ul[role="list"] li',
        'div[data-testid="comment"]'
      ]
      
      let commentElements = []
      for (const selector of commentSelectors) {
        commentElements = Array.from(document.querySelectorAll(selector))
        if (commentElements.length > 0) break
      }
      
      // If no specific comment elements found, try to find by text patterns
      if (commentElements.length === 0) {
        // Look for elements containing usernames and comment text
        const allElements = Array.from(document.querySelectorAll('span, div, p'))
        commentElements = allElements.filter(el => {
          const text = el.textContent || ''
          // Look for patterns like "@username comment text"
          return text.includes('@') && text.length > 10 && text.length < 500
        })
      }
      
      for (const element of commentElements) {
        try {
          const text = element.textContent || ''
          
          // Skip if too short or doesn't look like a comment
          if (text.length < 3 || text.length > 1000) continue
          
          // Try to extract username (usually starts with @)
          const usernameMatch = text.match(/@(\w+)/)
          if (!usernameMatch) continue
          
          const username = usernameMatch[1]
          
          // Extract comment text (everything after username)
          let commentText = text.replace(/@\w+\s*/, '').trim()
          
          // Check if this is a reply (usually indented or has "Replying to" text)
          const isReply = element.closest('ul ul') !== null || 
                         text.toLowerCase().includes('replying to') ||
                         element.getAttribute('style')?.includes('margin-left') ||
                         element.getAttribute('style')?.includes('padding-left')
          
          // Skip if we already have this comment (avoid duplicates)
          const isDuplicate = result.some(c => 
            c.username === username && c.commentText === commentText
          )
          
          if (!isDuplicate && commentText.length > 0) {
            result.push({
              username,
              commentText,
              isReply: isReply || false
            })
          }
        } catch (e) {
          // Skip this element if there's an error
          continue
        }
      }
      
      // Try alternative method: look for comment structure in article
      const article = document.querySelector('article')
      if (article && result.length === 0) {
        const articleText = article.textContent || ''
        // Look for patterns like "@username: comment" or "@username comment"
        const commentPattern = /@(\w+)[:\s]+([^\n@]+)/g
        let match
        while ((match = commentPattern.exec(articleText)) !== null) {
          const username = match[1]
          const commentText = match[2].trim()
          
          if (commentText.length > 0 && commentText.length < 500) {
            const isDuplicate = result.some(c => 
              c.username === username && c.commentText === commentText
            )
            
            if (!isDuplicate) {
              result.push({
                username,
                commentText,
                isReply: false
              })
            }
          }
        }
      }
      
      return result
    })
    
    // Process replies - try to match them to parent comments
    const processedComments = []
    const mainComments = comments.filter(c => !c.isReply)
    const replies = comments.filter(c => c.isReply)
    
    // Add main comments first
    for (const comment of mainComments) {
      processedComments.push({
        username: comment.username,
        commentText: comment.commentText,
        isReply: false,
        parentCommentId: null
      })
    }
    
    // Add replies (for now, we'll link them later if we can identify parents)
    for (const reply of replies) {
      processedComments.push({
        username: reply.username,
        commentText: reply.commentText,
        isReply: true,
        parentCommentId: null // Will be set when saving to DB if we can match
      })
    }
    
    return processedComments
  } catch (error) {
    throw new Error(`Failed to get comments for ${postUrl}: ${error.message}`)
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
 * Get post URL from profile after posting
 * This can be used by post bot to get the URL of a newly posted image
 * Returns: post URL or null
 */
export async function getNewPostUrl(page, username) {
  try {
    // Navigate to profile
    await page.goto(`https://www.instagram.com/${username}/`, {
      waitUntil: 'networkidle2',
      timeout: 60000
    })
    
    await sleep(random(2000, 3000))
    
    // Get the first post URL (should be the newly created one)
    const postUrl = await page.evaluate(() => {
      const postLinks = Array.from(document.querySelectorAll('a[href*="/p/"]'))
      // Filter to only get links that are actual post links
      const gridPosts = postLinks.filter(link => {
        const href = link.getAttribute('href')
        const parent = link.closest('article, div[role="button"]')
        return parent && href && href.startsWith('/p/')
      })
      
      if (gridPosts.length > 0) {
        const href = gridPosts[0].getAttribute('href')
        if (href.startsWith('/')) {
          return 'https://www.instagram.com' + href
        }
        return href
      }
      return null
    })
    
    return postUrl
  } catch (error) {
    throw new Error(`Failed to get new post URL: ${error.message}`)
  }
}

/**
 * Review an Instagram account
 * Logs in, gets account stats, and post stats for recent posts
 * Returns: { accountStats, posts: [{ url, stats, comments }] }
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
    
    // 4. Get stats and comments for each post
    const posts = []
    for (const postUrl of postUrls) {
      try {
        const postStats = await getPostStats(page, postUrl)
        const comments = await getPostComments(page, postUrl)
        
        posts.push({
          url: postUrl,
          ...postStats,
          comments: comments || []
        })
        // Small delay between posts
        await sleep(random(2000, 3000))
      } catch (error) {
        console.warn(`Failed to get stats/comments for post ${postUrl}:`, error.message)
        // Continue with other posts, but include the post with empty stats
        posts.push({
          url: postUrl,
          viewsCount: 0,
          likesCount: 0,
          commentsCount: 0,
          comments: []
        })
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

