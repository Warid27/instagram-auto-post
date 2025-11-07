import { Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react'

const Queue = () => {
  const statusIcons = {
    pending: { icon: Clock, color: 'text-yellow-600 bg-yellow-100' },
    completed: { icon: CheckCircle, color: 'text-green-600 bg-green-100' },
    failed: { icon: XCircle, color: 'text-red-600 bg-red-100' },
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Post Queue</h1>
        <p className="mt-2 text-gray-600">View and manage your scheduled posts</p>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">All Posts</h2>
            <div className="flex space-x-2">
              <button className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
                All
              </button>
              <button className="px-3 py-1 text-sm text-gray-700 rounded-lg hover:bg-gray-100">
                Pending
              </button>
              <button className="px-3 py-1 text-sm text-gray-700 rounded-lg hover:bg-gray-100">
                Completed
              </button>
            </div>
          </div>
        </div>
        <div className="p-6">
          <div className="text-center py-12 text-gray-500">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p className="text-lg font-medium">No posts in queue</p>
            <p className="text-sm mt-2">Create a new post to add it to the queue</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Queue

