import { useEffect, useRef, useState, useMemo } from 'react'
import { CheckCircle, XCircle, Info, AlertCircle, Clock, Filter, Search, X } from 'lucide-react'
import { Card, CardContent } from './ui/Card'
import { formatDistanceToNow } from 'date-fns'
import { Input } from './ui/Input'

const ActivityLog = ({ activities, onClear }) => {
  const logEndRef = useRef(null)
  const [filter, setFilter] = useState('all') // 'all', 'success', 'error', 'warning', 'info'
  const [searchQuery, setSearchQuery] = useState('')

  const scrollToBottom = () => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [activities])

  const getActivityIcon = (type) => {
    switch (type) {
      case 'success':
        return { icon: CheckCircle, color: 'text-green-600' }
      case 'error':
        return { icon: XCircle, color: 'text-red-600' }
      case 'warning':
        return { icon: AlertCircle, color: 'text-yellow-600' }
      default:
        return { icon: Info, color: 'text-blue-600' }
    }
  }

  const formatTime = (timestamp) => {
    if (!timestamp) return 'Just now'
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true })
    } catch {
      return 'Invalid time'
    }
  }

  // Filter and search activities
  const filteredActivities = useMemo(() => {
    let filtered = activities

    // Apply type filter
    if (filter !== 'all') {
      filtered = filtered.filter(activity => activity.type === filter)
    }

    // Apply search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(activity => {
        const message = (activity.message || '').toLowerCase()
        const details = (activity.details || '').toLowerCase()
        const error = (activity.error || '').toLowerCase()
        return message.includes(query) || details.includes(query) || error.includes(query)
      })
    }

    return filtered
  }, [activities, filter, searchQuery])

  const formatDetails = (details) => {
    if (!details) return null
    try {
      // If details is a JSON string, parse it
      if (typeof details === 'string') {
        const parsed = JSON.parse(details)
        if (typeof parsed === 'object') {
          return Object.entries(parsed)
            .map(([key, value]) => `${key}: ${value}`)
            .join(', ')
        }
        return parsed
      }
      // If details is an object
      if (typeof details === 'object') {
        return Object.entries(details)
          .map(([key, value]) => `${key}: ${value}`)
          .join(', ')
      }
      return details
    } catch {
      return details
    }
  }

  const filterButtons = [
    { id: 'all', label: 'All', count: activities.length },
    { id: 'success', label: 'Success', count: activities.filter(a => a.type === 'success').length },
    { id: 'error', label: 'Errors', count: activities.filter(a => a.type === 'error').length },
    { id: 'warning', label: 'Warnings', count: activities.filter(a => a.type === 'warning').length },
    { id: 'info', label: 'Info', count: activities.filter(a => a.type === 'info').length },
  ]

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Activity Log</h3>
          <div className="flex items-center space-x-2">
            {activities.length > 0 && (
              <span className="text-sm text-gray-500">
                {filteredActivities.length} of {activities.length}
              </span>
            )}
            {activities.length > 0 && (
              <button
                onClick={onClear}
                className="text-sm text-purple-600 hover:text-purple-700 font-medium"
              >
                Clear Log
              </button>
            )}
          </div>
        </div>

        {/* Filters and Search */}
        {activities.length > 0 && (
          <div className="mb-4 space-y-3">
            {/* Filter Buttons */}
            <div className="flex flex-wrap gap-2">
              {filterButtons.map((btn) => (
                <button
                  key={btn.id}
                  onClick={() => setFilter(btn.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    filter === btn.id
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {btn.label} ({btn.count})
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Search logs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-10"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}

        <div className="bg-gray-900 rounded-lg p-4 h-96 overflow-y-auto font-mono text-sm">
          {activities.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <Clock className="w-8 h-8 mx-auto mb-2 text-gray-600" />
                <p>No activity yet</p>
              </div>
            </div>
          ) : filteredActivities.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <Filter className="w-8 h-8 mx-auto mb-2 text-gray-600" />
                <p>No logs match your filters</p>
                <button
                  onClick={() => {
                    setFilter('all')
                    setSearchQuery('')
                  }}
                  className="text-xs text-purple-400 hover:text-purple-300 mt-2"
                >
                  Clear filters
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredActivities.map((activity, index) => {
                const { icon: Icon, color } = getActivityIcon(activity.type)
                const timestamp = activity.timestamp ? new Date(activity.timestamp) : new Date()
                const formattedDetails = formatDetails(activity.details || activity.rawDetails)
                
                return (
                  <div
                    key={activity.id || index}
                    className="flex items-start space-x-3 py-2 border-b border-gray-800 last:border-0 hover:bg-gray-800/50 transition-colors"
                  >
                    <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${color}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 flex-wrap">
                        <span className="text-gray-400 text-xs">
                          [{timestamp.toLocaleTimeString()}]
                        </span>
                        <span className="text-gray-300">{activity.message}</span>
                      </div>
                      {formattedDetails && (
                        <p className="text-gray-500 text-xs mt-1 ml-6 break-words">
                          {formattedDetails}
                        </p>
                      )}
                      {activity.error && (
                        <p className="text-red-400 text-xs mt-1 ml-6 break-words">
                          Error: {activity.error}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
              <div ref={logEndRef} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default ActivityLog

