import { Plus, User, CheckCircle, XCircle } from 'lucide-react'

const Accounts = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Accounts</h1>
          <p className="mt-2 text-gray-600">Manage your Instagram accounts</p>
        </div>
        <button className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all shadow-sm">
          <Plus className="w-5 h-5" />
          <span>Add Account</span>
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-6">
          <div className="text-center py-12 text-gray-500">
            <User className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p className="text-lg font-medium">No accounts yet</p>
            <p className="text-sm mt-2">Add your first Instagram account to get started</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Accounts

