import { useState, useEffect, useMemo } from 'react'
import { Search, Trash2, Filter } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import QueueStats from '../components/QueueStats'
import PostCard from '../components/PostCard'
import PostDetailModal from '../components/PostDetailModal'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Card, CardContent } from '../components/ui/Card'
import { Loader2, Instagram } from 'lucide-react'

const PostQueue = () => {
  const [posts, setPosts] = useState([])
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedPosts, setSelectedPosts] = useState([])
  const [selectedPost, setSelectedPost] = useState(null)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const { user } = useAuth()
  const toast = useToast()

  const POSTS_PER_PAGE = 20

  // Calculate stats
  const stats = useMemo(() => {
    return {
      pending: posts.filter(p => p.status === 'pending').length,
      processing: posts.filter(p => p.status === 'processing').length,
      posted: posts.filter(p => p.status === 'completed').length,
      failed: posts.filter(p => p.status === 'failed').length,
    }
  }, [posts])

  // Fetch accounts
  useEffect(() => {
    if (!user) return

    const fetchAccounts = async () => {
      try {
        const { data, error } = await supabase
          .from('accounts')
          .select('id, instagram_username')
          .eq('user_id', user.id)

        if (error) throw error
        setAccounts(data || [])
      } catch (error) {
        console.error('Error fetching accounts:', error)
      }
    }

    fetchAccounts()
  }, [user])

  // Fetch posts
  const fetchPosts = async (reset = false) => {
    if (!user) return

    try {
      setLoading(true)
      const currentPage = reset ? 1 : page

      let query = supabase
        .from('posts')
        .select(`
          *,
          post_accounts (
            id,
            account_id,
            status,
            instagram_post_url,
            error_message,
            posted_at
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range(
          (currentPage - 1) * POSTS_PER_PAGE,
          currentPage * POSTS_PER_PAGE - 1
        )

      // Apply status filter
      if (activeTab !== 'all') {
        query = query.eq('status', activeTab)
      }

      // Apply search filter
      if (searchQuery.trim()) {
        query = query.or(`caption.ilike.%${searchQuery}%,image_url.ilike.%${searchQuery}%`)
      }

      const { data, error } = await query

      if (error) throw error

      // Enhance posts with account info
      const enhancedPosts = (data || []).map(post => ({
        ...post,
        post_accounts: post.post_accounts || [],
      }))

      if (reset) {
        setPosts(enhancedPosts)
        setPage(1)
      } else {
        setPosts(prev => [...prev, ...enhancedPosts])
      }

      setHasMore(enhancedPosts.length === POSTS_PER_PAGE)
    } catch (error) {
      console.error('Error fetching posts:', error)
      toast.error('Error', 'Failed to load posts')
    } finally {
      setLoading(false)
    }
  }

  // Initial fetch and real-time subscription
  useEffect(() => {
    if (!user) return

    fetchPosts(true)

    // Subscribe to changes
    const channel = supabase
      .channel('posts-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'posts',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchPosts(true)
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'post_accounts',
        },
        () => {
          fetchPosts(true)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, activeTab, searchQuery])

  // Filter posts based on active tab and search
  const filteredPosts = useMemo(() => {
    let filtered = posts

    // Status filter (already applied in query, but keep for client-side filtering)
    if (activeTab !== 'all') {
      filtered = filtered.filter(p => p.status === activeTab)
    }

    // Search filter (already applied in query, but keep for client-side)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(p =>
        p.caption?.toLowerCase().includes(query) ||
        accounts.some(acc =>
          p.post_accounts?.some(pa => pa.account_id === acc.id) &&
          acc.instagram_username.toLowerCase().includes(query)
        )
      )
    }

    return filtered
  }, [posts, activeTab, searchQuery, accounts])

  // Handle delete
  const handleDelete = async (post) => {
    if (!confirm(`Are you sure you want to delete this post?`)) {
      return
    }

    try {
      const { error } = await supabase
        .from('posts')
        .delete()
        .eq('id', post.id)
        .eq('user_id', user.id)

      if (error) throw error

      toast.success('Success', 'Post deleted successfully')
      fetchPosts(true)
    } catch (error) {
      console.error('Error deleting post:', error)
      toast.error('Error', 'Failed to delete post')
    }
  }

  // Handle bulk delete
  const handleBulkDelete = async () => {
    if (selectedPosts.length === 0) return
    if (!confirm(`Are you sure you want to delete ${selectedPosts.length} post(s)?`)) {
      return
    }

    try {
      const { error } = await supabase
        .from('posts')
        .delete()
        .in('id', selectedPosts)
        .eq('user_id', user.id)

      if (error) throw error

      toast.success('Success', `${selectedPosts.length} post(s) deleted successfully`)
      setSelectedPosts([])
      fetchPosts(true)
    } catch (error) {
      console.error('Error deleting posts:', error)
      toast.error('Error', 'Failed to delete posts')
    }
  }

  // Handle retry (for failed posts)
  const handleRetry = async (post) => {
    try {
      // Update post status back to pending
      const { error } = await supabase
        .from('posts')
        .update({ status: 'pending' })
        .eq('id', post.id)

      if (error) throw error

      // Update post_accounts status back to pending
      const { error: paError } = await supabase
        .from('post_accounts')
        .update({ status: 'pending', error_message: null })
        .eq('post_id', post.id)
        .eq('status', 'failed')

      if (paError) throw paError

      toast.success('Success', 'Post queued for retry')
      fetchPosts(true)
    } catch (error) {
      console.error('Error retrying post:', error)
      toast.error('Error', 'Failed to retry post')
    }
  }

  // Handle edit (navigate to create page with post data)
  const handleEdit = (post) => {
    // TODO: Navigate to create page with post data pre-filled
    toast.info('Coming Soon', 'Edit functionality will be available soon')
  }

  // Handle view details
  const handleViewDetails = (post) => {
    setSelectedPost(post)
    setIsDetailModalOpen(true)
  }

  // Tabs
  const tabs = [
    { id: 'all', label: 'All' },
    { id: 'pending', label: 'Pending' },
    { id: 'processing', label: 'Processing' },
    { id: 'completed', label: 'Posted' },
    { id: 'failed', label: 'Failed' },
  ]

  // Empty state component
  const EmptyState = ({ message, description }) => (
    <Card>
      <CardContent className="py-12">
        <div className="text-center">
          <Instagram className="w-12 h-12 mx-auto text-gray-400 mb-4" />
          <p className="text-lg font-medium text-gray-900">{message}</p>
          <p className="text-sm text-gray-500 mt-2">{description}</p>
        </div>
      </CardContent>
    </Card>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Post Queue</h1>
        <p className="mt-2 text-gray-600">Manage and monitor your scheduled posts</p>
      </div>

      {/* Stats */}
      <QueueStats stats={stats} />

      {/* Filters and Search */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
            {/* Search */}
            <div className="flex-1 max-w-md">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Search posts by caption or account..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Bulk Actions */}
            {selectedPosts.length > 0 && (
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600">
                  {selectedPosts.length} selected
                </span>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleBulkDelete}
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Delete Selected
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id)
                setSelectedPosts([])
                fetchPosts(true)
              }}
              className={`
                whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm
                transition-colors
                ${
                  activeTab === tab.id
                    ? 'border-purple-600 text-purple-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }
              `}
            >
              {tab.label}
              {tab.id !== 'all' && stats[tab.id] > 0 && (
                <span className="ml-2 py-0.5 px-2 text-xs rounded-full bg-gray-100 text-gray-600">
                  {stats[tab.id]}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Posts List */}
      {loading && posts.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center">
              <Loader2 className="w-8 h-8 text-purple-600 animate-spin mb-4" />
              <p className="text-gray-600">Loading posts...</p>
            </div>
          </CardContent>
        </Card>
      ) : filteredPosts.length === 0 ? (
        <EmptyState
          message={`No ${activeTab === 'all' ? '' : activeTab} posts found`}
          description={
            searchQuery
              ? 'Try adjusting your search query'
              : activeTab === 'all'
              ? 'Create your first post to get started'
              : `No posts with status "${activeTab}"`
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6">
            {filteredPosts.map((post) => (
              <div key={post.id} className="flex items-start space-x-3">
                {selectedPosts.length > 0 && (
                  <input
                    type="checkbox"
                    checked={selectedPosts.includes(post.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedPosts([...selectedPosts, post.id])
                      } else {
                        setSelectedPosts(selectedPosts.filter(id => id !== post.id))
                      }
                    }}
                    className="mt-6 w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                  />
                )}
                <div className="flex-1">
                  <PostCard
                    post={post}
                    accounts={accounts}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onRetry={handleRetry}
                    onViewDetails={handleViewDetails}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Load More */}
          {hasMore && (
            <div className="text-center pt-6">
              <Button
                variant="outline"
                onClick={() => {
                  setPage(prev => prev + 1)
                  fetchPosts(false)
                }}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Loading...
                  </>
                ) : (
                  'Load More'
                )}
              </Button>
            </div>
          )}
        </>
      )}

      {/* Post Detail Modal */}
      <PostDetailModal
        post={selectedPost}
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false)
          setSelectedPost(null)
        }}
      />
    </div>
  )
}

export default PostQueue

