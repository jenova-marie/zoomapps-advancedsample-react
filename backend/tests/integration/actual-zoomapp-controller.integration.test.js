import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import request from 'supertest'
import express from 'express'
import redis from 'redis'
import { promisify } from 'util'

/**
 * Integration tests that import the ACTUAL zoomapp controller
 * to get real code coverage on api/zoomapp/controller.js
 */

process.env.REDIS_ENCRYPTION_KEY = '12345678901234567890123456789012'

describe('api/zoomapp/controller - Actual Module Coverage', () => {
  let controller
  let store
  let zoomHelpers
  let testClient
  let delAsync
  const testUsers = []

  beforeAll(async () => {
    testClient = redis.createClient({ url: process.env.REDIS_URL })
    testClient.on('error', () => {})
    delAsync = promisify(testClient.del).bind(testClient)

    // Import actual modules
    store = await import('../../util/store.js')
    zoomHelpers = await import('../../util/zoom-helpers.js')
    controller = await import('../../api/zoomapp/controller.js')
  })

  afterAll(async () => {
    for (const userId of testUsers) {
      try { await delAsync(userId) } catch (e) {}
    }
    if (testClient) testClient.quit()
  })

  const generateTestUserId = () => {
    const userId = `actual_ctrl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    testUsers.push(userId)
    return userId
  }

  describe('install handler', () => {
    it('should redirect to Zoom OAuth with proper params', async () => {
      const app = express()
      app.use((req, res, next) => {
        req.session = {}
        next()
      })

      // Use the actual install handler
      app.get('/install', controller.install)

      const response = await request(app)
        .get('/install')
        .expect(302)

      expect(response.headers.location).toContain(process.env.ZOOM_HOST)
      expect(response.headers.location).toContain('oauth/authorize')
      expect(response.headers.location).toContain('client_id=')
    })

    it('should save state to session', async () => {
      let savedState = null

      const app = express()
      app.use((req, res, next) => {
        req.session = {
          set state(val) { savedState = val },
          get state() { return savedState },
        }
        next()
      })

      app.get('/install', controller.install)

      await request(app).get('/install')

      expect(savedState).toBeDefined()
      expect(savedState).toContain('.') // HMAC.timestamp format
    })
  })

  describe('inClientAuthorize handler', () => {
    it('should return code challenge and state', async () => {
      const app = express()
      app.use(express.json())
      app.use((req, res, next) => {
        req.session = {}
        next()
      })

      app.get('/authorize', controller.inClientAuthorize)

      app.use((err, req, res, next) => {
        res.status(500).json({ error: err.message })
      })

      const response = await request(app)
        .get('/authorize')
        .expect(200)

      expect(response.body).toHaveProperty('codeChallenge')
      expect(response.body).toHaveProperty('state')
    })

    it('should save codeVerifier to session', async () => {
      let savedVerifier = null
      let savedState = null

      const app = express()
      app.use(express.json())
      app.use((req, res, next) => {
        req.session = {
          set codeVerifier(val) { savedVerifier = val },
          get codeVerifier() { return savedVerifier },
          set state(val) { savedState = val },
          get state() { return savedState },
        }
        next()
      })

      app.get('/authorize', controller.inClientAuthorize)

      await request(app).get('/authorize')

      expect(savedVerifier).toBeDefined()
      expect(savedVerifier.length).toBe(128)
      expect(savedState).toBeDefined()
    })
  })

  describe('home handler', () => {
    it('should require x-zoom-app-context header', async () => {
      const app = express()
      app.use((req, res, next) => {
        req.session = {}
        next()
      })

      app.get('/home', controller.home)

      app.use((err, req, res, next) => {
        res.status(err.status || 500).json({ error: err.message })
      })

      const response = await request(app)
        .get('/home')
        .expect(500)

      expect(response.body.error).toContain('x-zoom-app-context')
    })
  })

  describe('auth handler', () => {
    it('should return error when no code provided', async () => {
      const app = express()
      app.use((req, res, next) => {
        req.session = {
          state: 'test-state',
          destroy: () => {},
        }
        next()
      })

      app.get('/auth', controller.auth)

      app.use((err, req, res, next) => {
        res.status(err.status || 500).json({ error: err.message })
      })

      const response = await request(app)
        .get('/auth')
        .query({ state: 'test-state' })
        .expect(400)

      expect(response.body.error).toContain('No authorization code')
    })

    it('should return error when state does not match', async () => {
      const app = express()
      app.use((req, res, next) => {
        req.session = {
          state: 'correct-state',
          destroy: () => {},
        }
        next()
      })

      app.get('/auth', controller.auth)

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

  describe('inClientOnAuthorized handler', () => {
    it('should return error when state does not match', async () => {
      const app = express()
      app.use(express.json())
      app.use(express.urlencoded({ extended: false }))
      app.use((req, res, next) => {
        req.session = {
          state: 'correct-state',
          codeVerifier: 'verifier',
        }
        next()
      })

      app.post('/onauthorized', controller.inClientOnAuthorized)

      app.use((err, req, res, next) => {
        res.status(err.status || 500).json({ error: err.message })
      })

      const response = await request(app)
        .post('/onauthorized')
        .send({ code: 'auth-code', state: 'wrong-state', href: 'http://localhost' })
        .expect(500)

      expect(response.body.error).toContain('State mismatch')
    })

    it('should return error when code is missing', async () => {
      const app = express()
      app.use(express.json())
      app.use(express.urlencoded({ extended: false }))
      app.use((req, res, next) => {
        req.session = {
          state: 'test-state',
          codeVerifier: 'verifier',
        }
        next()
      })

      app.post('/onauthorized', controller.inClientOnAuthorized)

      app.use((err, req, res, next) => {
        res.status(err.status || 500).json({ error: err.message })
      })

      const response = await request(app)
        .post('/onauthorized')
        .send({ state: 'test-state', href: 'http://localhost' })
        .expect(500)

      expect(response.body.error).toContain('State mismatch')
    })
  })
})
