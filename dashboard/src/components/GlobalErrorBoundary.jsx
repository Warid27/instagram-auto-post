import { Component } from 'react'
import { useToast } from '../contexts/ToastContext'

function ErrorFallback({ error }) {
  const toast = useToast()
  // Show once on mount
  if (error) {
    try { toast.error('Something went wrong', error.message || 'Unexpected error') } catch {}
  }
  return (
    <div className="p-6 text-red-700 bg-red-50 border border-red-200 rounded-md">
      <p className="font-semibold">An unexpected error occurred.</p>
      <p className="text-sm mt-1">Please try again. If the problem persists, contact support.</p>
    </div>
  )
}

export class GlobalErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    // Optionally send to monitoring
    // eslint-disable-next-line no-console
    console.error('Global error boundary caught:', { error, errorInfo })
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback error={this.state.error} />
    }
    return this.props.children
  }
}

export default GlobalErrorBoundary


