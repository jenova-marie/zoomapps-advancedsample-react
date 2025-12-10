/* globals zoomSdk */
/**
 * useZoomConnect - Cross-instance messaging hook
 *
 * TIER 3: Required if your app runs in both client and meeting contexts
 *
 * This hook handles:
 * - Connecting client and meeting instances (zoomSdk.connect)
 * - Bidirectional messaging via postMessage/onMessage
 * - Pre-meeting state synchronization
 * - Running context awareness
 *
 * How it works:
 * - When user opens app in client, it runs in 'inMainClient' context
 * - When user joins meeting, a second instance runs in 'inMeeting' context
 * - These instances can communicate via postMessage/onMessage
 * - The meeting instance initiates connection, client responds
 *
 * Required capabilities:
 * ['connect', 'onConnect', 'postMessage', 'onMessage']
 *
 * @param {string} runningContext - Current running context from useZoomApp
 * @param {Object} options - Configuration options
 * @param {Function} options.onMessage - Callback when message received
 * @param {Function} options.onConnected - Callback when instances connect
 * @param {boolean} options.autoSyncState - Automatically sync state on connect (default: true)
 * @param {Function} options.getInitialState - Function returning initial state to sync
 *
 * @example
 * const { connected, sendMessage, lastMessage } = useZoomConnect(runningContext, {
 *   onMessage: (payload) => handleMessage(payload),
 *   onConnected: () => console.log('Instances connected!'),
 * })
 */
import { useEffect, useState, useCallback, useRef } from 'react'

export function useZoomConnect(runningContext, options = {}) {
  const {
    onMessage,
    onConnected,
    autoSyncState = false,
    getInitialState,
  } = options

  const [connected, setConnected] = useState(false)
  const [lastMessage, setLastMessage] = useState(null)
  const [error, setError] = useState(null)

  // Track if we've already set up listeners to prevent duplicates
  const listenersSetup = useRef(false)
  const connectHandlerRef = useRef(null)
  const messageHandlerRef = useRef(null)

  // Send message to other instance
  const sendMessage = useCallback(
    async (payload) => {
      if (!connected && runningContext !== 'inMeeting') {
        console.warn('Cannot send message: not connected')
        return false
      }

      try {
        await zoomSdk.postMessage({ payload })
        return true
      } catch (err) {
        console.error('postMessage error:', err)
        setError(err)
        return false
      }
    },
    [connected, runningContext]
  )

  // Connect instances (only happens in meeting context)
  useEffect(() => {
    // Only connect when in meeting context
    if (runningContext !== 'inMeeting') {
      return
    }

    // Prevent duplicate setup
    if (listenersSetup.current) {
      return
    }

    async function connectInstances() {
      try {
        // Set up onConnect handler
        connectHandlerRef.current = (event) => {
          setConnected(true)
          onConnected?.()

          // If auto-sync enabled, send initial state after connecting
          if (autoSyncState && getInitialState) {
            const initialState = getInitialState()
            zoomSdk.postMessage({ payload: { type: '__SYNC_STATE__', state: initialState } })
          }
        }

        // Set up onMessage handler
        messageHandlerRef.current = (message) => {
          const payload = message.payload?.payload || message.payload
          setLastMessage(payload)
          onMessage?.(payload)
        }

        zoomSdk.addEventListener('onConnect', connectHandlerRef.current)
        zoomSdk.addEventListener('onMessage', messageHandlerRef.current)
        listenersSetup.current = true

        // Initiate connection
        await zoomSdk.connect()
      } catch (err) {
        console.error('Connection error:', err)
        setError(err)
      }
    }

    connectInstances()

    return () => {
      if (connectHandlerRef.current) {
        zoomSdk.removeEventListener('onConnect', connectHandlerRef.current)
      }
      if (messageHandlerRef.current) {
        zoomSdk.removeEventListener('onMessage', messageHandlerRef.current)
      }
      listenersSetup.current = false
    }
  }, [runningContext, onConnected, onMessage, autoSyncState, getInitialState])

  // Set up message listener for client context
  useEffect(() => {
    if (runningContext !== 'inMainClient') {
      return
    }

    if (listenersSetup.current) {
      return
    }

    messageHandlerRef.current = (message) => {
      const payload = message.payload?.payload || message.payload
      setLastMessage(payload)

      // Handle sync state message
      if (payload?.type === '__SYNC_STATE__') {
        onMessage?.(payload.state)
        return
      }

      onMessage?.(payload)
    }

    zoomSdk.addEventListener('onMessage', messageHandlerRef.current)
    listenersSetup.current = true

    return () => {
      if (messageHandlerRef.current) {
        zoomSdk.removeEventListener('onMessage', messageHandlerRef.current)
      }
      listenersSetup.current = false
    }
  }, [runningContext, onMessage])

  return {
    // State
    connected,
    lastMessage,
    error,

    // Methods
    sendMessage,

    // Helpers
    isInMeeting: runningContext === 'inMeeting',
    isInClient: runningContext === 'inMainClient',
    canSendMessage: connected || runningContext === 'inMeeting',
  }
}

export default useZoomConnect
