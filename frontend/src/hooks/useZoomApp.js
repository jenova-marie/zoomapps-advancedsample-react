/* globals zoomSdk */
/**
 * useZoomApp - Core Zoom SDK configuration hook
 *
 * TIER 1: Required for ALL Zoom Apps
 *
 * This hook handles:
 * - SDK initialization via zoomSdk.config()
 * - Running context detection (inMainClient, inMeeting, etc.)
 * - User authorization status
 * - Auto re-configuration on 2-hour timeout
 *
 * @param {string[]} capabilities - Array of Zoom SDK capabilities your app needs
 * @param {Object} options - Configuration options
 * @param {string} options.version - SDK version (default: '0.16.0')
 * @param {boolean} options.autoReconfigure - Auto re-configure on timeout (default: true)
 *
 * @example
 * const { runningContext, userContextStatus, configured, error } = useZoomApp([
 *   'getSupportedJsApis',
 *   'openUrl',
 *   'showNotification',
 * ])
 */
import { useEffect, useState, useCallback } from 'react'

const TWO_HOURS_MS = 120 * 60 * 1000

export function useZoomApp(capabilities = [], options = {}) {
  const { version = '0.16.0', autoReconfigure = true } = options

  const [runningContext, setRunningContext] = useState(null)
  const [userContextStatus, setUserContextStatus] = useState(null)
  const [error, setError] = useState(null)
  const [configured, setConfigured] = useState(false)
  const [configCount, setConfigCount] = useState(0)

  // Manual reconfigure function
  const reconfigure = useCallback(() => {
    setConfigCount((c) => c + 1)
  }, [])

  useEffect(() => {
    let configTimer = null

    async function configureSdk() {
      try {
        const configResponse = await zoomSdk.config({
          capabilities,
          version,
        })

        setRunningContext(configResponse.runningContext)
        setUserContextStatus(configResponse.auth?.status || null)
        setConfigured(true)
        setError(null)

        // Schedule re-configuration before 2-hour timeout
        if (autoReconfigure) {
          configTimer = setTimeout(() => {
            setConfigCount((c) => c + 1)
          }, TWO_HOURS_MS)
        }
      } catch (err) {
        console.error('Zoom SDK config error:', err)
        setError(err)
        setConfigured(false)
      }
    }

    configureSdk()

    return () => {
      if (configTimer) {
        clearTimeout(configTimer)
      }
    }
  }, [configCount, version]) // capabilities intentionally excluded to prevent re-config on every render

  return {
    // State
    runningContext,
    userContextStatus,
    configured,
    error,

    // Methods
    reconfigure,

    // Helpers
    isInMeeting: runningContext === 'inMeeting',
    isInClient: runningContext === 'inMainClient',
    isAuthorized: userContextStatus === 'authorized',
    isGuest: userContextStatus === 'unauthenticated' || userContextStatus === 'authenticated',
  }
}

export default useZoomApp
