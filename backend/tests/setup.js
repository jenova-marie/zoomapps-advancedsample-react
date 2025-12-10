/**
 * Vitest Global Setup
 * This file runs before each test file
 */

import { vi, beforeEach, afterEach } from 'vitest'

// Set up test environment variables
process.env.NODE_ENV = 'test'
process.env.PORT = '3000'
process.env.SESSION_SECRET = 'test-session-secret-32-chars-long!'
process.env.ZOOM_APP_CLIENT_URL = 'http://localhost:9090'
process.env.ZOOM_APP_CLIENT_ID = 'test-client-id'
process.env.ZOOM_APP_CLIENT_SECRET = 'test-client-secret-32-chars-long!'
process.env.ZOOM_APP_REDIRECT_URI = 'http://localhost:3000/api/zoomapp/auth'
process.env.ZOOM_HOST = 'https://zoom.us'
process.env.ZOOM_APP_OAUTH_STATE_SECRET = 'test-oauth-state-secret-long-enough'
process.env.REDIS_URL = 'redis://localhost:6379'
// AES-256 requires exactly 32 bytes key
process.env.REDIS_ENCRYPTION_KEY = '12345678901234567890123456789012'
process.env.PUBLIC_URL = 'https://test.ngrok.io'

// Clean up mocks between tests
beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// Suppress console output during tests (optional - comment out for debugging)
// vi.spyOn(console, 'log').mockImplementation(() => {})
// vi.spyOn(console, 'error').mockImplementation(() => {})
