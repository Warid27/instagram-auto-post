import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { supabase } from '../lib/supabase'
import { api } from '../lib/api'
import BotStatusCard from '../components/BotStatusCard'
import BotStatistics from '../components/BotStatistics'
import ActivityLog from '../components/ActivityLog'
import BotControls from '../components/BotControls'
import BotConfiguration from '../components/BotConfiguration'
import { Card, CardContent } from '../components/ui/Card'
import { Loader2 } from 'lucide-react'

const BotStatus = () => {
  const [botStatus, setBotStatus] = useState('stopped')
  const [lastActivity, setLastActivity] = useState(null)
  const [currentTask, setCurrentTask] = useState(null)
  const [progress, setProgress] = useState(null)
  const [stats, setStats] = useState({
    postsProcessedToday: 0,
    successRate: 0,
    avgTimePerPost: 0,
    nextCheckTime: null,
  })
  const [activities, setActivities] = useState([])
  const [config, setConfig] = useState({
    postsPerHour: 5,
    delayBetweenPosts: 120000,
    autoRetry: true,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const { user } = useAuth()
  const toast = useToast()

  // Fetch bot status and statistics
  const fetchBotStatus = useCallback(async () => {
    if (!user) return

    try {
      // Get recent posts to calculate stats
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const { data: posts, error } = await supabase
        .from('posts')
        .select('id, status, created_at, scheduled_at')
        .eq('user_id', user.id)
        .gte('created_at', today.toISOString())

      if (error) throw error

      // Calculate stats
      const completed = posts.filter(p => p.status === 'completed').length
      const failed = posts.filter(p => p.status === 'failed').length
      const total = posts.length
      const successRate = total > 0 ? (completed / total) * 100 : 0

      // Get post_accounts for today to calculate average time
      const { data: postAccounts } = await supabase
        .from('post_accounts')
        .select('posted_at, created_at')
        .gte('created_at', today.toISOString())
        .not('posted_at', 'is', null)

      let avgTime = 0
      if (postAccounts && postAccounts.length > 0) {
        const times = postAccounts.map(pa => {
          const created = new Date(pa.created_at)
          const posted = new Date(pa.posted_at)
          return (posted - created) / 1000 // seconds
        })
        avgTime = times.reduce((a, b) => a + b, 0) / times.length
      }

      // Get pending posts to determine next check
      const { data: pendingPosts } = await supabase
        .from('posts')
        .select('scheduled_at')
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .order('scheduled_at', { ascending: true })
        .limit(1)

      const nextCheck = pendingPosts && pendingPosts.length > 0
        ? pendingPosts[0].scheduled_at
        : null

      // Simulate bot status (in real implementation, this would come from bot health check)
      // Check if bot is active by looking at recent activity
      const recentActivity = posts.filter(p => {
        const created = new Date(p.created_at)
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
        return created > fiveMinutesAgo
      }).length

      let status = 'stopped'
      if (recentActivity > 0) {
        status = 'running'
      } else {
        // Check for processing posts
        const processing = posts.filter(p => p.status === 'processing')
        if (processing.length > 0) {
          status = 'processing'
          const processingPost = processing[0]
          setCurrentTask(`Processing post: ${processingPost.id.substring(0, 8)}...`)
          setProgress(50)
        }
      }

      setBotStatus(status)
      setStats({
        postsProcessedToday: completed,
        successRate,
        avgTimePerPost: avgTime,
        nextCheckTime: nextCheck,
      })

      // Update last activity
      if (posts.length > 0) {
        const latest = posts.sort((a, b) => 
          new Date(b.created_at) - new Date(a.created_at)
        )[0]
        setLastActivity(latest.created_at)
      }

      // Generate activity log from recent posts
      const recentActivities = []
      const recentPosts = posts
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 20)

      recentPosts.forEach(post => {
        if (post.status === 'completed') {
          recentActivities.push({
            type: 'success',
            message: `Post completed successfully`,
            timestamp: post.created_at,
            details: `Post ID: ${post.id.substring(0, 8)}...`,
          })
        } else if (post.status === 'failed') {
          recentActivities.push({
            type: 'error',
            message: `Post failed`,
            timestamp: post.created_at,
            details: `Post ID: ${post.id.substring(0, 8)}...`,
          })
        } else if (post.status === 'processing') {
          recentActivities.push({
            type: 'info',
            message: `Post processing`,
            timestamp: post.created_at,
            details: `Post ID: ${post.id.substring(0, 8)}...`,
          })
        }
      })

      // Add queue check activity
      recentActivities.push({
        type: 'info',
        message: 'Queue check completed',
        timestamp: new Date().toISOString(),
      })

      setActivities(recentActivities.slice(0, 20))

    } catch (error) {
      console.error('Error fetching bot status:', error)
      setBotStatus('error')
    } finally {
      setLoading(false)
    }
  }, [user])

  // Initial fetch and polling
  useEffect(() => {
    if (!user) return

    fetchBotStatus()

    // Poll every 30 seconds
    const interval = setInterval(fetchBotStatus, 30000)

    // Real-time subscription for posts
    const channel = supabase
      .channel('bot-status-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'posts',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchBotStatus()
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
          fetchBotStatus()
        }
      )
      .subscribe()

    return () => {
      clearInterval(interval)
      supabase.removeChannel(channel)
    }
  }, [user, fetchBotStatus])

  // Bot control handlers
  const handleStart = async () => {
    try {
      // In real implementation, this would call bot API
      toast.info('Bot Control', 'Starting bot... (This requires bot API integration)')
      setBotStatus('running')
    } catch (error) {
      toast.error('Error', 'Failed to start bot')
    }
  }

  const handleStop = async () => {
    try {
      // In real implementation, this would call bot API
      toast.info('Bot Control', 'Stopping bot... (This requires bot API integration)')
      setBotStatus('stopped')
      setCurrentTask(null)
      setProgress(null)
    } catch (error) {
      toast.error('Error', 'Failed to stop bot')
    }
  }

  const handleForceCheck = async () => {
    try {
      // In real implementation, this would trigger bot to check queue
      toast.info('Bot Control', 'Forcing queue check... (This requires bot API integration)')
      
      // Add activity log entry
      setActivities(prev => [{
        type: 'info',
        message: 'Manual queue check triggered',
        timestamp: new Date().toISOString(),
      }, ...prev].slice(0, 20))

      fetchBotStatus()
    } catch (error) {
      toast.error('Error', 'Failed to force queue check')
    }
  }

  const handleClearLogs = () => {
    setActivities([])
    toast.success('Success', 'Activity log cleared')
  }

  const handleSaveConfig = async (newConfig) => {
    setSaving(true)
    try {
      // In real implementation, this would save to database or config file
      setConfig(newConfig)
      
      // Add activity log entry
      setActivities(prev => [{
        type: 'info',
        message: 'Configuration updated',
        timestamp: new Date().toISOString(),
        details: `Posts/hour: ${newConfig.postsPerHour}, Delay: ${newConfig.delayBetweenPosts}ms, Auto-retry: ${newConfig.autoRetry ? 'enabled' : 'disabled'}`,
      }, ...prev].slice(0, 20))

      toast.success('Success', 'Configuration saved successfully')
    } catch (error) {
      toast.error('Error', 'Failed to save configuration')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-purple-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading bot status...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Bot Status</h1>
        <p className="mt-2 text-gray-600">Monitor and control your Instagram automation bot</p>
      </div>

      {/* Status Card */}
      <BotStatusCard
        status={botStatus}
        lastActivity={lastActivity}
        currentTask={currentTask}
        progress={progress}
      />

      {/* Statistics */}
      <BotStatistics stats={stats} />

      {/* Controls and Configuration Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <BotControls
          status={botStatus}
          onStart={handleStart}
          onStop={handleStop}
          onForceCheck={handleForceCheck}
          onClearLogs={handleClearLogs}
        />
        <BotConfiguration
          config={config}
          onSave={handleSaveConfig}
          loading={saving}
        />
      </div>

      {/* Activity Log */}
      <ActivityLog
        activities={activities}
        onClear={handleClearLogs}
      />
    </div>
  )
}

export default BotStatus

