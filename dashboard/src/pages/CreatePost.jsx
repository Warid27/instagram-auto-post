import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import ImageUpload from '../components/ImageUpload'
import CaptionEditor from '../components/CaptionEditor'
import AccountSelector from '../components/AccountSelector'
import SchedulingOptions from '../components/SchedulingOptions'
import { Button } from '../components/ui/Button'
import { Card, CardContent } from '../components/ui/Card'
import { Dialog } from '../components/ui/Dialog'
import { Loader2, AlertCircle, LogIn } from 'lucide-react'
import { api } from '../lib/api'

const CreatePost = () => {
  const [formData, setFormData] = useState({
    imageUrl: '',
    imagePath: '',
    caption: '',
    selectedAccounts: [],
    scheduleType: 'now',
    scheduledAt: '',
  })
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [checkingLogin, setCheckingLogin] = useState(false)
  const [showReloginDialog, setShowReloginDialog] = useState(false)
  const [accountsNeedingRelogin, setAccountsNeedingRelogin] = useState([])
  const { user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const validateForm = () => {
    const newErrors = {}

    if (!formData.imageUrl) {
      newErrors.imageUrl = 'Please upload an image'
    }

    if (!formData.caption.trim()) {
      newErrors.caption = 'Please enter a caption'
    }

    if (formData.selectedAccounts.length === 0) {
      newErrors.selectedAccounts = 'Please select at least one account'
    }

    if (formData.scheduleType === 'later' && !formData.scheduledAt) {
      newErrors.scheduledAt = 'Please select a date and time'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleImageUploaded = (url, path) => {
    setFormData({ ...formData, imageUrl: url, imagePath: path })
    setErrors({ ...errors, imageUrl: '' })
  }

  const handleImageRemoved = () => {
    setFormData({ ...formData, imageUrl: '', imagePath: '' })
  }

  // Check if selected accounts are logged in
  const checkAccountLoginStatus = async (accountIds) => {
    setCheckingLogin(true)
    const accountsNeedingLogin = []

    try {
      for (const accountId of accountIds) {
        const { data, error } = await api.get(`/accounts/${accountId}/check-login`)
        
        if (error) {
          console.error(`Error checking login for account ${accountId}:`, error)
          // Assume not logged in if check fails
          accountsNeedingLogin.push({
            id: accountId,
            username: 'Unknown',
            error: error
          })
          continue
        }

        if (!data.isLoggedIn) {
          accountsNeedingLogin.push({
            id: accountId,
            username: data.account.instagram_username,
            hasCookies: data.hasCookies,
            isExpired: data.isExpired
          })
        }
      }
    } catch (error) {
      console.error('Error checking account login status:', error)
      toast.error('Error', 'Failed to check account login status')
    } finally {
      setCheckingLogin(false)
    }

    return accountsNeedingLogin
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!validateForm()) {
      toast.error('Validation Error', 'Please fix the errors in the form')
      return
    }

    // Check account login status before submitting
    setCheckingLogin(true)
    const accountsNeedingLogin = await checkAccountLoginStatus(formData.selectedAccounts)
    
    if (accountsNeedingLogin.length > 0) {
      setAccountsNeedingRelogin(accountsNeedingLogin)
      setShowReloginDialog(true)
      setCheckingLogin(false)
      return
    }

    setCheckingLogin(false)
    await proceedWithPost()
  }

  const proceedWithPost = async () => {
    setSubmitting(true)

    try {
      // Calculate scheduled_at timestamp
      let scheduledAt = new Date().toISOString()
      if (formData.scheduleType === 'later' && formData.scheduledAt) {
        scheduledAt = new Date(formData.scheduledAt).toISOString()
      }

      // Create post
      const { data: post, error: postError } = await supabase
        .from('posts')
        .insert({
          user_id: user.id,
          image_url: formData.imageUrl,
          caption: formData.caption.trim(),
          status: 'pending',
          scheduled_at: scheduledAt,
        })
        .select()
        .single()

      if (postError) throw postError

      // Create post_accounts entries
      const postAccounts = formData.selectedAccounts.map((accountId) => ({
        post_id: post.id,
        account_id: accountId,
        status: 'pending',
      }))

      const { error: postAccountsError } = await supabase
        .from('post_accounts')
        .insert(postAccounts)

      if (postAccountsError) throw postAccountsError

      toast.success('Success', 'Post added to queue successfully!')
      
      // Reset form
      setFormData({
        imageUrl: '',
        imagePath: '',
        caption: '',
        selectedAccounts: [],
        scheduleType: 'now',
        scheduledAt: '',
      })
      setErrors({})

      // Navigate to queue after a short delay
      setTimeout(() => {
        navigate('/queue')
      }, 1500)
    } catch (error) {
      console.error('Error creating post:', error)
      toast.error('Error', error.message || 'Failed to create post. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRelogin = async () => {
    setCheckingLogin(true)
    try {
      // Try to re-login all accounts
      const reloginPromises = accountsNeedingRelogin.map(async (account) => {
        try {
          const { data, error } = await api.post(`/accounts/${account.id}/re-login`)
          if (error) throw new Error(error)
          return { success: true, account: account.id }
        } catch (error) {
          console.error(`Failed to re-login ${account.username}:`, error)
          return { success: false, account: account.id, error: error.message }
        }
      })

      const results = await Promise.all(reloginPromises)
      const successCount = results.filter(r => r.success).length

      if (successCount === accountsNeedingRelogin.length) {
        toast.success('Success', 'All accounts re-logged in successfully!')
        setShowReloginDialog(false)
        // Re-check login status
        const stillNeedingLogin = await checkAccountLoginStatus(formData.selectedAccounts)
        if (stillNeedingLogin.length === 0) {
          await proceedWithPost()
        } else {
          setAccountsNeedingRelogin(stillNeedingLogin)
        }
      } else {
        toast.warning('Partial Success', `${successCount} of ${accountsNeedingRelogin.length} accounts re-logged in. Some may need manual attention.`)
        // Update the list to show only accounts that still need login
        const stillNeedingLogin = await checkAccountLoginStatus(formData.selectedAccounts)
        if (stillNeedingLogin.length === 0) {
          setShowReloginDialog(false)
          await proceedWithPost()
        } else {
          setAccountsNeedingRelogin(stillNeedingLogin)
        }
      }
    } catch (error) {
      console.error('Error during re-login:', error)
      toast.error('Error', 'Failed to re-login accounts. Please try again or go to Accounts page.')
    } finally {
      setCheckingLogin(false)
    }
  }

  const handleGoToAccounts = () => {
    setShowReloginDialog(false)
    navigate('/accounts')
  }

  const handleSkipRelogin = async () => {
    // User can choose to proceed anyway (bot will handle login or fail)
    setShowReloginDialog(false)
    await proceedWithPost()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Create Post</h1>
        <p className="mt-2 text-gray-600">
          Upload an image and schedule it for your Instagram accounts
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardContent className="p-6 space-y-6">
            {/* Image Upload */}
            <div>
              <ImageUpload
                onImageUploaded={handleImageUploaded}
                onImageRemoved={handleImageRemoved}
                initialUrl={formData.imageUrl}
              />
              {errors.imageUrl && (
                <p className="mt-2 text-sm text-red-600">{errors.imageUrl}</p>
              )}
            </div>

            {/* Caption Editor */}
            <div>
              <CaptionEditor
                value={formData.caption}
                onChange={(value) => {
                  setFormData({ ...formData, caption: value })
                  setErrors({ ...errors, caption: '' })
                }}
              />
              {errors.caption && (
                <p className="mt-2 text-sm text-red-600">{errors.caption}</p>
              )}
            </div>

            {/* Account Selection */}
            <div>
              <AccountSelector
                selectedAccounts={formData.selectedAccounts}
                onSelectionChange={(accounts) => {
                  setFormData({ ...formData, selectedAccounts: accounts })
                  setErrors({ ...errors, selectedAccounts: '' })
                }}
              />
              {errors.selectedAccounts && (
                <p className="mt-2 text-sm text-red-600">{errors.selectedAccounts}</p>
              )}
            </div>

            {/* Scheduling Options */}
            <div>
              <SchedulingOptions
                scheduleType={formData.scheduleType}
                onScheduleTypeChange={(type) => {
                  setFormData({ ...formData, scheduleType: type })
                  setErrors({ ...errors, scheduledAt: '' })
                }}
                scheduledAt={formData.scheduledAt}
                onScheduledAtChange={(datetime) => {
                  setFormData({ ...formData, scheduledAt: datetime })
                  setErrors({ ...errors, scheduledAt: '' })
                }}
              />
              {errors.scheduledAt && (
                <p className="mt-2 text-sm text-red-600">{errors.scheduledAt}</p>
              )}
            </div>

            {/* Submit Button */}
            <div className="flex items-center justify-end space-x-3 pt-6 border-t border-gray-200">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/queue')}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" loading={submitting || checkingLogin} disabled={submitting || checkingLogin}>
                {checkingLogin ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Checking Accounts...
                  </>
                ) : submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Adding to Queue...
                  </>
                ) : (
                  'Add to Queue'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

      {/* Re-login Dialog */}
      <Dialog
        open={showReloginDialog}
        onOpenChange={setShowReloginDialog}
        title="Accounts Need Re-login"
        description="Some selected accounts are not logged in. Please re-login these accounts before posting."
      >
        <div className="space-y-4">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-yellow-800 font-medium mb-1">
                  Login Required
                </p>
                <p className="text-xs text-yellow-700">
                  The following accounts need to be re-logged in. Click "Re-login Now" to automatically log them in, or go to the Accounts page to update credentials.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">Accounts needing re-login:</p>
            <div className="border border-gray-200 rounded-lg divide-y divide-gray-200">
              {accountsNeedingRelogin.map((account) => (
                <div key={account.id} className="p-3 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-purple-600 to-pink-600 rounded-full flex items-center justify-center">
                      <span className="text-white text-xs font-semibold">
                        @{account.username.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        @{account.username}
                      </p>
                      <p className="text-xs text-gray-500">
                        {account.isExpired ? 'Cookies expired' : account.hasCookies ? 'Invalid cookies' : 'No cookies'}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200">
            <Button
              type="button"
              variant="outline"
              onClick={handleSkipRelogin}
              disabled={checkingLogin}
            >
              Proceed Anyway
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleGoToAccounts}
              disabled={checkingLogin}
            >
              Go to Accounts
            </Button>
            <Button
              type="button"
              onClick={handleRelogin}
              loading={checkingLogin}
              disabled={checkingLogin}
              className="flex items-center space-x-2"
            >
              <LogIn className="w-4 h-4" />
              <span>Re-login Now</span>
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}

export default CreatePost

