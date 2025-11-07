import { TrendingUp, Clock, CheckCircle2, Calendar } from 'lucide-react'
import { Card, CardContent } from './ui/Card'

const BotStatistics = ({ stats }) => {
  const statItems = [
    {
      label: 'Posts Processed Today',
      value: stats.postsProcessedToday || 0,
      icon: CheckCircle2,
      color: 'text-green-600 bg-green-100',
      suffix: 'posts',
    },
    {
      label: 'Success Rate',
      value: stats.successRate || 0,
      icon: TrendingUp,
      color: 'text-blue-600 bg-blue-100',
      suffix: '%',
      format: (val) => val.toFixed(1),
    },
    {
      label: 'Avg Time Per Post',
      value: stats.avgTimePerPost || 0,
      icon: Clock,
      color: 'text-purple-600 bg-purple-100',
      suffix: 'sec',
      format: (val) => val.toFixed(1),
    },
    {
      label: 'Next Check',
      value: stats.nextCheckTime,
      icon: Calendar,
      color: 'text-orange-600 bg-orange-100',
      suffix: '',
      format: (val) => {
        if (!val) return 'Not scheduled'
        try {
          const date = new Date(val)
          const now = new Date()
          const diff = Math.floor((date - now) / 1000)
          
          if (diff < 60) return `${diff}s`
          if (diff < 3600) return `${Math.floor(diff / 60)}m`
          return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`
        } catch {
          return 'Invalid'
        }
      },
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {statItems.map((stat) => {
        const Icon = stat.icon
        const displayValue = stat.format
          ? stat.format(stat.value)
          : stat.value?.toLocaleString() || '0'
        
        return (
          <Card key={stat.label}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600">{stat.label}</p>
                  <div className="mt-2 flex items-baseline space-x-1">
                    <p className="text-2xl font-bold text-gray-900">{displayValue}</p>
                    {stat.suffix && (
                      <p className="text-sm text-gray-500">{stat.suffix}</p>
                    )}
                  </div>
                </div>
                <div className={`p-3 rounded-lg ${stat.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

export default BotStatistics

