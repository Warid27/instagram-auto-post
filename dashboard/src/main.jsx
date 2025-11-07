import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { ToastProvider } from './contexts/ToastContext.jsx'
import GlobalErrorBoundary from './components/GlobalErrorBoundary.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ToastProvider>
      <GlobalErrorBoundary>
        <App />
      </GlobalErrorBoundary>
    </ToastProvider>
  </React.StrictMode>,
)
