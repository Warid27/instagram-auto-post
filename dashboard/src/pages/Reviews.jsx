import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { api } from '../lib/api'
import { Card, CardContent } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import {
  BarChart3,
  Heart,
  MessageCircle,
  Eye,
  Loader2,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Instagram,
  CheckCircle2,
} from 'lucide-react'
import { format } from 'date-fns'

const Reviews = () => {
  const [accounts, setAccounts] = useState([])
  const [selectedAccounts, setSelectedAccounts] = useState([])
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [reviewing, setReviewing] = useState(false)
  const [selectedReview, setSelectedReview] = useState(null)
  const [comparison, setComparison] = useState(null)
  const [notifications, setNotifications] = useState([])
  const notificationIdsRef = useRef(new Set())
  const { user } = useAuth()
  const toast = useToast()

  // Fetch accounts
  const fetchAccounts = useCallback(async () => {
    if (!user) return

    try {
      const { data, error } = await supabase
        .from('accounts')
        .select('id, instagram_username, is_active')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('instagram_username', { ascending: true })

      if (error) throw error
      setAccounts(data || [])
    } catch (error) {
      console.error('Error fetching accounts:', error)
      toast.error('Error', 'Failed to load accounts')
    }
  }, [toast, user])

  // Fetch reviews
  const fetchReviews = useCallback(async () => {
    if (!user) return

    try {
      setLoading(true)
      const { data, error } = await api.get('/reviewer/reviews?limit=50')

      if (error) throw new Error(error)
      setReviews(data?.reviews || [])
    } catch (error) {
      console.error('Error fetching reviews:', error)
      toast.error('Error', 'Failed to load reviews')
    } finally {
      setLoading(false)
    }
  }, [toast, user])

  const fetchNotifications = useCallback(async () => {
    if (!user) return

    try {
      const { data, error } = await api.get('/reviewer/notifications', {
        params: {
          unreadOnly: true,
          limit: 10,
        },
      })

      if (error) throw new Error(error)

      const newNotifications = (data?.notifications || []).filter(
        (notification) => !notificationIdsRef.current.has(notification.id)
      )

      if (newNotifications.length > 0) {
        newNotifications.forEach((notification) => {
          notificationIdsRef.current.add(notification.id)
          if (notification.message) {
            toast.info('Review Update', notification.message)
          }
        })

        setNotifications((prev) => [...newNotifications, ...prev].slice(0, 10))

        // Mark notifications as read after displaying
        await Promise.all(
          newNotifications.map((notification) =>
            api.post(`/reviewer/notifications/${notification.id}/read`)
          )
        )
      }
    } catch (error) {
      console.error('Error fetching review notifications:', error)
    }
  }, [toast, user])

  useEffect(() => {
    if (!user) return

    fetchAccounts()
    fetchReviews()
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 15000)

    return () => {
      clearInterval(interval)
    }
  }, [fetchAccounts, fetchNotifications, fetchReviews, user])

  // Handle review trigger
  const handleReview = async () => {
    if (selectedAccounts.length === 0) {
      toast.error('Error', 'Please select at least one account to review')
      return
    }

    setReviewing(true)

    try {
      const { data, error } = await api.post('/reviewer/review', {
        accountIds: selectedAccounts,
      })

      if (error) throw new Error(error)

      toast.success('Success', `Review started for ${data.accountCount} account(s). Check Bot Status page for progress.`)
      setSelectedAccounts([])

      // Refresh reviews after a delay
      setTimeout(() => {
        fetchReviews()
      }, 10000) // Wait longer for review to complete
    } catch (error) {
      console.error('Error starting review:', error)
      toast.error('Error', error.message || 'Failed to start review')
    } finally {
      setReviewing(false)
    }
  }

  // Handle account selection
  const toggleAccount = (accountId) => {
    if (selectedAccounts.includes(accountId)) {
      setSelectedAccounts(selectedAccounts.filter((id) => id !== accountId))
    } else {
      setSelectedAccounts([...selectedAccounts, accountId])
    }
  }

  // Handle review detail view
  const handleViewReview = async (reviewId) => {
    try {
      const { data, error } = await api.get(`/reviewer/reviews/${reviewId}`)

      if (error) throw new Error(error)
      setSelectedReview(data)
    } catch (error) {
      console.error('Error fetching review details:', error)
      toast.error('Error', 'Failed to load review details')
    }
  }

  // Handle comparison view
  const handleCompare = async (accountId) => {
    try {
      const { data, error } = await api.get(`/reviewer/compare/${accountId}`)

      if (error) throw new Error(error)
      setComparison(data)
    } catch (error) {
      console.error('Error fetching comparison:', error)
      toast.error('Error', 'Failed to load comparison')
    }
  }

  const formatNumber = (num) => {
    if (!num && num !== 0) return 'N/A'
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
    return num.toString()
  }

  return (
    <div className="space-y-6">
      {notifications.length > 0 && (
        <Card className="border-purple-200 bg-purple-50">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-purple-700">Recent Review Updates</h2>
                <ul className="mt-2 space-y-1">
                  {notifications.map((notification) => (
                    <li key={notification.id} className="text-sm text-purple-900">
                      <span className="font-medium">{notification.status?.toUpperCase()}:</span>{' '}
                      {notification.message || 'Review update'}
                    </li>
                  ))}
                </ul>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setNotifications([])
                  notificationIdsRef.current.clear()
                  api.post('/reviewer/notifications/read-all')
                }}
              >
                Clear
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Account Reviews</h1>
          <p className="mt-2 text-gray-600">
            Review your Instagram accounts and track growth over time
          </p>
        </div>
        <Button
          onClick={fetchReviews}
          variant="outline"
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Review Trigger Section */}
      <Card>
        <CardContent className="p-6">
          <h2 className="text-xl font-semibold mb-4">Start New Review</h2>
          <p className="text-gray-600 mb-4">
            Select accounts to review. The review bot will run on the server and collect account stats and post analytics.
            You can view the progress in the Bot Status page.
          </p>

          {accounts.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Instagram className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <p>No active accounts found. Add accounts first.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-gray-600">
                  {selectedAccounts.length} of {accounts.length} selected
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (selectedAccounts.length === accounts.length) {
                      setSelectedAccounts([])
                    } else {
                      setSelectedAccounts(accounts.map((acc) => acc.id))
                    }
                  }}
                >
                  {selectedAccounts.length === accounts.length ? 'Deselect All' : 'Select All'}
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
                {accounts.map((account) => (
                  <button
                    key={account.id}
                    onClick={() => toggleAccount(account.id)}
                    className={`p-3 rounded-lg border-2 transition-all text-left ${
                      selectedAccounts.includes(account.id)
                        ? 'border-purple-600 bg-purple-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Instagram className="w-5 h-5 text-purple-600" />
                        <span className="font-medium">@{account.instagram_username}</span>
                      </div>
                      {selectedAccounts.includes(account.id) && (
                        <CheckCircle2 className="w-5 h-5 text-purple-600" />
                      )}
                    </div>
                  </button>
                ))}
              </div>

              <Button
                onClick={handleReview}
                disabled={selectedAccounts.length === 0 || reviewing}
                className="w-full md:w-auto"
              >
                {reviewing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Reviewing...
                  </>
                ) : (
                  <>
                    <BarChart3 className="w-4 h-4 mr-2" />
                    Start Review ({selectedAccounts.length} account{selectedAccounts.length !== 1 ? 's' : ''})
                  </>
                )}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Reviews List */}
      <Card>
        <CardContent className="p-6">
          <h2 className="text-xl font-semibold mb-4">Review History</h2>

          {loading ? (
            <div className="text-center py-12">
              <Loader2 className="w-8 h-8 mx-auto animate-spin text-purple-600" />
            </div>
          ) : reviews.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <BarChart3 className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <p>No reviews yet. Start your first review above.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {reviews.map((review) => (
                <div
                  key={review.id}
                  className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <Instagram className="w-5 h-5 text-purple-600" />
                        <span className="font-semibold">
                          @{review.account?.instagram_username || 'Unknown'}
                        </span>
                        <Badge variant="outline">
                          {format(new Date(review.review_datetime), 'MMM d, yyyy HH:mm')}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-3 gap-4 mt-4">
                        <div>
                          <div className="text-sm text-gray-600">Posts</div>
                          <div className="text-2xl font-bold">{formatNumber(review.posts_count)}</div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-600">Followers</div>
                          <div className="text-2xl font-bold">{formatNumber(review.followers_count)}</div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-600">Following</div>
                          <div className="text-2xl font-bold">{formatNumber(review.following_count)}</div>
                        </div>
                      </div>
                    </div>

                    <div className="flex space-x-2 ml-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewReview(review.id)}
                      >
                        View Details
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCompare(review.account_id)}
                      >
                        Compare
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Review Detail Modal */}
      {selectedReview && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <Card className="max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold">
                  Review Details - @{selectedReview.review?.account?.instagram_username}
                </h2>
                <Button variant="outline" onClick={() => setSelectedReview(null)}>
                  Close
                </Button>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">Posts</div>
                  <div className="text-3xl font-bold">{formatNumber(selectedReview.review?.posts_count)}</div>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">Followers</div>
                  <div className="text-3xl font-bold">{formatNumber(selectedReview.review?.followers_count)}</div>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">Following</div>
                  <div className="text-3xl font-bold">{formatNumber(selectedReview.review?.following_count)}</div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-4">Post Analytics</h3>
                {selectedReview.posts && selectedReview.posts.length > 0 ? (
                  <div className="space-y-4">
                    {selectedReview.posts.map((post, index) => (
                      <div key={index} className="border border-gray-200 rounded-lg p-4">
                        <a
                          href={post.post_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-purple-600 hover:underline mb-3 block font-medium"
                        >
                          View Post →
                        </a>
                        <div className="grid grid-cols-3 gap-4 mb-4">
                          <div className="flex items-center space-x-2">
                            <Eye className="w-4 h-4 text-gray-500" />
                            <span className="text-sm text-gray-600">Views:</span>
                            <span className="font-semibold">{formatNumber(post.views_count)}</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Heart className="w-4 h-4 text-red-500" />
                            <span className="text-sm text-gray-600">Likes:</span>
                            <span className="font-semibold">{formatNumber(post.likes_count)}</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <MessageCircle className="w-4 h-4 text-blue-500" />
                            <span className="text-sm text-gray-600">Comments:</span>
                            <span className="font-semibold">{formatNumber(post.comments_count)}</span>
                          </div>
                        </div>
                        
                        {/* Comments Section */}
                        {post.comments && post.comments.length > 0 && (
                          <div className="mt-4 pt-4 border-t border-gray-200">
                            <h4 className="text-sm font-semibold text-gray-700 mb-3">
                              Comments ({post.comments.length})
                            </h4>
                            <div className="space-y-2 max-h-60 overflow-y-auto">
                              {post.comments.map((comment, commentIndex) => (
                                <div
                                  key={commentIndex}
                                  className={`text-sm ${
                                    comment.is_reply ? 'ml-6 pl-3 border-l-2 border-gray-200' : ''
                                  }`}
                                >
                                  <span className="font-semibold text-purple-600">
                                    @{comment.username}
                                  </span>
                                  {comment.is_reply && (
                                    <span className="text-xs text-gray-500 ml-2">(reply)</span>
                                  )}
                                  <span className="text-gray-700 ml-2">{comment.comment_text}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500">No post data available</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Comparison Modal */}
      {comparison && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <Card className="max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold">
                  Comparison - @{comparison.account?.instagram_username}
                </h2>
                <Button variant="outline" onClick={() => setComparison(null)}>
                  Close
                </Button>
              </div>

              {comparison.comparisons && comparison.comparisons.length > 0 ? (
                <div className="space-y-4">
                  {comparison.comparisons.map((comp, index) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-4">
                      <div className="text-sm text-gray-600 mb-3">
                        {format(new Date(comp.from), 'MMM d, yyyy')} →{' '}
                        {format(new Date(comp.to), 'MMM d, yyyy')}
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <div className="text-sm text-gray-600 mb-1">Posts</div>
                          <div className="flex items-center space-x-2">
                            <span className="text-xl font-bold">{formatNumber(comp.current.posts)}</span>
                            {comp.changes.posts !== 0 && (
                              <span
                                className={`text-sm flex items-center ${
                                  comp.changes.posts > 0 ? 'text-green-600' : 'text-red-600'
                                }`}
                              >
                                {comp.changes.posts > 0 ? (
                                  <TrendingUp className="w-4 h-4" />
                                ) : (
                                  <TrendingDown className="w-4 h-4" />
                                )}
                                {comp.changes.posts > 0 ? '+' : ''}
                                {formatNumber(comp.changes.posts)}
                              </span>
                            )}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-600 mb-1">Followers</div>
                          <div className="flex items-center space-x-2">
                            <span className="text-xl font-bold">{formatNumber(comp.current.followers)}</span>
                            {comp.changes.followers !== 0 && (
                              <span
                                className={`text-sm flex items-center ${
                                  comp.changes.followers > 0 ? 'text-green-600' : 'text-red-600'
                                }`}
                              >
                                {comp.changes.followers > 0 ? (
                                  <TrendingUp className="w-4 h-4" />
                                ) : (
                                  <TrendingDown className="w-4 h-4" />
                                )}
                                {comp.changes.followers > 0 ? '+' : ''}
                                {formatNumber(comp.changes.followers)}
                              </span>
                            )}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-600 mb-1">Following</div>
                          <div className="flex items-center space-x-2">
                            <span className="text-xl font-bold">{formatNumber(comp.current.following)}</span>
                            {comp.changes.following !== 0 && (
                              <span
                                className={`text-sm flex items-center ${
                                  comp.changes.following > 0 ? 'text-green-600' : 'text-red-600'
                                }`}
                              >
                                {comp.changes.following > 0 ? (
                                  <TrendingUp className="w-4 h-4" />
                                ) : (
                                  <TrendingDown className="w-4 h-4" />
                                )}
                                {comp.changes.following > 0 ? '+' : ''}
                                {formatNumber(comp.changes.following)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500">Not enough reviews for comparison</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

export default Reviews

