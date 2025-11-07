import { useState } from 'react'
import { Instagram, Calendar, Edit, Trash2, RotateCw, Eye } from 'lucide-react'
import { Badge } from './ui/Badge'
import { Button } from './ui/Button'
import { formatDistanceToNow } from 'date-fns'

const PostCard = ({ post, accounts, onEdit, onDelete, onRetry, onViewDetails }) => {
  const [showFullCaption, setShowFullCaption] = useState(false)

  const statusColors = {
    pending: 'warning',
    processing: 'info',
    completed: 'success',
    failed: 'error',
  }

  const maxCaptionLength = 150
  const shouldTruncate = post.caption && post.caption.length > maxCaptionLength
  const displayCaption = shouldTruncate && !showFullCaption
    ? post.caption.substring(0, maxCaptionLength) + '...'
    : post.caption

  const formatDate = (dateString) => {
    if (!dateString) return 'Not scheduled'
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true })
    } catch {
      return 'Invalid date'
    }
  }

  // Get accounts for this post
  const postAccounts = accounts.filter(acc => 
    post.post_accounts?.some(pa => pa.account_id === acc.id)
  )

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow duration-200">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center space-x-3 flex-1">
            {/* Image Thumbnail */}
            <div className="w-20 h-20 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
              {post.image_url ? (
                <img
                  src={post.image_url}
                  alt="Post"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Instagram className="w-8 h-8 text-gray-400" />
                </div>
              )}
            </div>

            {/* Caption */}
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-900 whitespace-pre-wrap break-words">
                {displayCaption || <span className="text-gray-400 italic">No caption</span>}
              </p>
              {shouldTruncate && (
                <button
                  onClick={() => setShowFullCaption(!showFullCaption)}
                  className="text-xs text-purple-600 hover:text-purple-700 mt-1"
                >
                  {showFullCaption ? 'Show less' : 'Read more'}
                </button>
              )}
            </div>
          </div>

          {/* Status Badge */}
          <div className="flex-shrink-0 ml-4">
            <Badge variant={statusColors[post.status] || 'default'}>
              {post.status?.charAt(0).toUpperCase() + post.status?.slice(1) || 'Unknown'}
            </Badge>
          </div>
        </div>

        {/* Accounts */}
        {postAccounts.length > 0 && (
          <div className="mb-4">
            <p className="text-xs text-gray-500 mb-2">Posting to:</p>
            <div className="flex flex-wrap gap-2">
              {postAccounts.map((account) => (
                <div
                  key={account.id}
                  className="flex items-center space-x-1 px-2 py-1 bg-gray-100 rounded-full"
                >
                  <div className="w-4 h-4 bg-gradient-to-br from-purple-600 to-pink-600 rounded-full flex items-center justify-center">
                    <Instagram className="w-2.5 h-2.5 text-white" />
                  </div>
                  <span className="text-xs text-gray-700">@{account.instagram_username}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-200">
          <div className="flex items-center space-x-4 text-xs text-gray-500">
            <div className="flex items-center space-x-1">
              <Calendar className="w-3 h-3" />
              <span>{formatDate(post.scheduled_at)}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onViewDetails(post)}
              title="View Details"
            >
              <Eye className="w-4 h-4" />
            </Button>
            
            {post.status === 'pending' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onEdit(post)}
                title="Edit"
              >
                <Edit className="w-4 h-4" />
              </Button>
            )}
            
            {post.status === 'failed' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onRetry(post)}
                title="Retry"
              >
                <RotateCw className="w-4 h-4" />
              </Button>
            )}
            
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(post)}
              title="Delete"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PostCard

