import express from 'express'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { authenticateUser } from '../middleware/auth.js'
import { logActivity } from '../utils/activityLogger.js'

dotenv.config()

const router = express.Router()

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/**
 * POST /api/reviewer/review
 * Trigger a review for one or more accounts
 */
router.post('/review', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id
    const { accountIds } = req.body

    if (!accountIds || !Array.isArray(accountIds) || accountIds.length === 0) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'accountIds array is required and must not be empty'
      })
    }

    // Verify all accounts belong to the user
    const { data: accounts, error: accountsError } = await supabase
      .from('accounts')
      .select('id, instagram_username')
      .eq('user_id', userId)
      .in('id', accountIds)

    if (accountsError) {
      console.error('Supabase error:', accountsError)
      return res.status(500).json({
        error: 'Failed to fetch accounts',
        message: accountsError.message
      })
    }

    if (!accounts || accounts.length !== accountIds.length) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'One or more accounts not found or access denied'
      })
    }

    // Import and run reviewer bot
    const { reviewAccounts } = await import('../../bot/reviewer-bot.js')
    
    // Run review asynchronously (don't wait for completion)
    reviewAccounts(accountIds, userId)
      .then((result) => {
        const successCount = result.results.filter((r) => r.success).length
        const failCount = result.results.filter((r) => !r.success).length
        
        logActivity(userId, `Review completed: ${successCount} succeeded, ${failCount} failed`, 
          result.success ? 'success' : 'warning', {
            accountIds,
            successCount,
            failCount,
            results: result.results
          })
      })
      .catch((error) => {
        logActivity(userId, `Review failed: ${error.message}`, 'error', {
          accountIds,
          error: error.message
        })
      })

    // Return immediately
    res.json({
      message: 'Review started',
      accountCount: accountIds.length,
      accounts: accounts.map((acc) => ({
        id: acc.id,
        username: acc.instagram_username
      }))
    })
  } catch (error) {
    console.error('Error starting review:', error)
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    })
  }
})

/**
 * GET /api/reviewer/reviews
 * Get review history for accounts
 */
router.get('/reviews', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id
    const { accountId, limit = 50 } = req.query

    let query = supabase
      .from('account_reviews')
      .select(`
        id,
        account_id,
        review_datetime,
        posts_count,
        followers_count,
        following_count,
        created_at,
        account:accounts (
          id,
          instagram_username
        )
      `)
      .eq('user_id', userId)
      .order('review_datetime', { ascending: false })
      .limit(parseInt(limit, 10))

    if (accountId) {
      query = query.eq('account_id', accountId)
    }

    const { data: reviews, error } = await query

    if (error) {
      console.error('Supabase error:', error)
      return res.status(500).json({
        error: 'Failed to fetch reviews',
        message: error.message
      })
    }

    res.json({
      reviews: reviews || [],
      count: reviews?.length || 0
    })
  } catch (error) {
    console.error('Error fetching reviews:', error)
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    })
  }
})

/**
 * GET /api/reviewer/reviews/:reviewId
 * Get a specific review with post details
 */
router.get('/reviews/:reviewId', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id
    const { reviewId } = req.params

    // Get review
    const { data: review, error: reviewError } = await supabase
      .from('account_reviews')
      .select(`
        id,
        account_id,
        review_datetime,
        posts_count,
        followers_count,
        following_count,
        created_at,
        account:accounts (
          id,
          instagram_username
        )
      `)
      .eq('id', reviewId)
      .eq('user_id', userId)
      .single()

    if (reviewError) {
      if (reviewError.code === 'PGRST116') {
        return res.status(404).json({
          error: 'Review not found'
        })
      }
      console.error('Supabase error:', reviewError)
      return res.status(500).json({
        error: 'Failed to fetch review',
        message: reviewError.message
      })
    }

    // Get post details
    const { data: posts, error: postsError } = await supabase
      .from('account_review_posts')
      .select('*')
      .eq('review_id', reviewId)
      .order('created_at', { ascending: false })

    if (postsError) {
      console.error('Supabase error:', postsError)
      return res.status(500).json({
        error: 'Failed to fetch post details',
        message: postsError.message
      })
    }

    res.json({
      review,
      posts: posts || []
    })
  } catch (error) {
    console.error('Error fetching review:', error)
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    })
  }
})

/**
 * GET /api/reviewer/compare/:accountId
 * Get comparison data for an account across multiple reviews
 */
router.get('/compare/:accountId', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id
    const { accountId } = req.params
    const { limit = 10 } = req.query

    // Verify account belongs to user
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('id, instagram_username')
      .eq('id', accountId)
      .eq('user_id', userId)
      .single()

    if (accountError || !account) {
      return res.status(404).json({
        error: 'Account not found'
      })
    }

    // Get reviews for this account
    const { data: reviews, error: reviewsError } = await supabase
      .from('account_reviews')
      .select('*')
      .eq('account_id', accountId)
      .eq('user_id', userId)
      .order('review_datetime', { ascending: false })
      .limit(parseInt(limit, 10))

    if (reviewsError) {
      console.error('Supabase error:', reviewsError)
      return res.status(500).json({
        error: 'Failed to fetch reviews',
        message: reviewsError.message
      })
    }

    // Calculate changes between reviews
    const comparisons = []
    for (let i = 0; i < reviews.length - 1; i++) {
      const current = reviews[i]
      const previous = reviews[i + 1]

      comparisons.push({
        from: previous.review_datetime,
        to: current.review_datetime,
        changes: {
          posts: current.posts_count - previous.posts_count,
          followers: current.followers_count - previous.followers_count,
          following: current.following_count - previous.following_count,
        },
        current: {
          posts: current.posts_count,
          followers: current.followers_count,
          following: current.following_count,
        },
        previous: {
          posts: previous.posts_count,
          followers: previous.followers_count,
          following: previous.following_count,
        },
      })
    }

    res.json({
      account,
      reviews: reviews || [],
      comparisons,
      count: reviews?.length || 0
    })
  } catch (error) {
    console.error('Error comparing reviews:', error)
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    })
  }
})

export default router

