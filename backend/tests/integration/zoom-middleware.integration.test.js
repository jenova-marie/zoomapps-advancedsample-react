import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import redis from 'redis'
import { promisify } from 'util'

// Integration tests for api/zoom/middleware.js
// These tests require a running Redis instance

process.env.REDIS_ENCRYPTION_KEY = '12345678901234567890123456789012'

describe('api/zoom/middleware - Redis Integration', () => {
  let middleware
  let store
  let testClient
  let delAsync
  const testUsers = []

  beforeAll(async () => {
    // Create a test Redis client for cleanup
    testClient = redis.createClient({
      url: process.env.REDIS_URL,
    })
    testClient.on('error', () => {})
    delAsync = promisify(testClient.del).bind(testClient)

    // Import actual modules
    store = await import('../../util/store.js')
    middleware = await import('../../api/zoom/middleware.js')
  })

  afterAll(async () => {
    // Clean up test users
    for (const userId of testUsers) {
      try {
        await delAsync(userId)
      } catch (e) {
        // Ignore
      }
    }
    if (testClient) {
      testClient.quit()
    }
  })

  const generateTestUserId = () => {
    const userId = `mw_test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    testUsers.push(userId)
    return userId
  }

  const createMockRequest = (overrides = {}) => ({
    session: {},
    headers: {},
    appUser: null,
    ...overrides,
  })

  const createMockResponse = () => ({
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  })

  describe('getUser middleware', () => {
    it('should call next with error if no session', async () => {
      const req = createMockRequest({ session: undefined })
      const res = createMockResponse()
      const next = vi.fn()

      await middleware.getUser(req, res, next)

      expect(next).toHaveBeenCalledWith(expect.any(Error))
      expect(next.mock.calls[0][0].message).toContain('No session or no user')
    })

    it('should call next with error if no user in session', async () => {
      const req = createMockRequest({ session: {} })
      const res = createMockResponse()
      const next = vi.fn()

      await middleware.getUser(req, res, next)

      expect(next).toHaveBeenCalledWith(expect.any(Error))
    })

    it('should retrieve user from store and attach to request', async () => {
      const userId = generateTestUserId()
      const expiredAt = Date.now() + 3600000

      // Create user in Redis
      await store.upsertUser(userId, 'test-access-token', 'test-refresh-token', expiredAt)

      const req = createMockRequest({ session: { user: userId } })
      const res = createMockResponse()
      const next = vi.fn()

      await middleware.getUser(req, res, next)

      expect(next).toHaveBeenCalledWith()
      expect(req.appUser).toBeDefined()
      expect(req.appUser.accessToken).toBe('test-access-token')
      expect(req.appUser.refreshToken).toBe('test-refresh-token')
      expect(req.appUser.expired_at).toBe(expiredAt)
    })

    it('should call next with error if user not found in store', async () => {
      const req = createMockRequest({ session: { user: 'non_existent_user_xyz' } })
      const res = createMockResponse()
      const next = vi.fn()

      await middleware.getUser(req, res, next)

      expect(next).toHaveBeenCalledWith(expect.any(Error))
    })
  })

  describe('refreshToken middleware', () => {
    it('should call next with error if no refresh token', async () => {
      const req = createMockRequest({
        appUser: {
          accessToken: 'token',
          expired_at: Date.now() + 3600000,
          // No refreshToken
        },
      })
      const res = createMockResponse()
      const next = vi.fn()

      await middleware.refreshToken(req, res, next)

      expect(next).toHaveBeenCalledWith(expect.any(Error))
      expect(next.mock.calls[0][0].message).toContain('No refresh token')
    })

    it('should call next without refreshing if token not expired', async () => {
      const req = createMockRequest({
        appUser: {
          accessToken: 'valid-token',
          refreshToken: 'refresh-token',
          expired_at: Date.now() + 3600000, // 1 hour from now
        },
      })
      const res = createMockResponse()
      const next = vi.fn()

      await middleware.refreshToken(req, res, next)

      // Should call next without error
      expect(next).toHaveBeenCalledWith()
    })

    // Note: Testing actual token refresh would require mocking the Zoom API
    // which is better suited for unit tests
  })

  describe('setZoomAuthHeader middleware', () => {
    it('should call next with error if no user in session', async () => {
      const req = createMockRequest({ session: {} })
      const res = createMockResponse()
      const next = vi.fn()

      await middleware.setZoomAuthHeader(req, res, next)

      expect(next).toHaveBeenCalledWith(expect.any(Error))
    })

    it('should call next with error if user not found', async () => {
      const req = createMockRequest({ session: { user: 'non_existent_auth_user' } })
      const res = createMockResponse()
      const next = vi.fn()

      await middleware.setZoomAuthHeader(req, res, next)

      // The middleware may pass either an Error object or a string rejection from store
      expect(next).toHaveBeenCalled()
      const arg = next.mock.calls[0][0]
      expect(arg).toBeDefined()
    })

    it('should set Authorization header with access token', async () => {
      const userId = generateTestUserId()
      const accessToken = 'zoom-access-token-for-auth-header'

      // Create user in Redis
      await store.upsertUser(userId, accessToken, 'refresh', Date.now() + 3600000)

      const req = createMockRequest({
        session: { user: userId },
        headers: {},
      })
      const res = createMockResponse()
      const next = vi.fn()

      await middleware.setZoomAuthHeader(req, res, next)

      expect(next).toHaveBeenCalledWith()
      expect(req.headers['Authorization']).toBe(`Bearer ${accessToken}`)
    })

    it('should call next with error if user has no access token', async () => {
      const userId = generateTestUserId()

      // Create user with tokens, then remove accessToken
      await store.upsertUser(userId, 'temp-token', 'refresh', Date.now() + 3600000)
      await store.updateUser(userId, { accessToken: '' })

      const req = createMockRequest({
        session: { user: userId },
        headers: {},
      })
      const res = createMockResponse()
      const next = vi.fn()

      await middleware.setZoomAuthHeader(req, res, next)

      expect(next).toHaveBeenCalledWith(expect.any(Error))
    })
  })

  describe('middleware chain integration', () => {
    it('should work with getUser followed by setZoomAuthHeader', async () => {
      const userId = generateTestUserId()
      const accessToken = 'chained-access-token'

      await store.upsertUser(userId, accessToken, 'refresh', Date.now() + 3600000)

      const req = createMockRequest({
        session: { user: userId },
        headers: {},
      })
      const res = createMockResponse()
      const results = []

      // Simulate Express middleware chain
      await middleware.getUser(req, res, (err) => {
        results.push({ middleware: 'getUser', error: err })
      })

      // If getUser succeeded, run setZoomAuthHeader
      if (!results[0].error) {
        await middleware.setZoomAuthHeader(req, res, (err) => {
          results.push({ middleware: 'setZoomAuthHeader', error: err })
        })
      }

      expect(results[0].error).toBeUndefined()
      expect(results[1].error).toBeUndefined()
      expect(req.appUser).toBeDefined()
      expect(req.headers['Authorization']).toBe(`Bearer ${accessToken}`)
    })

    it('should work with full middleware chain: getUser -> refreshToken -> setZoomAuthHeader', async () => {
      const userId = generateTestUserId()
      const accessToken = 'full-chain-token'
      const refreshToken = 'full-chain-refresh'
      const expiredAt = Date.now() + 3600000

      await store.upsertUser(userId, accessToken, refreshToken, expiredAt)

      const req = createMockRequest({
        session: { user: userId },
        headers: {},
      })
      const res = createMockResponse()

      // Run getUser
      await new Promise((resolve) => {
        middleware.getUser(req, res, resolve)
      })

      expect(req.appUser).toBeDefined()

      // Run refreshToken
      await new Promise((resolve) => {
        middleware.refreshToken(req, res, resolve)
      })

      // Run setZoomAuthHeader
      await new Promise((resolve) => {
        middleware.setZoomAuthHeader(req, res, resolve)
      })

      expect(req.headers['Authorization']).toBe(`Bearer ${accessToken}`)
    })
  })
})
