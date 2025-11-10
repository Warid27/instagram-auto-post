import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart3, Clock, CheckCircle, XCircle, Loader2, Instagram } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import PostCard from '../components/PostCard'
import PostDetailModal from '../components/PostDetailModal'

const Dashboard = () => {
  const [stats, setStats] = useState({
    pending: 0,
    completedToday: 0,
    activeAccounts: 0,
    failed: 0,
  })
  const [recentPosts, setRecentPosts] = useState([])
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedPost, setSelectedPost] = useState(null)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const { user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  // Fetch dashboard data
  const fetchDashboardData = useCallback(async () => {
    if (!user) return

    try {
      setLoading(true)

      // Fetch posts for stats
      const { data: posts, error: postsError } = await supabase
        .from('posts')
        .select('id, status, created_at, scheduled_at')
        .eq('user_id', user.id)

      if (postsError) throw postsError

      // Calculate stats
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const pending = posts.filter(p => p.status === 'pending').length
      const completedToday = posts.filter(p => {
        if (p.status !== 'completed') return false
        const created = new Date(p.created_at)
        return created >= today
      }).length
      const failed = posts.filter(p => p.status === 'failed').length

      // Fetch active accounts
      const { data: accountsData, error: accountsError } = await supabase
        .from('accounts')
        .select('id, is_active')
        .eq('user_id', user.id)

      if (accountsError) throw accountsError

      const activeAccounts = accountsData.filter(a => a.is_active).length

      setStats({
        pending,
        completedToday,
        activeAccounts,
        failed,
      })

      // Fetch recent posts (last 5)
      const { data: recentPostsData, error: recentPostsError } = await supabase
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
        .limit(5)

      if (recentPostsError) throw recentPostsError

      const enhancedPosts = (recentPostsData || []).map(post => ({
        ...post,
        post_accounts: post.post_accounts || [],
      }))

      setRecentPosts(enhancedPosts)

      // Fetch accounts for post display
      const { data: accountsList, error: accountsListError } = await supabase
        .from('accounts')
        .select('id, instagram_username')
        .eq('user_id', user.id)

      if (accountsListError) throw accountsListError
      setAccounts(accountsList || [])

    } catch (error) {
      console.error('Error fetching dashboard data:', error)
      toast.error('Error', 'Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }, [user, toast])

  // Initial fetch and real-time subscription
  useEffect(() => {
    if (!user) return

    fetchDashboardData()

    // Subscribe to changes
    const channel = supabase
      .channel('dashboard-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'posts',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchDashboardData()
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'accounts',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchDashboardData()
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
          fetchDashboardData()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, fetchDashboardData])

  // Handlers for post actions
  const handleViewDetails = (post) => {
    setSelectedPost(post)
    setIsDetailModalOpen(true)
  }

  const handleEdit = (post) => {
    navigate('/create', { state: { post } })
  }

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
      fetchDashboardData()
    } catch (error) {
      console.error('Error deleting post:', error)
      toast.error('Error', 'Failed to delete post')
    }
  }

  const handleRetry = async (post) => {
    try {
      const { error } = await supabase
        .from('posts')
        .update({ status: 'pending' })
        .eq('id', post.id)

      if (error) throw error

      const { error: paError } = await supabase
        .from('post_accounts')
        .update({ status: 'pending', error_message: null })
        .eq('post_id', post.id)
        .eq('status', 'failed')

      if (paError) throw paError

      toast.success('Success', 'Post queued for retry')
      fetchDashboardData()
    } catch (error) {
      console.error('Error retrying post:', error)
      toast.error('Error', 'Failed to retry post')
    }
  }

  const statsData = [
    { name: 'Pending Posts', value: stats.pending, icon: Clock, color: 'text-yellow-600 bg-yellow-100' },
    { name: 'Completed Today', value: stats.completedToday, icon: CheckCircle, color: 'text-green-600 bg-green-100' },
    { name: 'Active Accounts', value: stats.activeAccounts, icon: BarChart3, color: 'text-blue-600 bg-blue-100' },
    { name: 'Failed Posts', value: stats.failed, icon: XCircle, color: 'text-red-600 bg-red-100' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-2 text-gray-600">Overview of your Instagram automation</p>
      </div>

      {/* Stats Grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="h-4 bg-gray-200 rounded w-24 mb-4 animate-pulse"></div>
                  <div className="h-8 bg-gray-200 rounded w-16 animate-pulse"></div>
                </div>
                <div className="w-12 h-12 bg-gray-200 rounded-lg animate-pulse"></div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {statsData.map((stat) => {
            const Icon = stat.icon
            return (
              <div key={stat.name} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">{stat.name}</p>
                    <p className="mt-2 text-3xl font-bold text-gray-900">{stat.value}</p>
                  </div>
                  <div className={`p-3 rounded-lg ${stat.color}`}>
                    <Icon className="w-6 h-6" />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Recent Posts */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Recent Posts</h2>
          {recentPosts.length > 0 && (
            <button
              onClick={() => navigate('/queue')}
              className="text-sm text-purple-600 hover:text-purple-700 font-medium"
            >
              View All →
            </button>
          )}
        </div>
        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
            </div>
          ) : recentPosts.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Instagram className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <p className="text-lg font-medium">No recent posts to display</p>
              <p className="text-sm mt-2">Create your first post to get started</p>
              <button
                onClick={() => navigate('/create')}
                className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
              >
                Create Post
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {recentPosts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  accounts={accounts}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onRetry={handleRetry}
                  onViewDetails={handleViewDetails}
                />
              ))}
            </div>
          )}
        </div>
      </div>

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

export default Dashboard

