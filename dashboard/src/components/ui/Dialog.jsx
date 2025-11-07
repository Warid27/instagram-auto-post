import { useEffect } from 'react'
import { X } from 'lucide-react'

export const Dialog = ({ open, onOpenChange, children, title, description }) => {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={() => onOpenChange(false)}
      />
      
      {/* Dialog */}
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md mx-4 animate-in fade-in-0 zoom-in-95 duration-200">
        {/* Header */}
        {(title || description) && (
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-start justify-between">
              <div>
                {title && (
                  <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
                )}
                {description && (
                  <p className="mt-1 text-sm text-gray-500">{description}</p>
                )}
              </div>
              <button
                onClick={() => onOpenChange(false)}
                className="text-gray-400 hover:text-gray-500 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
        
        {/* Content */}
        <div className="px-6 py-4">{children}</div>
      </div>
    </div>
  )
}

