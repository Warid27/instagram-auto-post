import { Clock, Loader2, CheckCircle, XCircle } from 'lucide-react'
import { Card, CardContent } from './ui/Card'

const QueueStats = ({ stats }) => {
  const statItems = [
    {
      label: 'Pending',
      value: stats.pending || 0,
      icon: Clock,
      color: 'text-yellow-600 bg-yellow-100',
      borderColor: 'border-yellow-200',
    },
    {
      label: 'Processing',
      value: stats.processing || 0,
      icon: Loader2,
      color: 'text-blue-600 bg-blue-100',
      borderColor: 'border-blue-200',
    },
    {
      label: 'Posted Today',
      value: stats.posted || 0,
      icon: CheckCircle,
      color: 'text-green-600 bg-green-100',
      borderColor: 'border-green-200',
    },
    {
      label: 'Failed',
      value: stats.failed || 0,
      icon: XCircle,
      color: 'text-red-600 bg-red-100',
      borderColor: 'border-red-200',
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {statItems.map((stat) => {
        const Icon = stat.icon
        return (
          <Card key={stat.label} className={`border-2 ${stat.borderColor}`}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">{stat.label}</p>
                  <p className="mt-2 text-3xl font-bold text-gray-900">{stat.value}</p>
                </div>
                <div className={`p-3 rounded-lg ${stat.color}`}>
                  <Icon className={`w-6 h-6 ${stat.icon === Loader2 ? 'animate-spin' : ''}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

export default QueueStats

