/**
 * Integration Test Setup
 *
 * This file sets up the environment for integration tests.
 * Integration tests require:
 * - A running Redis instance
 * - All required environment variables
 */

import { beforeAll, afterAll } from 'vitest'
import redis from 'redis'
import { promisify } from 'util'

// Set test environment variables
process.env.PORT = process.env.PORT || '3000'
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret-for-integration-tests'
process.env.ZOOM_APP_CLIENT_URL = process.env.ZOOM_APP_CLIENT_URL || 'http://localhost:9090'
process.env.ZOOM_APP_CLIENT_ID = process.env.ZOOM_APP_CLIENT_ID || 'test-client-id'
process.env.ZOOM_APP_CLIENT_SECRET = process.env.ZOOM_APP_CLIENT_SECRET || 'test-client-secret'
process.env.ZOOM_APP_REDIRECT_URI = process.env.ZOOM_APP_REDIRECT_URI || 'http://localhost:3000/api/zoomapp/auth'
process.env.ZOOM_HOST = process.env.ZOOM_HOST || 'https://zoom.us'
process.env.ZOOM_APP_OAUTH_STATE_SECRET = process.env.ZOOM_APP_OAUTH_STATE_SECRET || 'test-state-secret'
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
process.env.REDIS_ENCRYPTION_KEY = process.env.REDIS_ENCRYPTION_KEY || '12345678901234567890123456789012'
process.env.PUBLIC_URL = process.env.PUBLIC_URL || 'https://test.ngrok.io'

// Optional Auth0 variables for third-party auth tests
process.env.AUTH0_CLIENT_ID = process.env.AUTH0_CLIENT_ID || 'test-auth0-client-id'
process.env.AUTH0_CLIENT_SECRET = process.env.AUTH0_CLIENT_SECRET || 'test-auth0-client-secret'
process.env.AUTH0_ISSUER_BASE_URL = process.env.AUTH0_ISSUER_BASE_URL || 'https://test.auth0.com'

let healthCheckClient = null

beforeAll(async () => {
  // Verify Redis is available
  healthCheckClient = redis.createClient({
    url: process.env.REDIS_URL,
  })

  const pingAsync = promisify(healthCheckClient.ping).bind(healthCheckClient)

  try {
    await pingAsync()
    console.log('✓ Redis connection verified')
  } catch (error) {
    console.error('✗ Redis connection failed:', error.message)
    console.error('  Make sure Redis is running at:', process.env.REDIS_URL)
    throw new Error('Integration tests require a running Redis instance')
  }
})

afterAll(async () => {
  if (healthCheckClient) {
    healthCheckClient.quit()
  }
})
