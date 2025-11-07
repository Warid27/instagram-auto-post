import { Play, Square, RefreshCw, Trash2 } from 'lucide-react'
import { Button } from './ui/Button'
import { Card, CardContent } from './ui/Card'

const BotControls = ({ 
  status, 
  onStart, 
  onStop, 
  onForceCheck, 
  onClearLogs,
  disabled = false 
}) => {
  return (
    <Card>
      <CardContent className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Bot Controls</h3>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {status === 'running' || status === 'processing' ? (
            <Button
              variant="danger"
              onClick={onStop}
              disabled={disabled}
              className="w-full"
            >
              <Square className="w-4 h-4 mr-2" />
              Stop Bot
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={onStart}
              disabled={disabled}
              className="w-full"
            >
              <Play className="w-4 h-4 mr-2" />
              Start Bot
            </Button>
          )}

          <Button
            variant="outline"
            onClick={onForceCheck}
            disabled={disabled || (status !== 'running' && status !== 'processing')}
            className="w-full"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Force Check
          </Button>

          <Button
            variant="outline"
            onClick={onClearLogs}
            disabled={disabled}
            className="w-full"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Clear Logs
          </Button>
        </div>

        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-xs text-blue-800">
            <strong>Note:</strong> Bot controls require the bot service to be running and 
            configured to accept remote commands. Ensure the bot API is accessible.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

export default BotControls

