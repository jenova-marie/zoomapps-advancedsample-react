/* globals zoomSdk */
import { useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { apis } from './apis'
import { Authorization } from './components/Authorization'
import ApiScrollview from './components/ApiScrollview'
import { useZoomApp, useZoomConnect } from './hooks'
import { startRTMS, stopRTMS } from './utils'
import './App.css'
import 'bootstrap/dist/css/bootstrap.min.css'

// All capabilities needed by this app
const ZOOM_CAPABILITIES = [
  // APIs demoed in the buttons
  ...apis.map((api) => api.name),

  // Demo events
  'onSendAppInvitation',
  'onShareApp',
  'onActiveSpeakerChange',
  'onMeeting',

  // Connect API and events
  'connect',
  'onConnect',
  'postMessage',
  'onMessage',

  // In-client OAuth API and events
  'authorize',
  'onAuthorized',
  'promptAuthorize',
  'getUserContext',
  'onMyUserContextChange',
  'sendAppInvitationToAllParticipants',
  'sendAppInvitation',

  // RTMS
  'startRTMS',
  'stopRTMS',
]

function App() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [rtmsMessage, setRtmsMessage] = useState('')

  // Tier 1: SDK Configuration
  const {
    runningContext,
    userContextStatus,
    configured,
    error,
  } = useZoomApp(ZOOM_CAPABILITIES)

  // Tier 3: Cross-instance messaging
  const { connected, sendMessage } = useZoomConnect(runningContext, {
    onMessage: (payload) => {
      // Handle pre-meeting sync: when meeting instance says "connected",
      // client sends its current route
      if (payload === 'connected') {
        sendMessage(window.location.hash)
      } else {
        // Navigate to the route sent from other instance
        navigate({ pathname: payload })
      }
    },
  })

  // Notify meeting instance of route changes
  useEffect(() => {
    if (runningContext === 'inMeeting' && connected) {
      sendMessage(window.location.pathname)
    }
  }, [runningContext, connected, sendMessage, window.location.pathname])

  // RTMS handlers using utility functions
  const handleStartRTMS = async () => {
    const result = await startRTMS()
    if (result.success) {
      setRtmsMessage(`startRTMS success: ${JSON.stringify(result.data)}`)
    } else {
      setRtmsMessage(`startRTMS error: ${result.error}`)
    }
  }

  const handleStopRTMS = async () => {
    const result = await stopRTMS()
    if (result.success) {
      setRtmsMessage(`stopRTMS success: ${JSON.stringify(result.data)}`)
    } else {
      setRtmsMessage(`stopRTMS error: ${result.error}`)
    }
  }

  // Error state
  if (error) {
    return (
      <div className='App'>
        <h1>Error initializing Zoom App</h1>
        <p>{error.message || String(error)}</p>
      </div>
    )
  }

  // Loading state
  if (!configured) {
    return (
      <div className='App'>
        <p>Configuring Zoom JavaScript SDK...</p>
      </div>
    )
  }

  return (
    <div className='App'>
      <h1>
        Hello
        {user ? ` ${user.first_name} ${user.last_name}` : ' Zoom Apps user'}!
      </h1>
      <p>{`User Context Status: ${userContextStatus}`}</p>
      <p>{`Running Context: ${runningContext}`}</p>

      {rtmsMessage && <p className='fw-bold'>{rtmsMessage}</p>}

      <ApiScrollview onStartRTMS={handleStartRTMS} onStopRTMS={handleStopRTMS} />
      <Authorization
        handleUser={setUser}
        user={user}
        userContextStatus={userContextStatus}
      />
    </div>
  )
}

export default App
