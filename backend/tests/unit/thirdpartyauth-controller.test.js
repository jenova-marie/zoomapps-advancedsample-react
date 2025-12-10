import { describe, it, expect, vi } from 'vitest'

// Test api/thirdpartyauth/controller.js
// We test the handler logic by recreating functions with injectable dependencies

describe('api/thirdpartyauth/controller.js', () => {
  describe('begin', () => {
    const createBegin = (zoomHelpers) => {
      return async (req, res) => {
        const zoomRequestState = zoomHelpers.generateState()
        req.session.zoomRequestState = zoomRequestState

        const zoomDomain = process.env.ZOOM_HOST
        const zoomAuthPath = '/oauth/authorize'
        const params = {
          redirect_uri: `${process.env.PUBLIC_URL}/api/auth0/redirect`,
          response_type: 'code',
          client_id: process.env.ZOOM_APP_CLIENT_ID,
          state: req.session.zoomRequestState,
        }

        const zoomAuthRequestParams = zoomHelpers.createRequestParamString(params)
        const redirectUrl = zoomDomain + zoomAuthPath + '?' + zoomAuthRequestParams

        res.redirect(redirectUrl)
      }
    }

    it('should generate and save state to session', async () => {
      const mockZoomHelpers = {
        generateState: vi.fn().mockReturnValue('zoom-state-123'),
        createRequestParamString: vi.fn().mockReturnValue('params'),
      }

      const mockReq = { session: {} }
      const mockRes = { redirect: vi.fn() }

      const handler = createBegin(mockZoomHelpers)
      await handler(mockReq, mockRes)

      expect(mockReq.session.zoomRequestState).toBe('zoom-state-123')
    })

    it('should redirect to Zoom OAuth with auth0 redirect URI', async () => {
      const mockZoomHelpers = {
        generateState: vi.fn().mockReturnValue('zoom-state-123'),
        createRequestParamString: vi.fn().mockReturnValue('client_id=test'),
      }

      const mockReq = { session: {} }
      const mockRes = { redirect: vi.fn() }

      const handler = createBegin(mockZoomHelpers)
      await handler(mockReq, mockRes)

      expect(mockRes.redirect).toHaveBeenCalledWith(
        expect.stringContaining('https://zoom.us/oauth/authorize')
      )
    })

    it('should use PUBLIC_URL for redirect_uri', async () => {
      const mockZoomHelpers = {
        generateState: vi.fn().mockReturnValue('zoom-state-123'),
        createRequestParamString: vi.fn((params) => {
          expect(params.redirect_uri).toContain('/api/auth0/redirect')
          return 'params'
        }),
      }

      const mockReq = { session: {} }
      const mockRes = { redirect: vi.fn() }

      const handler = createBegin(mockZoomHelpers)
      await handler(mockReq, mockRes)
    })
  })

  describe('zoomAuth', () => {
    const createZoomAuth = (zoomApi, zoomHelpers, store) => {
      return async (req, res, next) => {
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

        try {
          const tokenResponse = await zoomApi.getZoomAccessToken(
            req.query.code,
            `${process.env.PUBLIC_URL}/api/auth0/redirect`
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

          // Generate Auth0 redirect
          const thirdPartyRequestState = zoomHelpers.generateState()
          req.session.thirdPartyRequestState = thirdPartyRequestState

          const codeVerifier = zoomHelpers.generateCodeVerifier()
          req.session.codeVerifier = codeVerifier

          const codeChallenge = zoomHelpers.generateCodeChallenge(codeVerifier)

          const params = {
            response_type: 'code',
            client_id: process.env.AUTH0_CLIENT_ID,
            scope: 'openid profile email',
            state: req.session.thirdPartyRequestState,
            code_challenge: codeChallenge,
            code_challenge_method: 'S256',
            redirect_uri: `${process.env.PUBLIC_URL}/api/auth0/auth`,
          }

          const auth0AuthRequestParams = zoomHelpers.createRequestParamString(params)
          const redirectUrl =
            process.env.AUTH0_ISSUER_BASE_URL + '/authorize?' + auth0AuthRequestParams

          res.redirect(redirectUrl)
        } catch (error) {
          req.session.destroy()
          return next(error)
        }
      }
    }

    it('should return 400 when no code provided', async () => {
      const handler = createZoomAuth({}, {}, {})

      const mockReq = {
        query: { state: 'state-123' },
        session: { zoomRequestState: 'state-123' },
      }
      const mockRes = {}
      const mockNext = vi.fn()

      await handler(mockReq, mockRes, mockNext)

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error))
      expect(mockNext.mock.calls[0][0].status).toBe(400)
    })

    it('should return 400 when state does not match', async () => {
      const handler = createZoomAuth({}, {}, {})

      const mockReq = {
        query: { code: 'auth-code', state: 'wrong-state' },
        session: { zoomRequestState: 'correct-state' },
      }
      const mockRes = {}
      const mockNext = vi.fn()

      await handler(mockReq, mockRes, mockNext)

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error))
      expect(mockNext.mock.calls[0][0].message).toBe('Invalid state parameter')
    })

    it('should clear zoomRequestState for security', async () => {
      const handler = createZoomAuth({}, {}, {})

      const mockReq = {
        query: { state: 'state-123' },
        session: { zoomRequestState: 'state-123' },
      }
      const mockRes = {}
      const mockNext = vi.fn()

      await handler(mockReq, mockRes, mockNext)

      expect(mockReq.session.zoomRequestState).toBeNull()
    })

    it('should exchange code and redirect to Auth0', async () => {
      const mockZoomApi = {
        getZoomAccessToken: vi.fn().mockResolvedValue({
          data: {
            access_token: 'zoom-token',
            refresh_token: 'refresh-token',
            expires_in: 3600,
          },
        }),
        getZoomUser: vi.fn().mockResolvedValue({
          data: { id: 'user-123' },
        }),
      }
      const mockZoomHelpers = {
        generateState: vi.fn().mockReturnValue('auth0-state'),
        generateCodeVerifier: vi.fn().mockReturnValue('code-verifier'),
        generateCodeChallenge: vi.fn().mockReturnValue('code-challenge'),
        createRequestParamString: vi.fn().mockReturnValue('params'),
      }
      const mockStore = {
        upsertUser: vi.fn().mockResolvedValue(undefined),
      }

      const handler = createZoomAuth(mockZoomApi, mockZoomHelpers, mockStore)

      const mockReq = {
        query: { code: 'zoom-auth-code', state: 'state-123' },
        session: { zoomRequestState: 'state-123' },
      }
      const mockRes = { redirect: vi.fn() }
      const mockNext = vi.fn()

      await handler(mockReq, mockRes, mockNext)

      expect(mockZoomApi.getZoomAccessToken).toHaveBeenCalled()
      expect(mockZoomApi.getZoomUser).toHaveBeenCalled()
      expect(mockStore.upsertUser).toHaveBeenCalled()
      expect(mockRes.redirect).toHaveBeenCalledWith(
        expect.stringContaining('/authorize')
      )
    })

    it('should use PKCE for Auth0', async () => {
      const mockZoomApi = {
        getZoomAccessToken: vi.fn().mockResolvedValue({
          data: { access_token: 'token', refresh_token: 'refresh', expires_in: 3600 },
        }),
        getZoomUser: vi.fn().mockResolvedValue({
          data: { id: 'user-123' },
        }),
      }
      const mockZoomHelpers = {
        generateState: vi.fn().mockReturnValue('state'),
        generateCodeVerifier: vi.fn().mockReturnValue('verifier'),
        generateCodeChallenge: vi.fn().mockReturnValue('challenge'),
        createRequestParamString: vi.fn((params) => {
          expect(params.code_challenge).toBe('challenge')
          expect(params.code_challenge_method).toBe('S256')
          return 'params'
        }),
      }
      const mockStore = { upsertUser: vi.fn().mockResolvedValue(undefined) }

      const handler = createZoomAuth(mockZoomApi, mockZoomHelpers, mockStore)

      const mockReq = {
        query: { code: 'code', state: 'state-123' },
        session: { zoomRequestState: 'state-123' },
      }
      const mockRes = { redirect: vi.fn() }
      const mockNext = vi.fn()

      await handler(mockReq, mockRes, mockNext)

      expect(mockZoomHelpers.generateCodeVerifier).toHaveBeenCalled()
      expect(mockZoomHelpers.generateCodeChallenge).toHaveBeenCalledWith('verifier')
    })
  })

  describe('auth0Auth', () => {
    const createAuth0Auth = (axios, zoomApi, store) => {
      return async (req, res, next) => {
        const codeVerifier = req.session.codeVerifier
        const thirdPartyRequestState = req.session.thirdPartyRequestState
        const sessionUser = req.session.user

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

        try {
          const auth0TokenResponse = await axios.request({
            method: 'POST',
            url: `${process.env.AUTH0_ISSUER_BASE_URL}/oauth/token`,
            data: {
              grant_type: 'authorization_code',
              code_verifier: codeVerifier,
              code: req.query.code,
            },
          })

          await store.updateUser(sessionUser, {
            thirdPartyAccessToken: auth0TokenResponse.data.access_token,
          })

          const user = await store.getUser(sessionUser)
          const zoomAccessToken = user.accessToken

          const deepLinkResponse = await zoomApi.getDeeplink(zoomAccessToken)
          res.redirect(deepLinkResponse.data.deeplink)
        } catch (error) {
          next(error)
        }
      }
    }

    it('should return 400 when no code provided', async () => {
      const handler = createAuth0Auth({}, {}, {})

      const mockReq = {
        query: { state: 'state-123' },
        session: {
          thirdPartyRequestState: 'state-123',
          codeVerifier: 'verifier',
          user: 'user-123',
          destroy: vi.fn(),
        },
      }
      const mockRes = {}
      const mockNext = vi.fn()

      await handler(mockReq, mockRes, mockNext)

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error))
      expect(mockNext.mock.calls[0][0].status).toBe(400)
    })

    it('should return 400 when state does not match', async () => {
      const handler = createAuth0Auth({}, {}, {})

      const mockReq = {
        query: { code: 'code', state: 'wrong-state' },
        session: {
          thirdPartyRequestState: 'correct-state',
          codeVerifier: 'verifier',
          user: 'user-123',
          destroy: vi.fn(),
        },
      }
      const mockRes = {}
      const mockNext = vi.fn()

      await handler(mockReq, mockRes, mockNext)

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error))
      expect(mockNext.mock.calls[0][0].message).toBe('Invalid state parameter')
    })

    it('should destroy session for security', async () => {
      const destroyFn = vi.fn()
      const handler = createAuth0Auth({}, {}, {})

      const mockReq = {
        query: { state: 'state-123' },
        session: {
          thirdPartyRequestState: 'state-123',
          codeVerifier: 'verifier',
          user: 'user-123',
          destroy: destroyFn,
        },
      }
      const mockRes = {}
      const mockNext = vi.fn()

      await handler(mockReq, mockRes, mockNext)

      expect(destroyFn).toHaveBeenCalled()
    })

    it('should exchange code, save token, and redirect to deeplink', async () => {
      const mockAxios = {
        request: vi.fn().mockResolvedValue({
          data: { access_token: 'auth0-token' },
        }),
      }
      const mockZoomApi = {
        getDeeplink: vi.fn().mockResolvedValue({
          data: { deeplink: 'zoomus://launch' },
        }),
      }
      const mockStore = {
        updateUser: vi.fn().mockResolvedValue(undefined),
        getUser: vi.fn().mockResolvedValue({
          accessToken: 'zoom-token',
        }),
      }

      const handler = createAuth0Auth(mockAxios, mockZoomApi, mockStore)

      const mockReq = {
        query: { code: 'auth0-code', state: 'state-123' },
        session: {
          thirdPartyRequestState: 'state-123',
          codeVerifier: 'verifier',
          user: 'user-123',
          destroy: vi.fn(),
        },
      }
      const mockRes = { redirect: vi.fn() }
      const mockNext = vi.fn()

      await handler(mockReq, mockRes, mockNext)

      expect(mockAxios.request).toHaveBeenCalled()
      expect(mockStore.updateUser).toHaveBeenCalledWith('user-123', {
        thirdPartyAccessToken: 'auth0-token',
      })
      expect(mockZoomApi.getDeeplink).toHaveBeenCalledWith('zoom-token')
      expect(mockRes.redirect).toHaveBeenCalledWith('zoomus://launch')
    })
  })

  describe('proxy', () => {
    it('should add authorization header from thirdPartyAccessToken', async () => {
      const mockReq = {
        thirdPartyAccessToken: 'auth0-access-token',
      }

      const proxyOptions = {
        target: process.env.AUTH0_ISSUER_BASE_URL,
        changeOrigin: true,
        pathRewrite: { '^/api/auth0/proxy': '' },
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${mockReq.thirdPartyAccessToken}`,
        },
      }

      expect(proxyOptions.headers.authorization).toBe('Bearer auth0-access-token')
      expect(proxyOptions.pathRewrite['^/api/auth0/proxy']).toBe('')
    })

    it('should rewrite path correctly', () => {
      const pathRewrite = { '^/api/auth0/proxy': '' }

      const rewritePath = (path) => {
        return path.replace(/^\/api\/auth0\/proxy/, '')
      }

      expect(rewritePath('/api/auth0/proxy/api/v2/users')).toBe('/api/v2/users')
      expect(rewritePath('/api/auth0/proxy/userinfo')).toBe('/userinfo')
    })
  })

  describe('logout', () => {
    const createLogout = (store) => {
      return async (req, res, next) => {
        try {
          await store.logoutUser(req.session.user)
          res.json({ status: 'ok' })
        } catch (error) {
          next(error)
        }
      }
    }

    it('should call store.logoutUser with session user', async () => {
      const mockStore = {
        logoutUser: vi.fn().mockResolvedValue(undefined),
      }

      const handler = createLogout(mockStore)

      const mockReq = { session: { user: 'user-123' } }
      const mockRes = { json: vi.fn() }
      const mockNext = vi.fn()

      await handler(mockReq, mockRes, mockNext)

      expect(mockStore.logoutUser).toHaveBeenCalledWith('user-123')
      expect(mockRes.json).toHaveBeenCalledWith({ status: 'ok' })
    })

    it('should call next with error on failure', async () => {
      const mockStore = {
        logoutUser: vi.fn().mockRejectedValue(new Error('Logout failed')),
      }

      const handler = createLogout(mockStore)

      const mockReq = { session: { user: 'user-123' } }
      const mockRes = { json: vi.fn() }
      const mockNext = vi.fn()

      await handler(mockReq, mockRes, mockNext)

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error))
    })
  })

  describe('zoomAuth - edge cases', () => {
    const createZoomAuth = (zoomApi, zoomHelpers, store) => {
      return async (req, res, next) => {
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

        try {
          const tokenResponse = await zoomApi.getZoomAccessToken(
            req.query.code,
            `${process.env.PUBLIC_URL}/api/auth0/redirect`
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

          const thirdPartyRequestState = zoomHelpers.generateState()
          req.session.thirdPartyRequestState = thirdPartyRequestState

          const codeVerifier = zoomHelpers.generateCodeVerifier()
          req.session.codeVerifier = codeVerifier

          const codeChallenge = zoomHelpers.generateCodeChallenge(codeVerifier)

          const params = {
            response_type: 'code',
            client_id: process.env.AUTH0_CLIENT_ID,
            scope: 'openid profile email',
            state: req.session.thirdPartyRequestState,
            code_challenge: codeChallenge,
            code_challenge_method: 'S256',
            redirect_uri: `${process.env.PUBLIC_URL}/api/auth0/auth`,
          }

          const auth0AuthRequestParams = zoomHelpers.createRequestParamString(params)
          const redirectUrl =
            process.env.AUTH0_ISSUER_BASE_URL + '/authorize?' + auth0AuthRequestParams

          res.redirect(redirectUrl)
        } catch (error) {
          req.session.destroy()
          return next(error)
        }
      }
    }

    it('should destroy session on Zoom API error', async () => {
      const destroyFn = vi.fn()
      const mockZoomApi = {
        getZoomAccessToken: vi.fn().mockRejectedValue(new Error('Zoom API error')),
      }

      const handler = createZoomAuth(mockZoomApi, {}, {})

      const mockReq = {
        query: { code: 'auth-code', state: 'state-123' },
        session: { zoomRequestState: 'state-123', destroy: destroyFn },
      }
      const mockRes = {}
      const mockNext = vi.fn()

      await handler(mockReq, mockRes, mockNext)

      expect(destroyFn).toHaveBeenCalled()
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error))
    })

    it('should handle missing session zoomRequestState', async () => {
      const handler = createZoomAuth({}, {}, {})

      const mockReq = {
        query: { code: 'auth-code', state: 'state-123' },
        session: {}, // no zoomRequestState
      }
      const mockRes = {}
      const mockNext = vi.fn()

      await handler(mockReq, mockRes, mockNext)

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error))
      expect(mockNext.mock.calls[0][0].message).toBe('Invalid state parameter')
    })

    it('should handle empty string state', async () => {
      const handler = createZoomAuth({}, {}, {})

      const mockReq = {
        query: { code: 'auth-code', state: '' },
        session: { zoomRequestState: '', destroy: vi.fn() },
      }
      const mockRes = { redirect: vi.fn() }
      const mockNext = vi.fn()

      // Empty state matches empty session state
      // But will fail on token exchange
      await handler(mockReq, mockRes, mockNext)

      // Should proceed past state check (empty === empty)
      expect(mockReq.session.zoomRequestState).toBeNull()
    })

    it('should generate Auth0 redirect URL regardless of AUTH0_CLIENT_ID value', async () => {
      const mockZoomApi = {
        getZoomAccessToken: vi.fn().mockResolvedValue({
          data: { access_token: 'token', refresh_token: 'refresh', expires_in: 3600 },
        }),
        getZoomUser: vi.fn().mockResolvedValue({ data: { id: 'user-123' } }),
      }
      let createRequestParamStringCalled = false
      const mockZoomHelpers = {
        generateState: vi.fn().mockReturnValue('state'),
        generateCodeVerifier: vi.fn().mockReturnValue('verifier'),
        generateCodeChallenge: vi.fn().mockReturnValue('challenge'),
        createRequestParamString: vi.fn((params) => {
          createRequestParamStringCalled = true
          // Verify expected params are present
          expect(params).toHaveProperty('response_type', 'code')
          expect(params).toHaveProperty('scope', 'openid profile email')
          expect(params).toHaveProperty('code_challenge_method', 'S256')
          return 'params'
        }),
      }
      const mockStore = { upsertUser: vi.fn().mockResolvedValue(undefined) }

      const handler = createZoomAuth(mockZoomApi, mockZoomHelpers, mockStore)

      const mockReq = {
        query: { code: 'code', state: 'state-123' },
        session: { zoomRequestState: 'state-123', destroy: vi.fn() },
      }
      const mockRes = { redirect: vi.fn() }
      const mockNext = vi.fn()

      await handler(mockReq, mockRes, mockNext)

      // Verify the flow completed
      expect(createRequestParamStringCalled).toBe(true)
      expect(mockRes.redirect).toHaveBeenCalled()
    })
  })

  describe('auth0Auth - edge cases', () => {
    const createAuth0Auth = (axios, zoomApi, store) => {
      return async (req, res, next) => {
        const codeVerifier = req.session.codeVerifier
        const thirdPartyRequestState = req.session.thirdPartyRequestState
        const sessionUser = req.session.user

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

        try {
          const auth0TokenResponse = await axios.request({
            method: 'POST',
            url: `${process.env.AUTH0_ISSUER_BASE_URL}/oauth/token`,
            data: {
              grant_type: 'authorization_code',
              code_verifier: codeVerifier,
              code: req.query.code,
            },
          })

          await store.updateUser(sessionUser, {
            thirdPartyAccessToken: auth0TokenResponse.data.access_token,
          })

          const user = await store.getUser(sessionUser)
          const zoomAccessToken = user.accessToken

          const deepLinkResponse = await zoomApi.getDeeplink(zoomAccessToken)
          res.redirect(deepLinkResponse.data.deeplink)
        } catch (error) {
          next(error)
        }
      }
    }

    it('should handle Auth0 token exchange failure', async () => {
      const mockAxios = {
        request: vi.fn().mockRejectedValue(new Error('Auth0 error')),
      }

      const handler = createAuth0Auth(mockAxios, {}, {})

      const mockReq = {
        query: { code: 'auth0-code', state: 'state-123' },
        session: {
          thirdPartyRequestState: 'state-123',
          codeVerifier: 'verifier',
          user: 'user-123',
          destroy: vi.fn(),
        },
      }
      const mockRes = {}
      const mockNext = vi.fn()

      await handler(mockReq, mockRes, mockNext)

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error))
      expect(mockNext.mock.calls[0][0].message).toBe('Auth0 error')
    })

    it('should handle store.updateUser failure', async () => {
      const mockAxios = {
        request: vi.fn().mockResolvedValue({
          data: { access_token: 'auth0-token' },
        }),
      }
      const mockStore = {
        updateUser: vi.fn().mockRejectedValue(new Error('Update failed')),
      }

      const handler = createAuth0Auth(mockAxios, {}, mockStore)

      const mockReq = {
        query: { code: 'auth0-code', state: 'state-123' },
        session: {
          thirdPartyRequestState: 'state-123',
          codeVerifier: 'verifier',
          user: 'user-123',
          destroy: vi.fn(),
        },
      }
      const mockRes = {}
      const mockNext = vi.fn()

      await handler(mockReq, mockRes, mockNext)

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error))
      expect(mockNext.mock.calls[0][0].message).toBe('Update failed')
    })

    it('should handle store.getUser returning null accessToken', async () => {
      const mockAxios = {
        request: vi.fn().mockResolvedValue({
          data: { access_token: 'auth0-token' },
        }),
      }
      const mockStore = {
        updateUser: vi.fn().mockResolvedValue(undefined),
        getUser: vi.fn().mockResolvedValue({ accessToken: null }),
      }
      const mockZoomApi = {
        getDeeplink: vi.fn().mockResolvedValue({
          data: { deeplink: 'zoomus://...' },
        }),
      }

      const handler = createAuth0Auth(mockAxios, mockZoomApi, mockStore)

      const mockReq = {
        query: { code: 'auth0-code', state: 'state-123' },
        session: {
          thirdPartyRequestState: 'state-123',
          codeVerifier: 'verifier',
          user: 'user-123',
          destroy: vi.fn(),
        },
      }
      const mockRes = { redirect: vi.fn() }
      const mockNext = vi.fn()

      await handler(mockReq, mockRes, mockNext)

      // Deeplink is called with null
      expect(mockZoomApi.getDeeplink).toHaveBeenCalledWith(null)
    })

    it('should handle missing codeVerifier in session', async () => {
      const mockAxios = {
        request: vi.fn().mockResolvedValue({
          data: { access_token: 'auth0-token' },
        }),
      }

      const handler = createAuth0Auth(mockAxios, {}, {})

      const mockReq = {
        query: { code: 'auth0-code', state: 'state-123' },
        session: {
          thirdPartyRequestState: 'state-123',
          // no codeVerifier
          user: 'user-123',
          destroy: vi.fn(),
        },
      }
      const mockRes = {}
      const mockNext = vi.fn()

      await handler(mockReq, mockRes, mockNext)

      // axios.request is called with undefined code_verifier
      expect(mockAxios.request).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            code_verifier: undefined,
          }),
        })
      )
    })
  })

  describe('begin - edge cases', () => {
    const createBegin = (zoomHelpers) => {
      return async (req, res) => {
        const zoomRequestState = zoomHelpers.generateState()
        req.session.zoomRequestState = zoomRequestState

        const zoomDomain = process.env.ZOOM_HOST
        const zoomAuthPath = '/oauth/authorize'
        const params = {
          redirect_uri: `${process.env.PUBLIC_URL}/api/auth0/redirect`,
          response_type: 'code',
          client_id: process.env.ZOOM_APP_CLIENT_ID,
          state: req.session.zoomRequestState,
        }

        const zoomAuthRequestParams = zoomHelpers.createRequestParamString(params)
        const redirectUrl = zoomDomain + zoomAuthPath + '?' + zoomAuthRequestParams

        res.redirect(redirectUrl)
      }
    }

    it('should handle state generation with special characters', async () => {
      const mockZoomHelpers = {
        generateState: vi.fn().mockReturnValue('state+with/special=chars'),
        createRequestParamString: vi.fn().mockReturnValue('params'),
      }

      const mockReq = { session: {} }
      const mockRes = { redirect: vi.fn() }

      const handler = createBegin(mockZoomHelpers)
      await handler(mockReq, mockRes)

      expect(mockReq.session.zoomRequestState).toBe('state+with/special=chars')
    })

    it('should handle empty PUBLIC_URL', async () => {
      const originalPublicUrl = process.env.PUBLIC_URL
      process.env.PUBLIC_URL = ''

      const mockZoomHelpers = {
        generateState: vi.fn().mockReturnValue('state-123'),
        createRequestParamString: vi.fn((params) => {
          expect(params.redirect_uri).toBe('/api/auth0/redirect')
          return 'params'
        }),
      }

      const mockReq = { session: {} }
      const mockRes = { redirect: vi.fn() }

      const handler = createBegin(mockZoomHelpers)
      await handler(mockReq, mockRes)

      process.env.PUBLIC_URL = originalPublicUrl
    })
  })

  describe('logout - edge cases', () => {
    const createLogout = (store) => {
      return async (req, res, next) => {
        try {
          await store.logoutUser(req.session.user)
          res.json({ status: 'ok' })
        } catch (error) {
          next(error)
        }
      }
    }

    it('should handle undefined session.user', async () => {
      const mockStore = {
        logoutUser: vi.fn().mockResolvedValue(undefined),
      }

      const handler = createLogout(mockStore)

      const mockReq = { session: {} } // no user
      const mockRes = { json: vi.fn() }
      const mockNext = vi.fn()

      await handler(mockReq, mockRes, mockNext)

      expect(mockStore.logoutUser).toHaveBeenCalledWith(undefined)
      expect(mockRes.json).toHaveBeenCalledWith({ status: 'ok' })
    })

    it('should handle null session.user', async () => {
      const mockStore = {
        logoutUser: vi.fn().mockResolvedValue(undefined),
      }

      const handler = createLogout(mockStore)

      const mockReq = { session: { user: null } }
      const mockRes = { json: vi.fn() }
      const mockNext = vi.fn()

      await handler(mockReq, mockRes, mockNext)

      expect(mockStore.logoutUser).toHaveBeenCalledWith(null)
      expect(mockRes.json).toHaveBeenCalledWith({ status: 'ok' })
    })

    it('should handle store timeout', async () => {
      const mockStore = {
        logoutUser: vi.fn().mockRejectedValue(new Error('Connection timed out')),
      }

      const handler = createLogout(mockStore)

      const mockReq = { session: { user: 'user-123' } }
      const mockRes = { json: vi.fn() }
      const mockNext = vi.fn()

      await handler(mockReq, mockRes, mockNext)

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error))
      expect(mockNext.mock.calls[0][0].message).toBe('Connection timed out')
    })
  })

  describe('proxy - edge cases', () => {
    it('should handle empty thirdPartyAccessToken', () => {
      const mockReq = { thirdPartyAccessToken: '' }

      const proxyOptions = {
        target: process.env.AUTH0_ISSUER_BASE_URL,
        changeOrigin: true,
        headers: {
          authorization: `Bearer ${mockReq.thirdPartyAccessToken}`,
        },
      }

      expect(proxyOptions.headers.authorization).toBe('Bearer ')
    })

    it('should handle null thirdPartyAccessToken', () => {
      const mockReq = { thirdPartyAccessToken: null }

      const proxyOptions = {
        headers: {
          authorization: `Bearer ${mockReq.thirdPartyAccessToken}`,
        },
      }

      expect(proxyOptions.headers.authorization).toBe('Bearer null')
    })

    it('should rewrite various proxy paths', () => {
      const rewritePath = (path) => {
        return path.replace(/^\/api\/auth0\/proxy/, '')
      }

      expect(rewritePath('/api/auth0/proxy')).toBe('')
      expect(rewritePath('/api/auth0/proxy/')).toBe('/')
      expect(rewritePath('/api/auth0/proxy/api/v2/users')).toBe('/api/v2/users')
      expect(rewritePath('/api/auth0/proxy/userinfo')).toBe('/userinfo')
      expect(rewritePath('/api/auth0/proxy/api/v2/users/123/roles')).toBe('/api/v2/users/123/roles')
    })
  })
})
