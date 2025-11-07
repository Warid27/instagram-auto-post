import { useState, useEffect } from 'react'
import { X, Instagram, CheckCircle, XCircle, Clock, Calendar, ExternalLink } from 'lucide-react'
import { Dialog } from './ui/Dialog'
import { Badge } from './ui/Badge'
import { supabase } from '../lib/supabase'
import { formatDistanceToNow } from 'date-fns'

const PostDetailModal = ({ post, isOpen, onClose }) => {
  const [postAccounts, setPostAccounts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!post || !isOpen) return

    const fetchPostAccounts = async () => {
      try {
        setLoading(true)
        const { data, error } = await supabase
          .from('post_accounts')
          .select(`
            *,
            account:accounts (
              id,
              instagram_username,
              is_active
            )
          `)
          .eq('post_id', post.id)

        if (error) throw error

        setPostAccounts(data || [])
      } catch (error) {
        console.error('Error fetching post accounts:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchPostAccounts()
  }, [post, isOpen])

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return 'success'
      case 'failed':
        return 'error'
      case 'processing':
        return 'info'
      default:
        return 'warning'
    }
  }

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A'
    try {
      const date = new Date(dateString)
      return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return 'Invalid date'
    }
  }

  if (!post) return null

  return (
    <Dialog
      open={isOpen}
      onOpenChange={onClose}
      title="Post Details"
      description="View complete information about this post"
    >
      <div className="space-y-6 max-h-[80vh] overflow-y-auto">
        {/* Image */}
        {post.image_url && (
          <div className="rounded-lg overflow-hidden bg-gray-100">
            <img
              src={post.image_url}
              alt="Post"
              className="w-full max-h-96 object-contain"
            />
          </div>
        )}

        {/* Caption */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Caption
          </label>
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <p className="text-sm text-gray-900 whitespace-pre-wrap">
              {post.caption || <span className="text-gray-400 italic">No caption</span>}
            </p>
          </div>
        </div>

        {/* Status and Schedule */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Status
            </label>
            <Badge variant={getStatusColor(post.status)}>
              {post.status?.charAt(0).toUpperCase() + post.status?.slice(1) || 'Unknown'}
            </Badge>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Scheduled
            </label>
            <p className="text-sm text-gray-900">
              {formatDate(post.scheduled_at)}
            </p>
          </div>
        </div>

        {/* Accounts List */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Accounts ({postAccounts.length})
          </label>
          
          {loading ? (
            <div className="text-center py-8">
              <div className="inline-block w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : postAccounts.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">
              No accounts assigned to this post
            </div>
          ) : (
            <div className="space-y-3">
              {postAccounts.map((postAccount) => {
                const account = postAccount.account
                if (!account) return null

                return (
                  <div
                    key={postAccount.id}
                    className="border border-gray-200 rounded-lg p-4 space-y-3"
                  >
                    {/* Account Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-pink-600 rounded-full flex items-center justify-center">
                          <Instagram className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">
                            @{account.instagram_username}
                          </p>
                          <Badge variant={getStatusColor(postAccount.status)} className="mt-1">
                            {postAccount.status?.charAt(0).toUpperCase() + postAccount.status?.slice(1) || 'Pending'}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    {/* Account Details */}
                    <div className="space-y-2 pl-13">
                      {postAccount.posted_at && (
                        <div className="flex items-center space-x-2 text-sm text-gray-600">
                          <Calendar className="w-4 h-4" />
                          <span>
                            Posted {formatDistanceToNow(new Date(postAccount.posted_at), { addSuffix: true })}
                          </span>
                        </div>
                      )}

                      {postAccount.instagram_post_url && (
                        <div className="flex items-center space-x-2">
                          <a
                            href={postAccount.instagram_post_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center space-x-1 text-sm text-purple-600 hover:text-purple-700"
                          >
                            <ExternalLink className="w-4 h-4" />
                            <span>View on Instagram</span>
                          </a>
                        </div>
                      )}

                      {postAccount.error_message && (
                        <div className="bg-red-50 border border-red-200 rounded p-2 text-sm text-red-700">
                          <div className="flex items-start space-x-2">
                            <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                            <p>{postAccount.error_message}</p>
                          </div>
                        </div>
                      )}

                      {!postAccount.posted_at && !postAccount.error_message && (
                        <p className="text-sm text-gray-500 italic">
                          Waiting to be processed...
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Metadata */}
        <div className="text-xs text-gray-500 space-y-1 pt-4 border-t border-gray-200">
          <p>Created: {formatDate(post.created_at)}</p>
          {post.updated_at && post.updated_at !== post.created_at && (
            <p>Updated: {formatDate(post.updated_at)}</p>
          )}
        </div>
      </div>
    </Dialog>
  )
}

export default PostDetailModal

