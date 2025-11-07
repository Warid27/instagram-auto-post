import { supabase } from './supabase'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

// Cache for CSRF token
let csrfTokenCache = null
let csrfTokenPromise = null

// Fetch CSRF token from backend
async function getCsrfToken() {
  // Return cached token if available
  if (csrfTokenCache) {
    return csrfTokenCache
  }

  // If a request is already in progress, wait for it
  if (csrfTokenPromise) {
    return csrfTokenPromise
  }

  // Fetch new token
  csrfTokenPromise = fetch(`${API_URL}/csrf-token`, {
    method: 'GET',
    credentials: 'include', // Important: include cookies
  })
    .then(async (res) => {
      if (!res.ok) {
        throw new Error('Failed to fetch CSRF token')
      }
      const data = await res.json()
      csrfTokenCache = data.csrfToken
      return csrfTokenCache
    })
    .finally(() => {
      csrfTokenPromise = null
    })

  return csrfTokenPromise
}

// Clear CSRF token cache (useful on logout)
function clearCsrfToken() {
  csrfTokenCache = null
  csrfTokenPromise = null
}

export const api = {
  async request(endpoint, options = {}) {
    const url = `${API_URL}${endpoint}`
    
    // Get current session for authentication
    const { data: { session } } = await supabase.auth.getSession()
    
    // Determine if this is a state-changing request that needs CSRF token
    const method = (options.method || 'GET').toUpperCase()
    const needsCsrf = method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS'
    
    // Get CSRF token for state-changing requests
    let csrfToken = null
    if (needsCsrf) {
      try {
        csrfToken = await getCsrfToken()
      } catch (error) {
        console.error('Failed to get CSRF token:', error)
        // Continue without token - will fail with 403, but at least we tried
      }
    }
    
    const config = {
      credentials: 'include', // Important: include cookies for CSRF
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token && {
          Authorization: `Bearer ${session.access_token}`
        }),
        ...(csrfToken && {
          'x-csrf-token': csrfToken
        }),
        ...options.headers,
      },
      ...options,
    }

    const maxRetries = options.retries ?? 2
    const baseDelay = options.retryDelayMs ?? 400

    let attempt = 0
    let lastError = null
    let shouldRefreshCsrf = false
    
    while (attempt <= maxRetries) {
      try {
        // Refresh CSRF token if previous attempt failed with CSRF error
        if (shouldRefreshCsrf && needsCsrf) {
          csrfTokenCache = null // Clear cache
          try {
            csrfToken = await getCsrfToken()
            config.headers['x-csrf-token'] = csrfToken
          } catch (error) {
            console.error('Failed to refresh CSRF token:', error)
          }
          shouldRefreshCsrf = false
        }
        
        const started = performance.now()
        const response = await fetch(url, config)
        const durationMs = Math.round(performance.now() - started)
        let data
        try { data = await response.json() } catch { data = null }

        if (!response.ok) {
          // Check if it's a CSRF token error
          if (response.status === 403 && (data?.message?.includes('csrf') || data?.code === 'FORBIDDEN')) {
            // Clear CSRF token cache and retry once
            if (needsCsrf && !shouldRefreshCsrf) {
              csrfTokenCache = null
              shouldRefreshCsrf = true
              attempt-- // Don't count this as an attempt
              continue
            }
          }
          
          const errMessage = (data?.message || data?.error || response.statusText || 'Request failed')
          const err = new Error(errMessage)
          err.status = response.status
          err.code = data?.code
          throw err
        }

        return { data, error: null, durationMs }
      } catch (error) {
        lastError = error
        // retry on network errors and 5xx
        const status = error?.status
        const shouldRetry = (!status || (status >= 500 && status < 600)) && attempt < maxRetries
        if (!shouldRetry) break
        const delay = baseDelay * Math.pow(2, attempt)
        await new Promise(r => setTimeout(r, delay))
        attempt++
      }
    }
    return { data: null, error: lastError?.message || 'Network error', code: lastError?.code, status: lastError?.status }
  },

  async get(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'GET' })
  },

  async post(endpoint, body, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  async put(endpoint, body, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(body),
    })
  },

  async delete(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'DELETE' })
  },

  // Clear CSRF token cache (call this on logout)
  clearCsrfToken,
}

