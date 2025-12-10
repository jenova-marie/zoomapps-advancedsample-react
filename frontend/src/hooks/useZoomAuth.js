/* globals zoomSdk */
/**
 * useZoomAuth - OAuth flow hook for Zoom REST API access
 *
 * TIER 2: Required if you need to call Zoom REST APIs
 *
 * This hook handles:
 * - In-client OAuth flow with PKCE (zoomSdk.authorize)
 * - Guest mode authorization (zoomSdk.promptAuthorize)
 * - User context status tracking
 * - Authorization event handling
 *
 * Required backend endpoints:
 * - GET  /api/zoomapp/authorize    - Returns { codeChallenge, state } for PKCE
 * - POST /api/zoomapp/onauthorized - Exchanges code for access token
 *
 * Required capabilities:
 * ['authorize', 'onAuthorized', 'promptAuthorize', 'getUserContext', 'onMyUserContextChange']
 *
 * @param {Object} options - Configuration options
 * @param {string} options.authorizeEndpoint - Backend endpoint for PKCE challenge (default: '/api/zoomapp/authorize')
 * @param {string} options.tokenEndpoint - Backend endpoint for token exchange (default: '/api/zoomapp/onauthorized')
 * @param {Function} options.onAuthorized - Callback when authorization completes
 * @param {Function} options.onError - Callback when an error occurs
 *
 * @example
 * const { authorize, promptAuthorize, isAuthorized, isGuest, error } = useZoomAuth({
 *   onAuthorized: () => fetchUserData(),
 *   onError: (err) => console.error(err),
 * })
 */
import { useEffect, useState, useCallback } from 'react'

export function useZoomAuth(options = {}) {
  const {
    authorizeEndpoint = '/api/zoomapp/authorize',
    tokenEndpoint = '/api/zoomapp/onauthorized',
    onAuthorized,
    onError,
  } = options

  const [isAuthorized, setIsAuthorized] = useState(false)
  const [isGuest, setIsGuest] = useState(false)
  const [userContextStatus, setUserContextStatus] = useState(null)
  const [error, setError] = useState(null)
  const [isAuthorizing, setIsAuthorizing] = useState(false)

  // Start OAuth flow (for authenticated users)
  const authorize = useCallback(async () => {
    setIsAuthorizing(true)
    setError(null)

    try {
      // 1. Get PKCE challenge from backend
      const response = await fetch(authorizeEndpoint)
      if (!response.ok) {
        throw new Error(`Failed to get auth challenge: ${response.status}`)
      }

      const { codeChallenge, state } = await response.json()
      if (!codeChallenge || !state) {
        throw new Error('Invalid auth challenge response - missing codeChallenge or state')
      }

      // 2. Trigger Zoom OAuth popup
      await zoomSdk.authorize({ codeChallenge, state })

      // Note: Authorization completes via onAuthorized event listener
    } catch (err) {
      console.error('Authorization error:', err)
      setError(err)
      setIsAuthorizing(false)
      onError?.(err)
    }
  }, [authorizeEndpoint, onError])

  // Start OAuth flow (for guest users)
  const promptAuthorize = useCallback(async () => {
    setIsAuthorizing(true)
    setError(null)

    try {
      await zoomSdk.promptAuthorize()
    } catch (err) {
      console.error('promptAuthorize error:', err)
      setError(err)
      setIsAuthorizing(false)
      onError?.(err)
    }
  }, [onError])

  // Listen for OAuth completion
  useEffect(() => {
    const handleAuthorized = async (event) => {
      const { code, state } = event

      try {
        // Exchange code for token via backend
        const response = await fetch(tokenEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code,
            state,
            href: window.location.href,
          }),
        })

        if (!response.ok) {
          throw new Error(`Token exchange failed: ${response.status}`)
        }

        setIsAuthorized(true)
        setIsAuthorizing(false)
        setError(null)
        onAuthorized?.()
      } catch (err) {
        console.error('Token exchange error:', err)
        setError(err)
        setIsAuthorizing(false)
        onError?.(err)
      }
    }

    zoomSdk.addEventListener('onAuthorized', handleAuthorized)

    return () => {
      zoomSdk.removeEventListener('onAuthorized', handleAuthorized)
    }
  }, [tokenEndpoint, onAuthorized, onError])

  // Track user context changes
  useEffect(() => {
    const handleContextChange = (event) => {
      const { status } = event
      setUserContextStatus(status)

      if (status === 'authorized') {
        setIsAuthorized(true)
        setIsGuest(false)
      } else if (status === 'unauthenticated' || status === 'authenticated') {
        setIsGuest(true)
        setIsAuthorized(false)
      }
    }

    zoomSdk.addEventListener('onMyUserContextChange', handleContextChange)

    return () => {
      zoomSdk.removeEventListener('onMyUserContextChange', handleContextChange)
    }
  }, [])

  return {
    // State
    isAuthorized,
    isGuest,
    userContextStatus,
    error,
    isAuthorizing,

    // Methods
    authorize,
    promptAuthorize,

    // Helper: Use appropriate auth method based on guest status
    startAuth: isGuest ? promptAuthorize : authorize,
  }
}

export default useZoomAuth
