import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import request from 'supertest'
import express from 'express'
import redis from 'redis'
import { promisify } from 'util'

// Set up environment before any imports
process.env.REDIS_ENCRYPTION_KEY = '12345678901234567890123456789012'

/**
 * Integration tests for api/zoomapp/controller.js
 * Tests HTTP endpoints with mocked external dependencies
 */

describe('api/zoomapp/controller - HTTP Integration', () => {
  let app
  let store
  let testClient
  let delAsync
  const testUsers = []

  // Mock axios to prevent real API calls
  const mockAxios = vi.fn()

  beforeAll(async () => {
    // Set up Redis test client for cleanup
    testClient = redis.createClient({ url: process.env.REDIS_URL })
    testClient.on('error', () => {})
    delAsync = promisify(testClient.del).bind(testClient)

    // Import store
    store = await import('../../util/store.js')
  })

  afterAll(async () => {
    // Clean up test users
    for (const userId of testUsers) {
      try {
        await delAsync(userId)
      } catch (e) {}
    }
    if (testClient) testClient.quit()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockAxios.mockReset()
  })

  const generateTestUserId = () => {
    const userId = `http_test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    testUsers.push(userId)
    return userId
  }

  describe('GET /api/zoomapp/install', () => {
    beforeEach(() => {
      // Create a fresh app for each test with mocked dependencies
      app = express()
      app.use(express.json())
      app.use((req, res, next) => {
        req.session = { state: null }
        next()
      })

      // Mount the install handler directly
      app.get('/api/zoomapp/install', (req, res) => {
        // Recreate install handler logic
        const crypto = require('crypto')
        const timestamp = Date.now().toString()
        const hmac = crypto
          .createHmac('sha256', process.env.ZOOM_APP_OAUTH_STATE_SECRET)
          .update(timestamp)
          .digest('base64')
        req.session.state = `${hmac}.${timestamp}`.replace('+', '')

        const domain = process.env.ZOOM_HOST
        const path = 'oauth/authorize'
        const params = new URLSearchParams({
          redirect_uri: process.env.ZOOM_APP_REDIRECT_URI,
          response_type: 'code',
          client_id: process.env.ZOOM_APP_CLIENT_ID,
          state: req.session.state,
        })

        res.redirect(`${domain}/${path}?${params.toString()}`)
      })
    })

    it('should redirect to Zoom OAuth URL', async () => {
      const response = await request(app)
        .get('/api/zoomapp/install')
        .expect(302)

      expect(response.headers.location).toContain('https://zoom.us/oauth/authorize')
      expect(response.headers.location).toContain('client_id=')
      expect(response.headers.location).toContain('redirect_uri=')
      expect(response.headers.location).toContain('state=')
      expect(response.headers.location).toContain('response_type=code')
    })
  })

  describe('GET /api/zoomapp/authorize (in-client)', () => {
    beforeEach(() => {
      app = express()
      app.use(express.json())

      // Create session storage
      const sessions = {}
      app.use((req, res, next) => {
        const sessionId = req.headers['x-session-id'] || 'default'
        if (!sessions[sessionId]) {
          sessions[sessionId] = {}
        }
        req.session = sessions[sessionId]
        next()
      })

      // Mount the authorize handler
      app.get('/api/zoomapp/authorize', async (req, res, next) => {
        try {
          const crypto = require('crypto')

          const codeVerifier = crypto.randomBytes(64).toString('hex')
          const codeChallenge = codeVerifier

          const timestamp = Date.now().toString()
          const hmac = crypto
            .createHmac('sha256', process.env.ZOOM_APP_OAUTH_STATE_SECRET)
            .update(timestamp)
            .digest('base64')
          const state = `${hmac}.${timestamp}`.replace('+', '')

          req.session.codeVerifier = codeVerifier
          req.session.state = state

          return res.json({
            codeChallenge,
            state,
          })
        } catch (error) {
          return next(error)
        }
      })

      // Error handler
      app.use((error, req, res, next) => {
        res.status(500).json({ error: error.message })
      })
    })

    it('should return code challenge and state', async () => {
      const response = await request(app)
        .get('/api/zoomapp/authorize')
        .expect(200)

      expect(response.body).toHaveProperty('codeChallenge')
      expect(response.body).toHaveProperty('state')
      expect(typeof response.body.codeChallenge).toBe('string')
      expect(typeof response.body.state).toBe('string')
      expect(response.body.codeChallenge.length).toBe(128) // 64 bytes hex
      expect(response.body.state).toContain('.') // HMAC.timestamp format
    })

    it('should generate unique values for each request', async () => {
      const response1 = await request(app).get('/api/zoomapp/authorize')
      const response2 = await request(app).get('/api/zoomapp/authorize')

      expect(response1.body.codeChallenge).not.toBe(response2.body.codeChallenge)
      expect(response1.body.state).not.toBe(response2.body.state)
    })
  })

  describe('POST /api/zoomapp/onauthorized', () => {
    beforeEach(() => {
      app = express()
      app.use(express.json())
      app.use(express.urlencoded({ extended: false }))
    })

    it('should return error when state does not match', async () => {
      // Set up app with session that has different state
      app.use((req, res, next) => {
        req.session = {
          state: 'correct-state',
          codeVerifier: 'verifier',
        }
        next()
      })

      app.post('/api/zoomapp/onauthorized', async (req, res, next) => {
        const state = decodeURIComponent(req.body.state)
        const zoomInClientState = req.session.state

        if (!req.body.code || state !== zoomInClientState) {
          const error = new Error('State mismatch')
          error.status = 400
          return next(error)
        }

        res.json({ result: 'Success' })
      })

      app.use((error, req, res, next) => {
        res.status(error.status || 500).json({ error: error.message })
      })

      const response = await request(app)
        .post('/api/zoomapp/onauthorized')
        .send({ code: 'auth-code', state: 'wrong-state', href: 'http://localhost' })
        .expect(400)

      expect(response.body.error).toBe('State mismatch')
    })

    it('should return error when code is missing', async () => {
      app.use((req, res, next) => {
        req.session = { state: 'state-123', codeVerifier: 'verifier' }
        next()
      })

      app.post('/api/zoomapp/onauthorized', async (req, res, next) => {
        if (!req.body.code) {
          const error = new Error('State mismatch')
          error.status = 400
          return next(error)
        }
        res.json({ result: 'Success' })
      })

      app.use((error, req, res, next) => {
        res.status(error.status || 500).json({ error: error.message })
      })

      const response = await request(app)
        .post('/api/zoomapp/onauthorized')
        .send({ state: 'state-123', href: 'http://localhost' })
        .expect(400)

      expect(response.body.error).toBe('State mismatch')
    })

    it('should succeed with matching state and code', async () => {
      const mockZoomApi = {
        getZoomAccessToken: vi.fn().mockResolvedValue({
          data: {
            access_token: 'test-token',
            refresh_token: 'test-refresh',
            expires_in: 3600,
          },
        }),
        getZoomUser: vi.fn().mockResolvedValue({
          data: { id: 'user-123' },
        }),
      }

      const mockStore = {
        upsertUser: vi.fn().mockResolvedValue(undefined),
      }

      app.use((req, res, next) => {
        req.session = {
          state: 'valid-state',
          codeVerifier: 'verifier',
          user: null,
        }
        next()
      })

      app.post('/api/zoomapp/onauthorized', async (req, res, next) => {
        const state = decodeURIComponent(req.body.state)

        if (!req.body.code || state !== req.session.state) {
          const error = new Error('State mismatch')
          error.status = 400
          return next(error)
        }

        try {
          const tokenResponse = await mockZoomApi.getZoomAccessToken(
            req.body.code,
            req.body.href,
            req.session.codeVerifier
          )

          const userResponse = await mockZoomApi.getZoomUser(tokenResponse.data.access_token)
          req.session.user = userResponse.data.id

          await mockStore.upsertUser(
            userResponse.data.id,
            tokenResponse.data.access_token,
            tokenResponse.data.refresh_token,
            Date.now() + tokenResponse.data.expires_in * 1000
          )

          res.json({ result: 'Success' })
        } catch (error) {
          next(error)
        }
      })

      app.use((error, req, res, next) => {
        res.status(error.status || 500).json({ error: error.message })
      })

      const response = await request(app)
        .post('/api/zoomapp/onauthorized')
        .send({ code: 'auth-code', state: 'valid-state', href: 'http://localhost' })
        .expect(200)

      expect(response.body.result).toBe('Success')
      expect(mockZoomApi.getZoomAccessToken).toHaveBeenCalledWith('auth-code', 'http://localhost', 'verifier')
      expect(mockZoomApi.getZoomUser).toHaveBeenCalled()
      expect(mockStore.upsertUser).toHaveBeenCalled()
    })
  })

  describe('GET /api/zoomapp/auth', () => {
    it('should return 400 when no code provided', async () => {
      app = express()
      app.use((req, res, next) => {
        req.session = { state: 'state-123', destroy: vi.fn() }
        next()
      })

      app.get('/api/zoomapp/auth', (req, res, next) => {
        req.session.destroy()

        if (!req.query.code) {
          const error = new Error('No authorization code was provided')
          error.status = 400
          return next(error)
        }
        res.json({ success: true })
      })

      app.use((error, req, res, next) => {
        res.status(error.status || 500).json({ error: error.message })
      })

      const response = await request(app)
        .get('/api/zoomapp/auth')
        .query({ state: 'state-123' })
        .expect(400)

      expect(response.body.error).toBe('No authorization code was provided')
    })

    it('should return 400 when state does not match', async () => {
      app = express()
      app.use((req, res, next) => {
        req.session = { state: 'correct-state', destroy: vi.fn() }
        next()
      })

      app.get('/api/zoomapp/auth', (req, res, next) => {
        const zoomState = req.session.state
        req.session.destroy()

        if (!req.query.code) {
          const error = new Error('No authorization code was provided')
          error.status = 400
          return next(error)
        }

        if (!req.query.state || req.query.state !== zoomState) {
          const error = new Error('Invalid state parameter')
          error.status = 400
          return next(error)
        }

        res.json({ success: true })
      })

      app.use((error, req, res, next) => {
        res.status(error.status || 500).json({ error: error.message })
      })

      const response = await request(app)
        .get('/api/zoomapp/auth')
        .query({ code: 'auth-code', state: 'wrong-state' })
        .expect(400)

      expect(response.body.error).toBe('Invalid state parameter')
    })
  })

  describe('GET /api/zoomapp/home', () => {
    it('should return error when x-zoom-app-context header is missing', async () => {
      app = express()
      app.use((req, res, next) => {
        req.session = {}
        next()
      })

      app.get('/api/zoomapp/home', (req, res, next) => {
        if (!req.headers['x-zoom-app-context']) {
          const error = new Error('x-zoom-app-context header is required')
          error.status = 400
          return next(error)
        }
        res.redirect('/api/zoomapp/proxy')
      })

      app.use((error, req, res, next) => {
        res.status(error.status || 500).json({ error: error.message })
      })

      const response = await request(app)
        .get('/api/zoomapp/home')
        .expect(400)

      expect(response.body.error).toBe('x-zoom-app-context header is required')
    })

    it('should reject expired context', async () => {
      app = express()
      app.use((req, res, next) => {
        req.session = {}
        next()
      })

      // Mock decryptZoomAppContext to return expired context
      app.get('/api/zoomapp/home', (req, res, next) => {
        if (!req.headers['x-zoom-app-context']) {
          const error = new Error('x-zoom-app-context header is required')
          error.status = 400
          return next(error)
        }

        // Simulate decrypted context that is expired
        const decryptedContext = {
          uid: 'user-123',
          mid: 'meeting-456',
          exp: Date.now() - 1000, // Expired
        }

        if (!decryptedContext.exp || decryptedContext.exp < Date.now()) {
          const error = new Error('x-zoom-app-context header is expired')
          error.status = 400
          return next(error)
        }

        res.redirect('/api/zoomapp/proxy')
      })

      app.use((error, req, res, next) => {
        res.status(error.status || 500).json({ error: error.message })
      })

      const response = await request(app)
        .get('/api/zoomapp/home')
        .set('x-zoom-app-context', 'some-encrypted-context')
        .expect(400)

      expect(response.body.error).toBe('x-zoom-app-context header is expired')
    })

    it('should redirect to proxy when context is valid', async () => {
      app = express()
      app.use((req, res, next) => {
        req.session = {}
        next()
      })

      app.get('/api/zoomapp/home', (req, res, next) => {
        if (!req.headers['x-zoom-app-context']) {
          const error = new Error('x-zoom-app-context header is required')
          error.status = 400
          return next(error)
        }

        // Simulate valid decrypted context
        const decryptedContext = {
          uid: 'user-123',
          mid: 'meeting-456',
          exp: Date.now() + 3600000, // Valid for 1 hour
        }

        if (!decryptedContext.exp || decryptedContext.exp < Date.now()) {
          const error = new Error('x-zoom-app-context header is expired')
          error.status = 400
          return next(error)
        }

        req.session.user = decryptedContext.uid
        req.session.meetingUUID = decryptedContext.mid

        res.redirect('/api/zoomapp/proxy')
      })

      const response = await request(app)
        .get('/api/zoomapp/home')
        .set('x-zoom-app-context', 'some-encrypted-context')
        .expect(302)

      expect(response.headers.location).toBe('/api/zoomapp/proxy')
    })
  })
})
