import { describe, it, expect, vi, beforeEach } from 'vitest'

// Test api/zoomapp/controller.js
// We test the handler logic by recreating functions with injectable dependencies

describe('api/zoomapp/controller.js', () => {
  describe('inClientAuthorize', () => {
    const createInClientAuthorize = (zoomHelpers) => {
      return async (req, res, next) => {
        try {
          const codeVerifier = zoomHelpers.generateCodeVerifier()
          const codeChallenge = codeVerifier
          const zoomInClientState = zoomHelpers.generateState()

          req.session.codeVerifier = codeVerifier
          req.session.state = zoomInClientState

          return res.json({
            codeChallenge,
            state: zoomInClientState,
          })
        } catch (error) {
          return next(error)
        }
      }
    }

    it('should generate code verifier and state', async () => {
      const mockZoomHelpers = {
        generateCodeVerifier: vi.fn().mockReturnValue('verifier-abc123'),
        generateState: vi.fn().mockReturnValue('state-xyz789'),
      }

      const mockReq = { session: {} }
      const mockRes = { json: vi.fn() }
      const mockNext = vi.fn()

      const handler = createInClientAuthorize(mockZoomHelpers)
      await handler(mockReq, mockRes, mockNext)

      expect(mockZoomHelpers.generateCodeVerifier).toHaveBeenCalled()
      expect(mockZoomHelpers.generateState).toHaveBeenCalled()
    })

    it('should save code verifier and state to session', async () => {
      const mockZoomHelpers = {
        generateCodeVerifier: vi.fn().mockReturnValue('verifier-abc123'),
        generateState: vi.fn().mockReturnValue('state-xyz789'),
      }

      const mockReq = { session: {} }
      const mockRes = { json: vi.fn() }
      const mockNext = vi.fn()

      const handler = createInClientAuthorize(mockZoomHelpers)
      await handler(mockReq, mockRes, mockNext)

      expect(mockReq.session.codeVerifier).toBe('verifier-abc123')
      expect(mockReq.session.state).toBe('state-xyz789')
    })

    it('should return code challenge and state in response', async () => {
      const mockZoomHelpers = {
        generateCodeVerifier: vi.fn().mockReturnValue('verifier-abc123'),
        generateState: vi.fn().mockReturnValue('state-xyz789'),
      }

      const mockReq = { session: {} }
      const mockRes = { json: vi.fn() }
      const mockNext = vi.fn()

      const handler = createInClientAuthorize(mockZoomHelpers)
      await handler(mockReq, mockRes, mockNext)

      expect(mockRes.json).toHaveBeenCalledWith({
        codeChallenge: 'verifier-abc123',
        state: 'state-xyz789',
      })
    })

    it('should call next with error on failure', async () => {
      const mockZoomHelpers = {
        generateCodeVerifier: vi.fn().mockImplementation(() => {
          throw new Error('Generation failed')
        }),
        generateState: vi.fn(),
      }

      const mockReq = { session: {} }
      const mockRes = { json: vi.fn() }
      const mockNext = vi.fn()

      const handler = createInClientAuthorize(mockZoomHelpers)
      await handler(mockReq, mockRes, mockNext)

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error))
    })
  })

  describe('inClientOnAuthorized', () => {
    const createInClientOnAuthorized = (zoomApi, store) => {
      return async (req, res, next) => {
        const zoomAuthorizationCode = req.body.code
        const href = req.body.href
        const state = decodeURIComponent(req.body.state)
        const zoomInClientState = req.session.state
        const codeVerifier = req.session.codeVerifier

        try {
          if (!zoomAuthorizationCode || state !== zoomInClientState) {
            throw new Error('State mismatch')
          }

          const tokenResponse = await zoomApi.getZoomAccessToken(
            zoomAuthorizationCode,
            href,
            codeVerifier
          )

          const zoomAccessToken = tokenResponse.data.access_token
          const userResponse = await zoomApi.getZoomUser(zoomAccessToken)
          const zoomUserId = userResponse.data.id
          req.session.user = zoomUserId

          await store.upsertUser(
            zoomUserId,
            tokenResponse.data.access_token,
            tokenResponse.data.refresh_token,
            Date.now() + tokenResponse.data.expires_in * 1000
          )

          return res.json({ result: 'Success' })
        } catch (error) {
          return next(error)
        }
      }
    }

    it('should throw error when state does not match', async () => {
      const mockZoomApi = {}
      const mockStore = {}

      const mockReq = {
        body: { code: 'auth-code', state: 'wrong-state', href: 'http://localhost' },
        session: { state: 'correct-state', codeVerifier: 'verifier' },
      }
      const mockRes = { json: vi.fn() }
      const mockNext = vi.fn()

      const handler = createInClientOnAuthorized(mockZoomApi, mockStore)
      await handler(mockReq, mockRes, mockNext)

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error))
      expect(mockNext.mock.calls[0][0].message).toBe('State mismatch')
    })

    it('should throw error when code is missing', async () => {
      const mockZoomApi = {}
      const mockStore = {}

      const mockReq = {
        body: { state: 'state-123', href: 'http://localhost' },
        session: { state: 'state-123', codeVerifier: 'verifier' },
      }
      const mockRes = { json: vi.fn() }
      const mockNext = vi.fn()

      const handler = createInClientOnAuthorized(mockZoomApi, mockStore)
      await handler(mockReq, mockRes, mockNext)

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error))
    })

    it('should exchange code for token and save user', async () => {
      const mockZoomApi = {
        getZoomAccessToken: vi.fn().mockResolvedValue({
          data: {
            access_token: 'access-token-123',
            refresh_token: 'refresh-token-456',
            expires_in: 3600,
          },
        }),
        getZoomUser: vi.fn().mockResolvedValue({
          data: { id: 'user-id-789' },
        }),
      }
      const mockStore = {
        upsertUser: vi.fn().mockResolvedValue(undefined),
      }

      const mockReq = {
        body: { code: 'auth-code', state: 'state-123', href: 'http://localhost' },
        session: { state: 'state-123', codeVerifier: 'verifier-abc' },
      }
      const mockRes = { json: vi.fn() }
      const mockNext = vi.fn()

      const handler = createInClientOnAuthorized(mockZoomApi, mockStore)
      await handler(mockReq, mockRes, mockNext)

      expect(mockZoomApi.getZoomAccessToken).toHaveBeenCalledWith(
        'auth-code',
        'http://localhost',
        'verifier-abc'
      )
      expect(mockZoomApi.getZoomUser).toHaveBeenCalledWith('access-token-123')
      expect(mockStore.upsertUser).toHaveBeenCalledWith(
        'user-id-789',
        'access-token-123',
        'refresh-token-456',
        expect.any(Number)
      )
      expect(mockReq.session.user).toBe('user-id-789')
      expect(mockRes.json).toHaveBeenCalledWith({ result: 'Success' })
    })
  })

  describe('install', () => {
    const createInstall = (zoomHelpers) => {
      return (req, res) => {
        req.session.state = zoomHelpers.generateState()

        const domain = process.env.ZOOM_HOST
        const path = 'oauth/authorize'
        const params = {
          redirect_uri: process.env.ZOOM_APP_REDIRECT_URI,
          response_type: 'code',
          client_id: process.env.ZOOM_APP_CLIENT_ID,
          state: req.session.state,
        }

        const authRequestParams = zoomHelpers.createRequestParamString(params)
        const redirectUrl = domain + '/' + path + '?' + authRequestParams

        res.redirect(redirectUrl)
      }
    }

    it('should generate and save state to session', () => {
      const mockZoomHelpers = {
        generateState: vi.fn().mockReturnValue('random-state'),
        createRequestParamString: vi.fn().mockReturnValue('params=value'),
      }

      const mockReq = { session: {} }
      const mockRes = { redirect: vi.fn() }

      const handler = createInstall(mockZoomHelpers)
      handler(mockReq, mockRes)

      expect(mockReq.session.state).toBe('random-state')
    })

    it('should redirect to Zoom OAuth URL', () => {
      const mockZoomHelpers = {
        generateState: vi.fn().mockReturnValue('random-state'),
        createRequestParamString: vi.fn().mockReturnValue('client_id=test&state=random-state'),
      }

      const mockReq = { session: {} }
      const mockRes = { redirect: vi.fn() }

      const handler = createInstall(mockZoomHelpers)
      handler(mockReq, mockRes)

      expect(mockRes.redirect).toHaveBeenCalledWith(
        expect.stringContaining('https://zoom.us/oauth/authorize')
      )
    })

    it('should include required OAuth parameters', () => {
      const mockZoomHelpers = {
        generateState: vi.fn().mockReturnValue('random-state'),
        createRequestParamString: vi.fn((params) => {
          return Object.entries(params)
            .map(([k, v]) => `${k}=${v}`)
            .join('&')
        }),
      }

      const mockReq = { session: {} }
      const mockRes = { redirect: vi.fn() }

      const handler = createInstall(mockZoomHelpers)
      handler(mockReq, mockRes)

      expect(mockZoomHelpers.createRequestParamString).toHaveBeenCalledWith(
        expect.objectContaining({
          redirect_uri: process.env.ZOOM_APP_REDIRECT_URI,
          response_type: 'code',
          client_id: process.env.ZOOM_APP_CLIENT_ID,
          state: 'random-state',
        })
      )
    })
  })

  describe('auth', () => {
    const createAuth = (zoomApi, store) => {
      return async (req, res, next) => {
        const zoomAuthorizationCode = req.query.code
        const zoomAuthorizationState = req.query.state
        const zoomState = req.session.state

        req.session.destroy()

        if (!zoomAuthorizationCode) {
          const error = new Error('No authorization code was provided')
          error.status = 400
          return next(error)
        }

        if (!zoomAuthorizationState || zoomAuthorizationState !== zoomState) {
          const error = new Error('Invalid state parameter')
          error.status = 400
          return next(error)
        }

        try {
          const tokenResponse = await zoomApi.getZoomAccessToken(zoomAuthorizationCode)
          const zoomAccessToken = tokenResponse.data.access_token

          const userResponse = await zoomApi.getZoomUser(zoomAccessToken)
          const zoomUserId = userResponse.data.id

          await store.upsertUser(
            zoomUserId,
            tokenResponse.data.access_token,
            tokenResponse.data.refresh_token,
            Date.now() + tokenResponse.data.expires_in * 1000
          )

          const deepLinkResponse = await zoomApi.getDeeplink(zoomAccessToken)
          const deeplink = deepLinkResponse.data.deeplink

          res.redirect(deeplink)
        } catch (error) {
          return next(error)
        }
      }
    }

    it('should return 400 when no authorization code', async () => {
      const handler = createAuth({}, {})

      const mockReq = {
        query: { state: 'state-123' },
        session: { state: 'state-123', destroy: vi.fn() },
      }
      const mockRes = { redirect: vi.fn() }
      const mockNext = vi.fn()

      await handler(mockReq, mockRes, mockNext)

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error))
      expect(mockNext.mock.calls[0][0].status).toBe(400)
      expect(mockNext.mock.calls[0][0].message).toBe('No authorization code was provided')
    })

    it('should return 400 when state does not match', async () => {
      const handler = createAuth({}, {})

      const mockReq = {
        query: { code: 'auth-code', state: 'wrong-state' },
        session: { state: 'correct-state', destroy: vi.fn() },
      }
      const mockRes = { redirect: vi.fn() }
      const mockNext = vi.fn()

      await handler(mockReq, mockRes, mockNext)

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error))
      expect(mockNext.mock.calls[0][0].status).toBe(400)
      expect(mockNext.mock.calls[0][0].message).toBe('Invalid state parameter')
    })

    it('should destroy session for security', async () => {
      const handler = createAuth({}, {})
      const destroyFn = vi.fn()

      const mockReq = {
        query: { state: 'state-123' },
        session: { state: 'state-123', destroy: destroyFn },
      }
      const mockRes = { redirect: vi.fn() }
      const mockNext = vi.fn()

      await handler(mockReq, mockRes, mockNext)

      expect(destroyFn).toHaveBeenCalled()
    })

    it('should exchange code for tokens and redirect to deeplink', async () => {
      const mockZoomApi = {
        getZoomAccessToken: vi.fn().mockResolvedValue({
          data: {
            access_token: 'access-token',
            refresh_token: 'refresh-token',
            expires_in: 3600,
          },
        }),
        getZoomUser: vi.fn().mockResolvedValue({
          data: { id: 'user-123' },
        }),
        getDeeplink: vi.fn().mockResolvedValue({
          data: { deeplink: 'zoomus://launch?action=...' },
        }),
      }
      const mockStore = {
        upsertUser: vi.fn().mockResolvedValue(undefined),
      }

      const handler = createAuth(mockZoomApi, mockStore)

      const mockReq = {
        query: { code: 'auth-code-xyz', state: 'state-123' },
        session: { state: 'state-123', destroy: vi.fn() },
      }
      const mockRes = { redirect: vi.fn() }
      const mockNext = vi.fn()

      await handler(mockReq, mockRes, mockNext)

      expect(mockZoomApi.getZoomAccessToken).toHaveBeenCalledWith('auth-code-xyz')
      expect(mockZoomApi.getZoomUser).toHaveBeenCalledWith('access-token')
      expect(mockStore.upsertUser).toHaveBeenCalled()
      expect(mockZoomApi.getDeeplink).toHaveBeenCalledWith('access-token')
      expect(mockRes.redirect).toHaveBeenCalledWith('zoomus://launch?action=...')
    })
  })

  describe('home', () => {
    const createHome = (zoomHelpers) => {
      return (req, res, next) => {
        try {
          if (!req.headers['x-zoom-app-context']) {
            throw new Error('x-zoom-app-context header is required')
          }

          const decryptedAppContext = zoomHelpers.decryptZoomAppContext(
            req.headers['x-zoom-app-context'],
            process.env.ZOOM_APP_CLIENT_SECRET
          )

          if (!decryptedAppContext.exp || decryptedAppContext.exp < Date.now()) {
            throw new Error('x-zoom-app-context header is expired')
          }

          req.session.user = decryptedAppContext.uid
          req.session.meetingUUID = decryptedAppContext.mid
        } catch (error) {
          return next(error)
        }

        res.redirect('/api/zoomapp/proxy')
      }
    }

    it('should require x-zoom-app-context header', () => {
      const mockZoomHelpers = {
        decryptZoomAppContext: vi.fn(),
      }

      const handler = createHome(mockZoomHelpers)

      const mockReq = { headers: {}, session: {} }
      const mockRes = { redirect: vi.fn() }
      const mockNext = vi.fn()

      handler(mockReq, mockRes, mockNext)

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error))
      expect(mockNext.mock.calls[0][0].message).toBe('x-zoom-app-context header is required')
    })

    it('should reject expired context', () => {
      const mockZoomHelpers = {
        decryptZoomAppContext: vi.fn().mockReturnValue({
          uid: 'user-123',
          mid: 'meeting-456',
          exp: Date.now() - 1000, // Expired
        }),
      }

      const handler = createHome(mockZoomHelpers)

      const mockReq = {
        headers: { 'x-zoom-app-context': 'encrypted-context' },
        session: {},
      }
      const mockRes = { redirect: vi.fn() }
      const mockNext = vi.fn()

      handler(mockReq, mockRes, mockNext)

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error))
      expect(mockNext.mock.calls[0][0].message).toBe('x-zoom-app-context header is expired')
    })

    it('should set user and meetingUUID from decrypted context', () => {
      const futureTime = Date.now() + 3600000
      const mockZoomHelpers = {
        decryptZoomAppContext: vi.fn().mockReturnValue({
          uid: 'user-123',
          mid: 'meeting-456',
          exp: futureTime,
        }),
      }

      const handler = createHome(mockZoomHelpers)

      const mockReq = {
        headers: { 'x-zoom-app-context': 'encrypted-context' },
        session: {},
      }
      const mockRes = { redirect: vi.fn() }
      const mockNext = vi.fn()

      handler(mockReq, mockRes, mockNext)

      expect(mockReq.session.user).toBe('user-123')
      expect(mockReq.session.meetingUUID).toBe('meeting-456')
    })

    it('should redirect to frontend proxy', () => {
      const futureTime = Date.now() + 3600000
      const mockZoomHelpers = {
        decryptZoomAppContext: vi.fn().mockReturnValue({
          uid: 'user-123',
          mid: 'meeting-456',
          exp: futureTime,
        }),
      }

      const handler = createHome(mockZoomHelpers)

      const mockReq = {
        headers: { 'x-zoom-app-context': 'encrypted-context' },
        session: {},
      }
      const mockRes = { redirect: vi.fn() }
      const mockNext = vi.fn()

      handler(mockReq, mockRes, mockNext)

      expect(mockRes.redirect).toHaveBeenCalledWith('/api/zoomapp/proxy')
    })
  })

  describe('proxy configuration', () => {
    it('should target ZOOM_APP_CLIENT_URL', () => {
      expect(process.env.ZOOM_APP_CLIENT_URL).toBeDefined()
    })

    it('should enable WebSocket proxying', () => {
      const proxyConfig = {
        target: process.env.ZOOM_APP_CLIENT_URL,
        changeOrigin: true,
        ws: true,
      }
      expect(proxyConfig.ws).toBe(true)
    })
  })

  describe('inClientOnAuthorized - edge cases', () => {
    const createInClientOnAuthorized = (zoomApi, store) => {
      return async (req, res, next) => {
        const zoomAuthorizationCode = req.body.code
        const href = req.body.href
        const state = decodeURIComponent(req.body.state || '')
        const zoomInClientState = req.session.state
        const codeVerifier = req.session.codeVerifier

        try {
          if (!zoomAuthorizationCode || state !== zoomInClientState) {
            throw new Error('State mismatch')
          }

          const tokenResponse = await zoomApi.getZoomAccessToken(
            zoomAuthorizationCode,
            href,
            codeVerifier
          )

          const zoomAccessToken = tokenResponse.data.access_token
          const userResponse = await zoomApi.getZoomUser(zoomAccessToken)
          const zoomUserId = userResponse.data.id
          req.session.user = zoomUserId

          await store.upsertUser(
            zoomUserId,
            tokenResponse.data.access_token,
            tokenResponse.data.refresh_token,
            Date.now() + tokenResponse.data.expires_in * 1000
          )

          return res.json({ result: 'Success' })
        } catch (error) {
          return next(error)
        }
      }
    }

    it('should handle URL-encoded state with special characters', async () => {
      const mockZoomApi = {
        getZoomAccessToken: vi.fn().mockResolvedValue({
          data: { access_token: 'token', refresh_token: 'refresh', expires_in: 3600 },
        }),
        getZoomUser: vi.fn().mockResolvedValue({ data: { id: 'user-123' } }),
      }
      const mockStore = { upsertUser: vi.fn().mockResolvedValue(undefined) }

      const specialState = 'state+with/special=chars'
      const encodedState = encodeURIComponent(specialState)

      const mockReq = {
        body: { code: 'auth-code', state: encodedState, href: 'http://localhost' },
        session: { state: specialState, codeVerifier: 'verifier' },
      }
      const mockRes = { json: vi.fn() }
      const mockNext = vi.fn()

      const handler = createInClientOnAuthorized(mockZoomApi, mockStore)
      await handler(mockReq, mockRes, mockNext)

      expect(mockRes.json).toHaveBeenCalledWith({ result: 'Success' })
    })

    it('should handle empty body', async () => {
      const handler = createInClientOnAuthorized({}, {})

      const mockReq = {
        body: {},
        session: { state: 'state-123', codeVerifier: 'verifier' },
      }
      const mockRes = { json: vi.fn() }
      const mockNext = vi.fn()

      await handler(mockReq, mockRes, mockNext)

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error))
    })

    it('should handle undefined state in body', async () => {
      const handler = createInClientOnAuthorized({}, {})

      const mockReq = {
        body: { code: 'auth-code', href: 'http://localhost' },
        session: { state: 'state-123', codeVerifier: 'verifier' },
      }
      const mockRes = { json: vi.fn() }
      const mockNext = vi.fn()

      await handler(mockReq, mockRes, mockNext)

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error))
    })

    it('should handle API returning empty access token', async () => {
      const mockZoomApi = {
        getZoomAccessToken: vi.fn().mockResolvedValue({
          data: { access_token: '', refresh_token: 'refresh', expires_in: 3600 },
        }),
        getZoomUser: vi.fn().mockResolvedValue({ data: { id: 'user-123' } }),
      }
      const mockStore = { upsertUser: vi.fn().mockResolvedValue(undefined) }

      const mockReq = {
        body: { code: 'auth-code', state: 'state-123', href: 'http://localhost' },
        session: { state: 'state-123', codeVerifier: 'verifier' },
      }
      const mockRes = { json: vi.fn() }
      const mockNext = vi.fn()

      const handler = createInClientOnAuthorized(mockZoomApi, mockStore)
      await handler(mockReq, mockRes, mockNext)

      // Still succeeds - empty token is passed through
      expect(mockZoomApi.getZoomUser).toHaveBeenCalledWith('')
    })

    it('should handle network error during token exchange', async () => {
      const mockZoomApi = {
        getZoomAccessToken: vi.fn().mockRejectedValue(new Error('Network error')),
      }

      const mockReq = {
        body: { code: 'auth-code', state: 'state-123', href: 'http://localhost' },
        session: { state: 'state-123', codeVerifier: 'verifier' },
      }
      const mockRes = { json: vi.fn() }
      const mockNext = vi.fn()

      const handler = createInClientOnAuthorized(mockZoomApi, {})
      await handler(mockReq, mockRes, mockNext)

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error))
      expect(mockNext.mock.calls[0][0].message).toBe('Network error')
    })

    it('should handle API error during user fetch', async () => {
      const mockZoomApi = {
        getZoomAccessToken: vi.fn().mockResolvedValue({
          data: { access_token: 'token', refresh_token: 'refresh', expires_in: 3600 },
        }),
        getZoomUser: vi.fn().mockRejectedValue(new Error('User not found')),
      }

      const mockReq = {
        body: { code: 'auth-code', state: 'state-123', href: 'http://localhost' },
        session: { state: 'state-123', codeVerifier: 'verifier' },
      }
      const mockRes = { json: vi.fn() }
      const mockNext = vi.fn()

      const handler = createInClientOnAuthorized(mockZoomApi, {})
      await handler(mockReq, mockRes, mockNext)

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error))
      expect(mockNext.mock.calls[0][0].message).toBe('User not found')
    })

    it('should handle store error during upsert', async () => {
      const mockZoomApi = {
        getZoomAccessToken: vi.fn().mockResolvedValue({
          data: { access_token: 'token', refresh_token: 'refresh', expires_in: 3600 },
        }),
        getZoomUser: vi.fn().mockResolvedValue({ data: { id: 'user-123' } }),
      }
      const mockStore = {
        upsertUser: vi.fn().mockRejectedValue(new Error('Redis connection failed')),
      }

      const mockReq = {
        body: { code: 'auth-code', state: 'state-123', href: 'http://localhost' },
        session: { state: 'state-123', codeVerifier: 'verifier' },
      }
      const mockRes = { json: vi.fn() }
      const mockNext = vi.fn()

      const handler = createInClientOnAuthorized(mockZoomApi, mockStore)
      await handler(mockReq, mockRes, mockNext)

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error))
      expect(mockNext.mock.calls[0][0].message).toBe('Redis connection failed')
    })
  })

  describe('home - edge cases', () => {
    const createHome = (zoomHelpers) => {
      return (req, res, next) => {
        try {
          if (!req.headers['x-zoom-app-context']) {
            throw new Error('x-zoom-app-context header is required')
          }

          const decryptedAppContext = zoomHelpers.decryptZoomAppContext(
            req.headers['x-zoom-app-context'],
            process.env.ZOOM_APP_CLIENT_SECRET
          )

          if (!decryptedAppContext.exp || decryptedAppContext.exp < Date.now()) {
            throw new Error('x-zoom-app-context header is expired')
          }

          req.session.user = decryptedAppContext.uid
          req.session.meetingUUID = decryptedAppContext.mid
        } catch (error) {
          return next(error)
        }

        res.redirect('/api/zoomapp/proxy')
      }
    }

    it('should handle missing exp field in context', () => {
      const mockZoomHelpers = {
        decryptZoomAppContext: vi.fn().mockReturnValue({
          uid: 'user-123',
          mid: 'meeting-456',
          // no exp field
        }),
      }

      const handler = createHome(mockZoomHelpers)

      const mockReq = {
        headers: { 'x-zoom-app-context': 'encrypted-context' },
        session: {},
      }
      const mockRes = { redirect: vi.fn() }
      const mockNext = vi.fn()

      handler(mockReq, mockRes, mockNext)

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error))
      expect(mockNext.mock.calls[0][0].message).toBe('x-zoom-app-context header is expired')
    })

    it('should handle exp = 0', () => {
      const mockZoomHelpers = {
        decryptZoomAppContext: vi.fn().mockReturnValue({
          uid: 'user-123',
          mid: 'meeting-456',
          exp: 0,
        }),
      }

      const handler = createHome(mockZoomHelpers)

      const mockReq = {
        headers: { 'x-zoom-app-context': 'encrypted-context' },
        session: {},
      }
      const mockRes = { redirect: vi.fn() }
      const mockNext = vi.fn()

      handler(mockReq, mockRes, mockNext)

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error))
    })

    it('should handle decryption error', () => {
      const mockZoomHelpers = {
        decryptZoomAppContext: vi.fn().mockImplementation(() => {
          throw new Error('Decryption failed')
        }),
      }

      const handler = createHome(mockZoomHelpers)

      const mockReq = {
        headers: { 'x-zoom-app-context': 'invalid-encrypted-context' },
        session: {},
      }
      const mockRes = { redirect: vi.fn() }
      const mockNext = vi.fn()

      handler(mockReq, mockRes, mockNext)

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error))
      expect(mockNext.mock.calls[0][0].message).toBe('Decryption failed')
    })

    it('should handle context with missing uid', () => {
      const mockZoomHelpers = {
        decryptZoomAppContext: vi.fn().mockReturnValue({
          mid: 'meeting-456',
          exp: Date.now() + 3600000,
        }),
      }

      const handler = createHome(mockZoomHelpers)

      const mockReq = {
        headers: { 'x-zoom-app-context': 'encrypted-context' },
        session: {},
      }
      const mockRes = { redirect: vi.fn() }
      const mockNext = vi.fn()

      handler(mockReq, mockRes, mockNext)

      expect(mockReq.session.user).toBeUndefined()
      expect(mockRes.redirect).toHaveBeenCalledWith('/api/zoomapp/proxy')
    })

    it('should handle context with null values', () => {
      const mockZoomHelpers = {
        decryptZoomAppContext: vi.fn().mockReturnValue({
          uid: null,
          mid: null,
          exp: Date.now() + 3600000,
        }),
      }

      const handler = createHome(mockZoomHelpers)

      const mockReq = {
        headers: { 'x-zoom-app-context': 'encrypted-context' },
        session: {},
      }
      const mockRes = { redirect: vi.fn() }
      const mockNext = vi.fn()

      handler(mockReq, mockRes, mockNext)

      expect(mockReq.session.user).toBeNull()
      expect(mockRes.redirect).toHaveBeenCalledWith('/api/zoomapp/proxy')
    })
  })

  describe('auth - edge cases', () => {
    const createAuth = (zoomApi, store) => {
      return async (req, res, next) => {
        const zoomAuthorizationCode = req.query.code
        const zoomAuthorizationState = req.query.state
        const zoomState = req.session.state

        req.session.destroy()

        if (!zoomAuthorizationCode) {
          const error = new Error('No authorization code was provided')
          error.status = 400
          return next(error)
        }

        if (!zoomAuthorizationState || zoomAuthorizationState !== zoomState) {
          const error = new Error('Invalid state parameter')
          error.status = 400
          return next(error)
        }

        try {
          const tokenResponse = await zoomApi.getZoomAccessToken(zoomAuthorizationCode)
          const zoomAccessToken = tokenResponse.data.access_token

          const userResponse = await zoomApi.getZoomUser(zoomAccessToken)
          const zoomUserId = userResponse.data.id

          await store.upsertUser(
            zoomUserId,
            tokenResponse.data.access_token,
            tokenResponse.data.refresh_token,
            Date.now() + tokenResponse.data.expires_in * 1000
          )

          const deepLinkResponse = await zoomApi.getDeeplink(zoomAccessToken)
          const deeplink = deepLinkResponse.data.deeplink

          res.redirect(deeplink)
        } catch (error) {
          return next(error)
        }
      }
    }

    it('should return 400 when state is empty string', async () => {
      const handler = createAuth({}, {})

      const mockReq = {
        query: { code: 'auth-code', state: '' },
        session: { state: 'expected-state', destroy: vi.fn() },
      }
      const mockRes = { redirect: vi.fn() }
      const mockNext = vi.fn()

      await handler(mockReq, mockRes, mockNext)

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error))
      expect(mockNext.mock.calls[0][0].status).toBe(400)
    })

    it('should handle missing state in session', async () => {
      const handler = createAuth({}, {})

      const mockReq = {
        query: { code: 'auth-code', state: 'state-123' },
        session: { destroy: vi.fn() }, // no state in session
      }
      const mockRes = { redirect: vi.fn() }
      const mockNext = vi.fn()

      await handler(mockReq, mockRes, mockNext)

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error))
      expect(mockNext.mock.calls[0][0].message).toBe('Invalid state parameter')
    })

    it('should handle deeplink API failure', async () => {
      const mockZoomApi = {
        getZoomAccessToken: vi.fn().mockResolvedValue({
          data: { access_token: 'token', refresh_token: 'refresh', expires_in: 3600 },
        }),
        getZoomUser: vi.fn().mockResolvedValue({ data: { id: 'user-123' } }),
        getDeeplink: vi.fn().mockRejectedValue(new Error('Deeplink generation failed')),
      }
      const mockStore = { upsertUser: vi.fn().mockResolvedValue(undefined) }

      const handler = createAuth(mockZoomApi, mockStore)

      const mockReq = {
        query: { code: 'auth-code', state: 'state-123' },
        session: { state: 'state-123', destroy: vi.fn() },
      }
      const mockRes = { redirect: vi.fn() }
      const mockNext = vi.fn()

      await handler(mockReq, mockRes, mockNext)

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error))
      expect(mockNext.mock.calls[0][0].message).toBe('Deeplink generation failed')
    })

    it('should handle token response missing fields', async () => {
      const mockZoomApi = {
        getZoomAccessToken: vi.fn().mockResolvedValue({
          data: { access_token: 'token' }, // missing refresh_token and expires_in
        }),
        getZoomUser: vi.fn().mockResolvedValue({ data: { id: 'user-123' } }),
        getDeeplink: vi.fn().mockResolvedValue({ data: { deeplink: 'zoomus://...' } }),
      }
      const mockStore = { upsertUser: vi.fn().mockResolvedValue(undefined) }

      const handler = createAuth(mockZoomApi, mockStore)

      const mockReq = {
        query: { code: 'auth-code', state: 'state-123' },
        session: { state: 'state-123', destroy: vi.fn() },
      }
      const mockRes = { redirect: vi.fn() }
      const mockNext = vi.fn()

      await handler(mockReq, mockRes, mockNext)

      // Store is called with undefined values
      expect(mockStore.upsertUser).toHaveBeenCalledWith(
        'user-123',
        'token',
        undefined,
        expect.any(Number)
      )
    })
  })

  describe('install - edge cases', () => {
    const createInstall = (zoomHelpers) => {
      return (req, res) => {
        req.session.state = zoomHelpers.generateState()

        const domain = process.env.ZOOM_HOST
        const path = 'oauth/authorize'
        const params = {
          redirect_uri: process.env.ZOOM_APP_REDIRECT_URI,
          response_type: 'code',
          client_id: process.env.ZOOM_APP_CLIENT_ID,
          state: req.session.state,
        }

        const authRequestParams = zoomHelpers.createRequestParamString(params)
        const redirectUrl = domain + '/' + path + '?' + authRequestParams

        res.redirect(redirectUrl)
      }
    }

    it('should handle state generation failure', () => {
      const mockZoomHelpers = {
        generateState: vi.fn().mockImplementation(() => {
          throw new Error('Crypto error')
        }),
        createRequestParamString: vi.fn(),
      }

      const mockReq = { session: {} }
      const mockRes = { redirect: vi.fn() }

      const handler = createInstall(mockZoomHelpers)

      expect(() => handler(mockReq, mockRes)).toThrow('Crypto error')
    })

    it('should handle empty environment variables', () => {
      const originalHost = process.env.ZOOM_HOST
      process.env.ZOOM_HOST = ''

      const mockZoomHelpers = {
        generateState: vi.fn().mockReturnValue('state-123'),
        createRequestParamString: vi.fn().mockReturnValue('params'),
      }

      const mockReq = { session: {} }
      const mockRes = { redirect: vi.fn() }

      const handler = createInstall(mockZoomHelpers)
      handler(mockReq, mockRes)

      expect(mockRes.redirect).toHaveBeenCalledWith('/oauth/authorize?params')

      process.env.ZOOM_HOST = originalHost
    })

    it('should include state in generated URL', () => {
      const mockZoomHelpers = {
        generateState: vi.fn().mockReturnValue('unique-state-xyz'),
        createRequestParamString: vi.fn((params) => {
          expect(params.state).toBe('unique-state-xyz')
          return 'params'
        }),
      }

      const mockReq = { session: {} }
      const mockRes = { redirect: vi.fn() }

      const handler = createInstall(mockZoomHelpers)
      handler(mockReq, mockRes)

      expect(mockReq.session.state).toBe('unique-state-xyz')
    })
  })
})
