import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import request from 'supertest'
import express from 'express'
import redis from 'redis'
import { promisify } from 'util'

/**
 * Integration tests that import the ACTUAL thirdpartyauth controller
 * to get real code coverage on api/thirdpartyauth/controller.js
 */

process.env.REDIS_ENCRYPTION_KEY = '12345678901234567890123456789012'

describe('api/thirdpartyauth/controller - Actual Module Coverage', () => {
  let controller
  let store
  let testClient
  let delAsync
  const testUsers = []

  beforeAll(async () => {
    testClient = redis.createClient({ url: process.env.REDIS_URL })
    testClient.on('error', () => {})
    delAsync = promisify(testClient.del).bind(testClient)

    store = await import('../../util/store.js')
    controller = await import('../../api/thirdpartyauth/controller.js')
  })

  afterAll(async () => {
    for (const userId of testUsers) {
      try { await delAsync(userId) } catch (e) {}
    }
    if (testClient) testClient.quit()
  })

  const generateTestUserId = () => {
    const userId = `actual_auth0_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    testUsers.push(userId)
    return userId
  }

  describe('begin handler', () => {
    it('should redirect to Zoom OAuth', async () => {
      const app = express()
      app.use((req, res, next) => {
        req.session = {}
        next()
      })

      app.get('/begin', controller.begin)

      const response = await request(app)
        .get('/begin')
        .expect(302)

      expect(response.headers.location).toContain(process.env.ZOOM_HOST)
      expect(response.headers.location).toContain('oauth/authorize')
    })

    it('should save zoomRequestState to session', async () => {
      let savedState = null

      const app = express()
      app.use((req, res, next) => {
        req.session = {
          set zoomRequestState(val) { savedState = val },
          get zoomRequestState() { return savedState },
        }
        next()
      })

      app.get('/begin', controller.begin)

      await request(app).get('/begin')

      expect(savedState).toBeDefined()
      expect(savedState).toContain('.') // HMAC.timestamp format
    })
  })

  describe('zoomAuth handler', () => {
    it('should return error when no code provided', async () => {
      const app = express()
      app.use((req, res, next) => {
        req.session = {
          zoomRequestState: 'test-state',
          destroy: () => {},
        }
        next()
      })

      app.get('/redirect', controller.zoomAuth)

      app.use((err, req, res, next) => {
        res.status(err.status || 500).json({ error: err.message })
      })

      const response = await request(app)
        .get('/redirect')
        .query({ state: 'test-state' })
        .expect(400)

      expect(response.body.error).toContain('No auth code')
    })

    it('should return error when state does not match', async () => {
      const app = express()
      app.use((req, res, next) => {
        req.session = {
          zoomRequestState: 'correct-state',
          destroy: () => {},
        }
        next()
      })

      app.get('/redirect', controller.zoomAuth)

      app.use((err, req, res, next) => {
        res.status(err.status || 500).json({ error: err.message })
      })

      const response = await request(app)
        .get('/redirect')
        .query({ code: 'auth-code', state: 'wrong-state' })
        .expect(400)

      expect(response.body.error).toContain('Invalid state')
    })

    it('should clear zoomRequestState for security', async () => {
      let sessionState = 'initial-state'

      const app = express()
      app.use((req, res, next) => {
        req.session = {
          get zoomRequestState() { return sessionState },
          set zoomRequestState(val) { sessionState = val },
          destroy: () => {},
        }
        next()
      })

      app.get('/redirect', controller.zoomAuth)

      app.use((err, req, res, next) => {
        res.status(err.status || 500).json({ error: err.message, stateCleared: sessionState === null })
      })

      const response = await request(app)
        .get('/redirect')
        .query({ code: 'auth-code', state: 'initial-state' })

      // State should be cleared even if subsequent processing fails
      expect(sessionState).toBeNull()
    })
  })

  describe('auth0Auth handler', () => {
    it('should return error when no code provided', async () => {
      const app = express()
      app.use((req, res, next) => {
        req.session = {
          thirdPartyRequestState: 'test-state',
          codeVerifier: 'verifier',
          user: 'user-123',
          destroy: () => {},
        }
        next()
      })

      app.get('/auth', controller.auth0Auth)

      app.use((err, req, res, next) => {
        res.status(err.status || 500).json({ error: err.message })
      })

      const response = await request(app)
        .get('/auth')
        .query({ state: 'test-state' })
        .expect(400)

      expect(response.body.error).toContain('No auth code')
    })

    it('should return error when state does not match', async () => {
      const app = express()
      app.use((req, res, next) => {
        req.session = {
          thirdPartyRequestState: 'correct-state',
          codeVerifier: 'verifier',
          user: 'user-123',
          destroy: () => {},
        }
        next()
      })

      app.get('/auth', controller.auth0Auth)

      app.use((err, req, res, next) => {
        res.status(err.status || 500).json({ error: err.message })
      })

      const response = await request(app)
        .get('/auth')
        .query({ code: 'auth-code', state: 'wrong-state' })
        .expect(400)

      expect(response.body.error).toContain('Invalid state')
    })
  })

  describe('logout handler', () => {
    it('should remove thirdPartyAccessToken from user', async () => {
      const userId = generateTestUserId()

      // Create user with third party token
      await store.upsertUser(userId, 'zoom-token', 'refresh', Date.now() + 3600000)
      await store.updateUser(userId, { thirdPartyAccessToken: 'auth0-token' })

      const app = express()
      app.use(express.json())
      app.use((req, res, next) => {
        req.session = { user: userId }
        next()
      })

      app.post('/logout', controller.logout)

      app.use((err, req, res, next) => {
        res.status(500).json({ error: err.message })
      })

      const response = await request(app)
        .post('/logout')
        .expect(200)

      expect(response.body.status).toBe('ok')

      // Verify token was removed
      const user = await store.getUser(userId)
      expect(user.thirdPartyAccessToken).toBeUndefined()
    })

    it('should handle non-existent user gracefully', async () => {
      const app = express()
      app.use(express.json())
      app.use((req, res, next) => {
        req.session = { user: 'non_existent_user_xyz' }
        next()
      })

      app.post('/logout', controller.logout)

      app.use((err, req, res, next) => {
        res.status(500).json({ error: err.message })
      })

      // Will fail because user doesn't exist, but covers the code path
      const response = await request(app)
        .post('/logout')
        .expect(500)

      expect(response.body.error).toBeDefined()
    })
  })
})
