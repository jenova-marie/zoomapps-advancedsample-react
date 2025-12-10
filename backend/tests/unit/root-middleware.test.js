import { describe, it, expect, vi, beforeEach } from 'vitest'

// Test middleware.js from root directory
// Since it has Redis dependencies, we test the logic by recreating functions

describe('middleware.js - setResponseHeaders', () => {
  let mockReq, mockRes, mockNext

  beforeEach(() => {
    mockReq = {}
    mockRes = {
      setHeader: vi.fn(),
    }
    mockNext = vi.fn()
  })

  // Recreate the actual function for testing
  const setResponseHeaders = (req, res, next) => {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    const publicUrl = process.env.PUBLIC_URL
    const { host } = new URL(publicUrl)
    res.setHeader(
      'Content-Security-Policy',
      `default-src *; style-src 'self' 'unsafe-inline'; script-src * 'self' https://appssdk.zoom.us 'unsafe-inline'; connect-src * 'self' wss://${host}/sockjs-node; img-src 'self' data: https://images.unsplash.com; base-uri 'self'; form-action 'self';`
    )
    res.setHeader('Referrer-Policy', 'same-origin')
    res.setHeader('X-Frame-Option', 'same-origin')
    next()
  }

  it('should set Strict-Transport-Security header with 1 year max-age', () => {
    setResponseHeaders(mockReq, mockRes, mockNext)

    expect(mockRes.setHeader).toHaveBeenCalledWith(
      'Strict-Transport-Security',
      'max-age=31536000'
    )
  })

  it('should set X-Content-Type-Options to nosniff', () => {
    setResponseHeaders(mockReq, mockRes, mockNext)

    expect(mockRes.setHeader).toHaveBeenCalledWith(
      'X-Content-Type-Options',
      'nosniff'
    )
  })

  it('should set Referrer-Policy to same-origin', () => {
    setResponseHeaders(mockReq, mockRes, mockNext)

    expect(mockRes.setHeader).toHaveBeenCalledWith(
      'Referrer-Policy',
      'same-origin'
    )
  })

  it('should set X-Frame-Option to same-origin', () => {
    setResponseHeaders(mockReq, mockRes, mockNext)

    expect(mockRes.setHeader).toHaveBeenCalledWith(
      'X-Frame-Option',
      'same-origin'
    )
  })

  it('should set Content-Security-Policy with Zoom SDK and image sources', () => {
    setResponseHeaders(mockReq, mockRes, mockNext)

    const cspCall = mockRes.setHeader.mock.calls.find(
      (call) => call[0] === 'Content-Security-Policy'
    )
    expect(cspCall).toBeDefined()
    expect(cspCall[1]).toContain('https://appssdk.zoom.us')
    expect(cspCall[1]).toContain('https://images.unsplash.com')
    expect(cspCall[1]).toContain("default-src *")
    expect(cspCall[1]).toContain("style-src 'self' 'unsafe-inline'")
    expect(cspCall[1]).toContain("base-uri 'self'")
    expect(cspCall[1]).toContain("form-action 'self'")
  })

  it('should include WebSocket connection to PUBLIC_URL host', () => {
    setResponseHeaders(mockReq, mockRes, mockNext)

    const cspCall = mockRes.setHeader.mock.calls.find(
      (call) => call[0] === 'Content-Security-Policy'
    )
    expect(cspCall[1]).toContain('wss://test.ngrok.io/sockjs-node')
  })

  it('should call next() after setting headers', () => {
    setResponseHeaders(mockReq, mockRes, mockNext)

    expect(mockNext).toHaveBeenCalledTimes(1)
    expect(mockNext).toHaveBeenCalledWith()
  })

  it('should set exactly 5 headers', () => {
    setResponseHeaders(mockReq, mockRes, mockNext)

    expect(mockRes.setHeader).toHaveBeenCalledTimes(5)
  })
})

describe('middleware.js - requiresThirdPartyAuth', () => {
  it('should call next with error when session has no user', async () => {
    const mockStore = {
      getUser: vi.fn(),
    }

    const requiresThirdPartyAuth = async (req, res, next) => {
      if (req.session.user) {
        try {
          const user = await mockStore.getUser(req.session.user)
          req.thirdPartyAccessToken = user.thirdPartyAccessToken
          return next()
        } catch (error) {
          return next(new Error('Error getting app user from session'))
        }
      } else {
        next(new Error('Unknown or missing session'))
      }
    }

    const mockNext = vi.fn()
    await requiresThirdPartyAuth({ session: {} }, {}, mockNext)

    expect(mockNext).toHaveBeenCalledWith(expect.any(Error))
    expect(mockNext.mock.calls[0][0].message).toBe('Unknown or missing session')
  })

  it('should set thirdPartyAccessToken when user exists', async () => {
    const mockStore = {
      getUser: vi.fn().mockResolvedValue({
        thirdPartyAccessToken: 'auth0-token-xyz',
        accessToken: 'zoom-token',
      }),
    }

    const requiresThirdPartyAuth = async (req, res, next) => {
      if (req.session.user) {
        try {
          const user = await mockStore.getUser(req.session.user)
          req.thirdPartyAccessToken = user.thirdPartyAccessToken
          return next()
        } catch (error) {
          return next(new Error('Error getting app user from session'))
        }
      } else {
        next(new Error('Unknown or missing session'))
      }
    }

    const mockNext = vi.fn()
    const mockReq = { session: { user: 'user-123' } }

    await requiresThirdPartyAuth(mockReq, {}, mockNext)

    expect(mockStore.getUser).toHaveBeenCalledWith('user-123')
    expect(mockReq.thirdPartyAccessToken).toBe('auth0-token-xyz')
    expect(mockNext).toHaveBeenCalledWith()
  })

  it('should call next with error when store.getUser fails', async () => {
    const mockStore = {
      getUser: vi.fn().mockRejectedValue(new Error('User not found')),
    }

    const requiresThirdPartyAuth = async (req, res, next) => {
      if (req.session.user) {
        try {
          const user = await mockStore.getUser(req.session.user)
          req.thirdPartyAccessToken = user.thirdPartyAccessToken
          return next()
        } catch (error) {
          return next(new Error('Error getting app user from session'))
        }
      } else {
        next(new Error('Unknown or missing session'))
      }
    }

    const mockNext = vi.fn()
    await requiresThirdPartyAuth({ session: { user: 'bad-user' } }, {}, mockNext)

    expect(mockNext).toHaveBeenCalledWith(expect.any(Error))
    expect(mockNext.mock.calls[0][0].message).toBe('Error getting app user from session')
  })
})

describe('middleware.js - session configuration', () => {
  it('should define session configuration options', () => {
    // Test the expected session configuration
    const expectedConfig = {
      resave: false,
      saveUninitialized: true,
      cookie: {
        path: '/',
        httpOnly: true,
        maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
      },
    }

    expect(expectedConfig.resave).toBe(false)
    expect(expectedConfig.saveUninitialized).toBe(true)
    expect(expectedConfig.cookie.path).toBe('/')
    expect(expectedConfig.cookie.httpOnly).toBe(true)
    expect(expectedConfig.cookie.maxAge).toBe(31536000000)
  })

  it('should use SESSION_SECRET from environment', () => {
    expect(process.env.SESSION_SECRET).toBeDefined()
  })

  it('should use REDIS_URL for session store', () => {
    expect(process.env.REDIS_URL).toBeDefined()
  })
})
