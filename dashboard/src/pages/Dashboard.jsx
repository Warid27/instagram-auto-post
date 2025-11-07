import { BarChart3, Clock, CheckCircle, XCircle } from 'lucide-react'

const Dashboard = () => {
  const stats = [
    { name: 'Pending Posts', value: '12', icon: Clock, color: 'text-yellow-600 bg-yellow-100' },
    { name: 'Completed Today', value: '8', icon: CheckCircle, color: 'text-green-600 bg-green-100' },
    { name: 'Active Accounts', value: '3', icon: BarChart3, color: 'text-blue-600 bg-blue-100' },
    { name: 'Failed Posts', value: '2', icon: XCircle, color: 'text-red-600 bg-red-100' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-2 text-gray-600">Overview of your Instagram automation</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
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

      {/* Recent Posts */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Recent Posts</h2>
        </div>
        <div className="p-6">
          <div className="text-center py-12 text-gray-500">
            <p>No recent posts to display</p>
            <p className="text-sm mt-2">Create your first post to get started</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Dashboard

