import { useEffect, useRef } from 'react'
import { CheckCircle, XCircle, Info, AlertCircle, Clock } from 'lucide-react'
import { Card, CardContent } from './ui/Card'
import { formatDistanceToNow } from 'date-fns'

const ActivityLog = ({ activities, onClear }) => {
  const logEndRef = useRef(null)

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

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Activity Log</h3>
          {activities.length > 0 && (
            <button
              onClick={onClear}
              className="text-sm text-purple-600 hover:text-purple-700 font-medium"
            >
              Clear Log
            </button>
          )}
        </div>

        <div className="bg-gray-900 rounded-lg p-4 h-96 overflow-y-auto font-mono text-sm">
          {activities.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <Clock className="w-8 h-8 mx-auto mb-2 text-gray-600" />
                <p>No activity yet</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {activities.map((activity, index) => {
                const { icon: Icon, color } = getActivityIcon(activity.type)
                const timestamp = activity.timestamp ? new Date(activity.timestamp) : new Date()
                
                return (
                  <div
                    key={index}
                    className="flex items-start space-x-3 py-2 border-b border-gray-800 last:border-0"
                  >
                    <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${color}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className="text-gray-400">
                          [{timestamp.toLocaleTimeString()}]
                        </span>
                        <span className="text-gray-300">{activity.message}</span>
                      </div>
                      {activity.details && (
                        <p className="text-gray-500 text-xs mt-1 ml-6">
                          {activity.details}
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

