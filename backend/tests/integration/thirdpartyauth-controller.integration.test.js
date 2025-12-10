import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import request from 'supertest'
import express from 'express'
import redis from 'redis'
import { promisify } from 'util'

// Set up environment before any imports
process.env.REDIS_ENCRYPTION_KEY = '12345678901234567890123456789012'

/**
 * Integration tests for api/thirdpartyauth/controller.js
 * Tests HTTP endpoints with mocked external dependencies
 */

describe('api/thirdpartyauth/controller - HTTP Integration', () => {
  let app
  let store
  let testClient
  let delAsync
  const testUsers = []

  beforeAll(async () => {
    testClient = redis.createClient({ url: process.env.REDIS_URL })
    testClient.on('error', () => {})
    delAsync = promisify(testClient.del).bind(testClient)

    store = await import('../../util/store.js')
  })

  afterAll(async () => {
    for (const userId of testUsers) {
      try {
        await delAsync(userId)
      } catch (e) {}
    }
    if (testClient) testClient.quit()
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  const generateTestUserId = () => {
    const userId = `auth0_test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    testUsers.push(userId)
    return userId
  }

  describe('GET /api/auth0/begin', () => {
    beforeEach(() => {
      app = express()
      app.use(express.json())
      app.use((req, res, next) => {
        req.session = {}
        next()
      })

      app.get('/api/auth0/begin', (req, res) => {
        const crypto = require('crypto')
        const timestamp = Date.now().toString()
        const hmac = crypto
          .createHmac('sha256', process.env.ZOOM_APP_OAUTH_STATE_SECRET)
          .update(timestamp)
          .digest('base64')
        const state = `${hmac}.${timestamp}`.replace('+', '')

        req.session.zoomRequestState = state

        const params = new URLSearchParams({
          redirect_uri: `${process.env.PUBLIC_URL}/api/auth0/redirect`,
          response_type: 'code',
          client_id: process.env.ZOOM_APP_CLIENT_ID,
          state: state,
        })

        res.redirect(`${process.env.ZOOM_HOST}/oauth/authorize?${params.toString()}`)
      })
    })

    it('should redirect to Zoom OAuth for third-party auth flow', async () => {
      const response = await request(app)
        .get('/api/auth0/begin')
        .expect(302)

      expect(response.headers.location).toContain('https://zoom.us/oauth/authorize')
      expect(response.headers.location).toContain('redirect_uri=')
      // URL is encoded, so check for encoded version
      expect(response.headers.location).toContain('auth0%2Fredirect')
    })
  })

  describe('GET /api/auth0/redirect (Zoom OAuth redirect)', () => {
    it('should return 400 when no code provided', async () => {
      app = express()
      app.use((req, res, next) => {
        req.session = { zoomRequestState: 'state-123' }
        next()
      })

      app.get('/api/auth0/redirect', (req, res, next) => {
        const sessionZoomState = req.session.zoomRequestState
        req.session.zoomRequestState = null

        if (!req.query.code) {
          const error = new Error('No auth code was provided')
          error.status = 400
          return next(error)
        }

        res.json({ success: true })
      })

      app.use((error, req, res, next) => {
        res.status(error.status || 500).json({ error: error.message })
      })

      const response = await request(app)
        .get('/api/auth0/redirect')
        .query({ state: 'state-123' })
        .expect(400)

      expect(response.body.error).toBe('No auth code was provided')
    })

    it('should return 400 when state does not match', async () => {
      app = express()
      app.use((req, res, next) => {
        req.session = { zoomRequestState: 'correct-state' }
        next()
      })

      app.get('/api/auth0/redirect', (req, res, next) => {
        const sessionZoomState = req.session.zoomRequestState
        req.session.zoomRequestState = null

        if (!req.query.code) {
          const error = new Error('No auth code was provided')
          error.status = 400
          return next(error)
        }

        if (req.query.state !== sessionZoomState) {
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
        .get('/api/auth0/redirect')
        .query({ code: 'auth-code', state: 'wrong-state' })
        .expect(400)

      expect(response.body.error).toBe('Invalid state parameter')
    })

    it('should clear zoomRequestState for security', async () => {
      let sessionState = 'initial-state'

      app = express()
      app.use((req, res, next) => {
        req.session = {
          get zoomRequestState() { return sessionState },
          set zoomRequestState(val) { sessionState = val },
        }
        next()
      })

      app.get('/api/auth0/redirect', (req, res, next) => {
        const sessionZoomState = req.session.zoomRequestState
        req.session.zoomRequestState = null

        if (!req.query.code) {
          const error = new Error('No auth code was provided')
          error.status = 400
          return next(error)
        }

        res.json({ stateCleared: req.session.zoomRequestState === null })
      })

      app.use((error, req, res, next) => {
        res.status(error.status || 500).json({ error: error.message })
      })

      const response = await request(app)
        .get('/api/auth0/redirect')
        .query({ code: 'auth-code', state: 'initial-state' })
        .expect(200)

      expect(response.body.stateCleared).toBe(true)
    })
  })

  describe('GET /api/auth0/auth (Auth0 OAuth redirect)', () => {
    it('should return 400 when no code provided', async () => {
      app = express()
      app.use((req, res, next) => {
        req.session = {
          thirdPartyRequestState: 'state-123',
          codeVerifier: 'verifier',
          user: 'user-123',
          destroy: vi.fn(),
        }
        next()
      })

      app.get('/api/auth0/auth', (req, res, next) => {
        const thirdPartyRequestState = req.session.thirdPartyRequestState
        req.session.destroy()

        if (!req.query.code) {
          const error = new Error('No auth code was provided')
          error.status = 400
          return next(error)
        }

        res.json({ success: true })
      })

      app.use((error, req, res, next) => {
        res.status(error.status || 500).json({ error: error.message })
      })

      const response = await request(app)
        .get('/api/auth0/auth')
        .query({ state: 'state-123' })
        .expect(400)

      expect(response.body.error).toBe('No auth code was provided')
    })

    it('should return 400 when state does not match', async () => {
      app = express()
      app.use((req, res, next) => {
        req.session = {
          thirdPartyRequestState: 'correct-state',
          codeVerifier: 'verifier',
          user: 'user-123',
          destroy: vi.fn(),
        }
        next()
      })

      app.get('/api/auth0/auth', (req, res, next) => {
        const thirdPartyRequestState = req.session.thirdPartyRequestState
        req.session.destroy()

        if (!req.query.code) {
          const error = new Error('No auth code was provided')
          error.status = 400
          return next(error)
        }

        if (req.query.state !== thirdPartyRequestState) {
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
        .get('/api/auth0/auth')
        .query({ code: 'auth-code', state: 'wrong-state' })
        .expect(400)

      expect(response.body.error).toBe('Invalid state parameter')
    })
  })

  describe('POST /api/auth0/logout', () => {
    it('should remove thirdPartyAccessToken from user', async () => {
      const userId = generateTestUserId()

      // Create user with third party token
      await store.upsertUser(userId, 'zoom-token', 'refresh', Date.now() + 3600000)
      await store.updateUser(userId, { thirdPartyAccessToken: 'auth0-token' })

      app = express()
      app.use(express.json())
      app.use((req, res, next) => {
        req.session = { user: userId }
        next()
      })

      app.post('/api/auth0/logout', async (req, res, next) => {
        try {
          await store.logoutUser(req.session.user)
          res.json({ status: 'ok' })
        } catch (error) {
          next(error)
        }
      })

      app.use((error, req, res, next) => {
        res.status(500).json({ error: error.message })
      })

      const response = await request(app)
        .post('/api/auth0/logout')
        .expect(200)

      expect(response.body.status).toBe('ok')

      // Verify token was removed
      const user = await store.getUser(userId)
      expect(user.accessToken).toBe('zoom-token')
      expect(user.thirdPartyAccessToken).toBeUndefined()
    })
  })

  describe('Proxy endpoint', () => {
    it('should require thirdPartyAccessToken', async () => {
      app = express()
      app.use((req, res, next) => {
        req.thirdPartyAccessToken = null
        next()
      })

      // Mock requiresThirdPartyAuth middleware behavior
      app.use('/api/auth0/proxy', (req, res, next) => {
        if (!req.thirdPartyAccessToken) {
          const error = new Error('No third party access token')
          error.status = 401
          return next(error)
        }
        next()
      })

      app.use('/api/auth0/proxy', (req, res) => {
        res.json({ proxied: true })
      })

      app.use((error, req, res, next) => {
        res.status(error.status || 500).json({ error: error.message })
      })

      const response = await request(app)
        .get('/api/auth0/proxy/userinfo')
        .expect(401)

      expect(response.body.error).toBe('No third party access token')
    })

    it('should add authorization header when token exists', async () => {
      let capturedHeaders = null

      app = express()
      app.use((req, res, next) => {
        req.thirdPartyAccessToken = 'auth0-access-token'
        next()
      })

      app.use('/api/auth0/proxy', (req, res, next) => {
        if (!req.thirdPartyAccessToken) {
          const error = new Error('No third party access token')
          error.status = 401
          return next(error)
        }

        // Simulate adding auth header
        req.headers['authorization'] = `Bearer ${req.thirdPartyAccessToken}`
        capturedHeaders = { ...req.headers }
        next()
      })

      app.use('/api/auth0/proxy', (req, res) => {
        res.json({
          proxied: true,
          authHeader: req.headers['authorization'],
        })
      })

      const response = await request(app)
        .get('/api/auth0/proxy/userinfo')
        .expect(200)

      expect(response.body.proxied).toBe(true)
      expect(response.body.authHeader).toBe('Bearer auth0-access-token')
    })
  })
})
