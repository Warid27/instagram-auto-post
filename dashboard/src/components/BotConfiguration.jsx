import { useState } from 'react'
import { Save, Settings } from 'lucide-react'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { Card, CardContent } from './ui/Card'

const BotConfiguration = ({ config, onSave, loading = false }) => {
  const [localConfig, setLocalConfig] = useState(config || {
    postsPerHour: 5,
    delayBetweenPosts: 120000,
    autoRetry: true,
  })

  const handleChange = (field, value) => {
    setLocalConfig({
      ...localConfig,
      [field]: typeof value === 'boolean' ? value : parseInt(value) || 0,
    })
  }

  const handleSave = () => {
    onSave(localConfig)
  }

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-2">
            <Settings className="w-5 h-5 text-purple-600" />
            <h3 className="text-lg font-semibold text-gray-900">Configuration</h3>
          </div>
          <Button
            onClick={handleSave}
            loading={loading}
            disabled={loading}
          >
            <Save className="w-4 h-4 mr-2" />
            Save Changes
          </Button>
        </div>

        <div className="space-y-6">
          {/* Posts Per Hour */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Posts Per Hour Limit
            </label>
            <Input
              type="number"
              min="1"
              max="25"
              value={localConfig.postsPerHour}
              onChange={(e) => handleChange('postsPerHour', e.target.value)}
              placeholder="5"
            />
            <p className="mt-1 text-xs text-gray-500">
              Maximum number of posts the bot can process per hour
            </p>
          </div>

          {/* Delay Between Posts */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Delay Between Posts (milliseconds)
            </label>
            <Input
              type="number"
              min="60000"
              step="1000"
              value={localConfig.delayBetweenPosts}
              onChange={(e) => handleChange('delayBetweenPosts', e.target.value)}
              placeholder="120000"
            />
            <p className="mt-1 text-xs text-gray-500">
              Minimum delay between posts (recommended: 120000ms = 2 minutes)
            </p>
          </div>

          {/* Auto Retry */}
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">
                Enable Auto-Retry
              </label>
              <p className="text-xs text-gray-500">
                Automatically retry failed posts after a delay
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={localConfig.autoRetry}
                onChange={(e) => handleChange('autoRetry', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
            </label>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default BotConfiguration

