import { useState } from 'react'
import { Calendar, Clock } from 'lucide-react'

const SchedulingOptions = ({ scheduleType, onScheduleTypeChange, scheduledAt, onScheduledAtChange }) => {
  const getTimezone = () => {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  }

  const getMinDateTime = () => {
    const now = new Date()
    now.setMinutes(now.getMinutes() + 1) // At least 1 minute from now
    // Format for datetime-local input (YYYY-MM-DDTHH:mm)
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const hours = String(now.getHours()).padStart(2, '0')
    const minutes = String(now.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day}T${hours}:${minutes}`
  }

  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium text-gray-700">
        Scheduling
      </label>

      <div className="space-y-3">
        <label className="flex items-center space-x-3 p-4 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
          <input
            type="radio"
            name="scheduleType"
            value="now"
            checked={scheduleType === 'now'}
            onChange={(e) => onScheduleTypeChange(e.target.value)}
            className="w-4 h-4 text-purple-600 focus:ring-purple-500"
          />
          <Clock className="w-5 h-5 text-gray-400" />
          <div>
            <span className="font-medium text-gray-900">Post Now</span>
            <p className="text-sm text-gray-500">Add to queue immediately</p>
          </div>
        </label>

        <label className="flex items-center space-x-3 p-4 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
          <input
            type="radio"
            name="scheduleType"
            value="later"
            checked={scheduleType === 'later'}
            onChange={(e) => onScheduleTypeChange(e.target.value)}
            className="w-4 h-4 text-purple-600 focus:ring-purple-500"
          />
          <Calendar className="w-5 h-5 text-gray-400" />
          <div>
            <span className="font-medium text-gray-900">Schedule for Later</span>
            <p className="text-sm text-gray-500">Choose date and time</p>
          </div>
        </label>
      </div>

      {scheduleType === 'later' && (
        <div className="space-y-2">
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => onScheduledAtChange(e.target.value)}
            min={getMinDateTime()}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 focus:border-transparent"
          />
          <p className="text-xs text-gray-500">
            Timezone: {getTimezone()}
          </p>
        </div>
      )}
    </div>
  )
}

export default SchedulingOptions

