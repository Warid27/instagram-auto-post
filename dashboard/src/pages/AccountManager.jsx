import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { api } from '../lib/api'
import { Card, CardContent } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Dialog } from '../components/ui/Dialog'
import { Input } from '../components/ui/Input'
import { Badge } from '../components/ui/Badge'
import {
  Plus,
  Instagram,
  Edit,
  Trash2,
  Loader2,
  User,
  Calendar,
  FileText,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

const AccountManager = () => {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    instagram_username: '',
    password: '',
  })
  const [formErrors, setFormErrors] = useState({})
  const { user } = useAuth()
  const toast = useToast()

  // Fetch accounts
  const fetchAccounts = async () => {
    if (!user) return

    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (error) throw error

      setAccounts(data || [])
    } catch (error) {
      console.error('Error fetching accounts:', error)
      toast.error('Error', 'Failed to load accounts. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Real-time subscription
  useEffect(() => {
    if (!user) return

    fetchAccounts()

    const channel = supabase
      .channel('accounts-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'accounts',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchAccounts()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user])

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormErrors({})

    // Validation
    const errors = {}
    if (!formData.instagram_username.trim()) {
      errors.instagram_username = 'Instagram username is required'
    }
    if (!formData.password.trim()) {
      errors.password = 'Password is required'
    }
    if (formData.password.length < 6) {
      errors.password = 'Password must be at least 6 characters'
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      return
    }

    setIsSubmitting(true)

    try {
      // Call backend API to encrypt password and save account
      const { data, error } = await api.post('/accounts', {
        instagram_username: formData.instagram_username.trim(),
        password: formData.password,
      })

      if (error) {
        throw new Error(error)
      }

      toast.success('Success', 'Instagram account added successfully!')
      setIsDialogOpen(false)
      setFormData({ instagram_username: '', password: '' })
      setFormErrors({})
      
      // Refresh accounts list
      await fetchAccounts()
    } catch (error) {
      console.error('Error adding account:', error)
      toast.error('Error', error.message || 'Failed to add account. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle account deletion
  const handleDelete = async (accountId, username) => {
    if (!confirm(`Are you sure you want to remove ${username}?`)) {
      return
    }

    try {
      const { error } = await supabase
        .from('accounts')
        .delete()
        .eq('id', accountId)
        .eq('user_id', user.id)

      if (error) throw error

      toast.success('Success', `Account ${username} removed successfully`)
      fetchAccounts()
    } catch (error) {
      console.error('Error deleting account:', error)
      toast.error('Error', 'Failed to remove account. Please try again.')
    }
  }

  // Handle account edit (placeholder for now)
  const handleEdit = (account) => {
    toast.info('Coming Soon', 'Edit functionality will be available soon.')
  }

  // Format last post timestamp
  const formatLastPost = (timestamp) => {
    if (!timestamp) return 'Never'
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true })
    } catch {
      return 'Invalid date'
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Account Manager</h1>
          <p className="mt-2 text-gray-600">Manage your connected Instagram accounts</p>
        </div>
        <Button
          onClick={() => setIsDialogOpen(true)}
          className="flex items-center space-x-2"
        >
          <Plus className="w-5 h-5" />
          <span>Add Account</span>
        </Button>
      </div>

      {/* Loading State */}
      {loading ? (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center">
              <Loader2 className="w-8 h-8 text-purple-600 animate-spin mb-4" />
              <p className="text-gray-600">Loading accounts...</p>
            </div>
          </CardContent>
        </Card>
      ) : accounts.length === 0 ? (
        /* Empty State */
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-purple-600 to-pink-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Instagram className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                No accounts yet
              </h3>
              <p className="text-gray-600 mb-6">
                Add your first Instagram account to start automating posts
              </p>
              <Button onClick={() => setIsDialogOpen(true)}>
                <Plus className="w-5 h-5 mr-2" />
                Add Your First Account
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        /* Accounts Grid */
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {accounts.map((account) => (
            <Card
              key={account.id}
              className="hover:shadow-md transition-shadow duration-200"
            >
              <CardContent className="p-6">
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-purple-600 via-pink-600 to-orange-500 rounded-full flex items-center justify-center">
                      <Instagram className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        @{account.instagram_username}
                      </h3>
                      <Badge
                        variant={account.is_active ? 'success' : 'default'}
                        className="mt-1"
                      >
                        {account.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Stats */}
                <div className="space-y-3 mb-4">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center text-gray-600">
                      <FileText className="w-4 h-4 mr-2" />
                      <span>Posts Today</span>
                    </div>
                    <span className="font-semibold text-gray-900">
                      {account.posts_today || 0}/25
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center text-gray-600">
                      <Calendar className="w-4 h-4 mr-2" />
                      <span>Last Post</span>
                    </div>
                    <span className="font-medium text-gray-900">
                      {formatLastPost(account.last_post_at)}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center space-x-2 pt-4 border-t border-gray-200">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(account)}
                    className="flex-1"
                  >
                    <Edit className="w-4 h-4 mr-1" />
                    Edit
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleDelete(account.id, account.instagram_username)}
                    className="flex-1"
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Remove
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Account Dialog */}
      <Dialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        title="Add Instagram Account"
        description="Enter your Instagram credentials to connect an account"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Instagram Username"
            type="text"
            placeholder="username"
            value={formData.instagram_username}
            onChange={(e) =>
              setFormData({ ...formData, instagram_username: e.target.value })
            }
            error={formErrors.instagram_username}
            disabled={isSubmitting}
            required
          />

          <Input
            label="Password"
            type="password"
            placeholder="Enter your password"
            value={formData.password}
            onChange={(e) =>
              setFormData({ ...formData, password: e.target.value })
            }
            error={formErrors.password}
            disabled={isSubmitting}
            required
          />

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-xs text-blue-800">
              <strong>Note:</strong> Your password will be encrypted before
              storage. We use industry-standard encryption to keep your
              credentials secure.
            </p>
          </div>

          <div className="flex items-center justify-end space-x-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsDialogOpen(false)
                setFormData({ instagram_username: '', password: '' })
                setFormErrors({})
              }}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" loading={isSubmitting}>
              Save Account
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  )
}

export default AccountManager

