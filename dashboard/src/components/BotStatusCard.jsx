import { useState, useEffect } from 'react'
import { Loader2, CheckCircle, XCircle, AlertCircle, Activity } from 'lucide-react'
import { Card, CardContent } from './ui/Card'
import { Badge } from './ui/Badge'
import { formatDistanceToNow } from 'date-fns'

const BotStatusCard = ({ status, lastActivity, currentTask, progress }) => {
  const [timeSince, setTimeSince] = useState('')

  useEffect(() => {
    if (!lastActivity) return

    const updateTime = () => {
      try {
        const time = formatDistanceToNow(new Date(lastActivity), { addSuffix: true })
        setTimeSince(time)
      } catch {
        setTimeSince('Never')
      }
    }

    updateTime()
    const interval = setInterval(updateTime, 1000)

    return () => clearInterval(interval)
  }, [lastActivity])

  const statusConfig = {
    running: {
      icon: CheckCircle,
      color: 'text-green-600 bg-green-100',
      badge: 'success',
      label: 'Running',
      pulse: true,
    },
    stopped: {
      icon: AlertCircle,
      color: 'text-gray-600 bg-gray-100',
      badge: 'default',
      label: 'Stopped',
      pulse: false,
    },
    error: {
      icon: XCircle,
      color: 'text-red-600 bg-red-100',
      badge: 'error',
      label: 'Error',
      pulse: false,
    },
    processing: {
      icon: Loader2,
      color: 'text-blue-600 bg-blue-100',
      badge: 'info',
      label: 'Processing',
      pulse: true,
    },
  }

  const config = statusConfig[status] || statusConfig.stopped
  const Icon = config.icon

  return (
    <Card className="border-2 border-purple-200">
      <CardContent className="p-6">
        <div className="space-y-4">
          {/* Status Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className={`p-3 rounded-lg ${config.color} ${config.pulse && 'animate-pulse'}`}>
                <Icon className={`w-6 h-6 ${config.icon === Loader2 ? 'animate-spin' : ''}`} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Bot Status</h3>
                <Badge variant={config.badge} className="mt-1">
                  {config.label}
                </Badge>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">Last Activity</p>
              <p className="text-sm font-medium text-gray-900">
                {lastActivity ? timeSince : 'Never'}
              </p>
            </div>
          </div>

          {/* Current Task */}
          {currentTask && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700">Current Task</p>
                <Activity className="w-4 h-4 text-purple-600 animate-pulse" />
              </div>
              <p className="text-sm text-gray-900">{currentTask}</p>
              
              {/* Progress Bar */}
              {progress !== null && progress !== undefined && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-600">Progress</span>
                    <span className="text-gray-900 font-medium">{progress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-purple-600 to-pink-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {!currentTask && (
            <div className="text-center py-4 text-gray-500 text-sm">
              <p>No active task</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default BotStatusCard

