import { useState, useEffect } from 'react'
import { CheckSquare, Square, Instagram } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Loader2 } from 'lucide-react'

const AccountSelector = ({ selectedAccounts, onSelectionChange }) => {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()

  useEffect(() => {
    if (!user) return

    const fetchAccounts = async () => {
      try {
        const { data, error } = await supabase
          .from('accounts')
          .select('id, instagram_username, is_active')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .order('instagram_username', { ascending: true })

        if (error) throw error

        setAccounts(data || [])
      } catch (error) {
        console.error('Error fetching accounts:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchAccounts()

    // Subscribe to changes
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

  const handleSelectAll = () => {
    if (selectedAccounts.length === accounts.length) {
      onSelectionChange([])
    } else {
      onSelectionChange(accounts.map((acc) => acc.id))
    }
  }

  const handleToggle = (accountId) => {
    if (selectedAccounts.includes(accountId)) {
      onSelectionChange(selectedAccounts.filter((id) => id !== accountId))
    } else {
      onSelectionChange([...selectedAccounts, accountId])
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <label className="block text-sm font-medium text-gray-700">
          Select Accounts
        </label>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 text-purple-600 animate-spin" />
        </div>
      </div>
    )
  }

  if (accounts.length === 0) {
    return (
      <div className="space-y-4">
        <label className="block text-sm font-medium text-gray-700">
          Select Accounts
        </label>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-yellow-800">
            No active accounts found. Please add an account first.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700">
          Select Accounts
        </label>
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={handleSelectAll}
            className="flex items-center space-x-1 px-3 py-1 text-sm text-purple-600 hover:text-purple-700"
          >
            {selectedAccounts.length === accounts.length ? (
              <CheckSquare className="w-4 h-4" />
            ) : (
              <Square className="w-4 h-4" />
            )}
            <span>Select All</span>
          </button>
          <span className="text-sm text-gray-500">
            ({selectedAccounts.length} selected)
          </span>
        </div>
      </div>

      <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 max-h-64 overflow-y-auto">
        <div className="space-y-2">
          {accounts.map((account) => {
            const isSelected = selectedAccounts.includes(account.id)
            return (
              <label
                key={account.id}
                className={`
                  flex items-center space-x-3 p-3 rounded-lg cursor-pointer transition-colors
                  ${isSelected ? 'bg-purple-50 border border-purple-200' : 'hover:bg-white'}
                `}
              >
                <div className="flex items-center space-x-2 flex-1">
                  {isSelected ? (
                    <CheckSquare className="w-5 h-5 text-purple-600" />
                  ) : (
                    <Square className="w-5 h-5 text-gray-400" />
                  )}
                  <div className="w-8 h-8 bg-gradient-to-br from-purple-600 to-pink-600 rounded-full flex items-center justify-center">
                    <Instagram className="w-4 h-4 text-white" />
                  </div>
                  <span className="font-medium text-gray-900">
                    @{account.instagram_username}
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => handleToggle(account.id)}
                  className="sr-only"
                />
              </label>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default AccountSelector

