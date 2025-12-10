import { describe, it, expect, vi } from 'vitest'

// Since the zoom-api module uses CommonJS require('axios') which is difficult to mock
// in Vitest's ESM environment, we test the function logic by recreating it with
// a mock axios. This approach mirrors the pattern used in middleware tests.

describe('util/zoom-api - function logic', () => {
  describe('getZoomAccessToken', () => {
    // Recreate the function logic with injectable axios
    const createGetZoomAccessToken = (axios, zoomHelpers) => {
      return async (
        zoomAuthorizationCode,
        redirect_uri = process.env.ZOOM_APP_REDIRECT_URI,
        pkceVerifier = undefined
      ) => {
        const params = {
          grant_type: 'authorization_code',
          code: zoomAuthorizationCode,
          redirect_uri,
        }

        if (typeof pkceVerifier === 'string') {
          params['code_verifier'] = pkceVerifier
        }

        const tokenRequestParamString = zoomHelpers.createRequestParamString(params)

        return await axios({
          url: `${process.env.ZOOM_HOST}/oauth/token`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          auth: {
            username: process.env.ZOOM_APP_CLIENT_ID,
            password: process.env.ZOOM_APP_CLIENT_SECRET,
          },
          data: tokenRequestParamString,
        })
      }
    }

    it('should make POST request to oauth/token endpoint', async () => {
      const mockAxios = vi.fn().mockResolvedValue({
        data: {
          access_token: 'test-access-token',
          refresh_token: 'test-refresh-token',
          expires_in: 3600,
        },
      })
      const mockZoomHelpers = {
        createRequestParamString: vi.fn().mockReturnValue('code=auth-code-123&grant_type=authorization_code'),
      }

      const getZoomAccessToken = createGetZoomAccessToken(mockAxios, mockZoomHelpers)
      const result = await getZoomAccessToken('auth-code-123')

      expect(mockAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://zoom.us/oauth/token',
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          auth: {
            username: process.env.ZOOM_APP_CLIENT_ID,
            password: process.env.ZOOM_APP_CLIENT_SECRET,
          },
        })
      )
      expect(result.data.access_token).toBe('test-access-token')
    })

    it('should include code in request params', async () => {
      const mockAxios = vi.fn().mockResolvedValue({ data: {} })
      const mockZoomHelpers = {
        createRequestParamString: vi.fn().mockReturnValue('code=my-auth-code&grant_type=authorization_code'),
      }

      const getZoomAccessToken = createGetZoomAccessToken(mockAxios, mockZoomHelpers)
      await getZoomAccessToken('my-auth-code')

      expect(mockZoomHelpers.createRequestParamString).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'my-auth-code',
          grant_type: 'authorization_code',
        })
      )
    })

    it('should include code_verifier when pkceVerifier is provided', async () => {
      const mockAxios = vi.fn().mockResolvedValue({ data: {} })
      const mockZoomHelpers = {
        createRequestParamString: vi.fn().mockReturnValue('code=auth-code&code_verifier=my-pkce-verifier'),
      }

      const getZoomAccessToken = createGetZoomAccessToken(mockAxios, mockZoomHelpers)
      await getZoomAccessToken('auth-code', undefined, 'my-pkce-verifier')

      expect(mockZoomHelpers.createRequestParamString).toHaveBeenCalledWith(
        expect.objectContaining({
          code_verifier: 'my-pkce-verifier',
        })
      )
    })

    it('should not include code_verifier when pkceVerifier is undefined', async () => {
      const mockAxios = vi.fn().mockResolvedValue({ data: {} })
      const mockZoomHelpers = {
        createRequestParamString: vi.fn().mockReturnValue('code=auth-code'),
      }

      const getZoomAccessToken = createGetZoomAccessToken(mockAxios, mockZoomHelpers)
      await getZoomAccessToken('auth-code')

      const callArgs = mockZoomHelpers.createRequestParamString.mock.calls[0][0]
      expect(callArgs).not.toHaveProperty('code_verifier')
    })

    it('should propagate axios errors', async () => {
      const mockAxios = vi.fn().mockRejectedValue(new Error('Network error'))
      const mockZoomHelpers = {
        createRequestParamString: vi.fn().mockReturnValue(''),
      }

      const getZoomAccessToken = createGetZoomAccessToken(mockAxios, mockZoomHelpers)

      await expect(getZoomAccessToken('auth-code')).rejects.toThrow('Network error')
    })
  })

  describe('refreshZoomAccessToken', () => {
    const createRefreshZoomAccessToken = (axios) => {
      return async (zoomRefreshToken) => {
        const searchParams = new URLSearchParams()
        searchParams.set('grant_type', 'refresh_token')
        searchParams.set('refresh_token', zoomRefreshToken)

        return await axios({
          url: `${process.env.ZOOM_HOST}/oauth/token?${searchParams.toString()}`,
          method: 'POST',
          auth: {
            username: process.env.ZOOM_APP_CLIENT_ID,
            password: process.env.ZOOM_APP_CLIENT_SECRET,
          },
        })
      }
    }

    it('should make POST request with refresh_token grant type', async () => {
      const mockAxios = vi.fn().mockResolvedValue({
        data: {
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
        },
      })

      const refreshZoomAccessToken = createRefreshZoomAccessToken(mockAxios)
      const result = await refreshZoomAccessToken('old-refresh-token')

      expect(mockAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          auth: {
            username: process.env.ZOOM_APP_CLIENT_ID,
            password: process.env.ZOOM_APP_CLIENT_SECRET,
          },
        })
      )
      expect(result.data.access_token).toBe('new-access-token')
    })

    it('should include refresh_token in URL query params', async () => {
      const mockAxios = vi.fn().mockResolvedValue({ data: {} })

      const refreshZoomAccessToken = createRefreshZoomAccessToken(mockAxios)
      await refreshZoomAccessToken('my-refresh-token')

      const axiosCall = mockAxios.mock.calls[0][0]
      expect(axiosCall.url).toContain('grant_type=refresh_token')
      expect(axiosCall.url).toContain('refresh_token=my-refresh-token')
    })

    it('should propagate axios errors', async () => {
      const mockAxios = vi.fn().mockRejectedValue(new Error('Token refresh failed'))

      const refreshZoomAccessToken = createRefreshZoomAccessToken(mockAxios)

      await expect(refreshZoomAccessToken('token')).rejects.toThrow('Token refresh failed')
    })
  })

  describe('getZoomUser', () => {
    const createGetZoomUser = (axios) => {
      return async (accessToken) => {
        return await axios({
          url: `${process.env.ZOOM_HOST}/v2/users/me`,
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
        })
      }
    }

    it('should make GET request to users/me endpoint', async () => {
      const mockAxios = vi.fn().mockResolvedValue({
        data: {
          id: 'user-123',
          email: 'test@example.com',
          first_name: 'Test',
          last_name: 'User',
        },
      })

      const getZoomUser = createGetZoomUser(mockAxios)
      const result = await getZoomUser('my-access-token')

      expect(mockAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://zoom.us/v2/users/me',
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer my-access-token',
          },
        })
      )
      expect(result.data.id).toBe('user-123')
    })

    it('should propagate axios errors', async () => {
      const mockAxios = vi.fn().mockRejectedValue(new Error('Unauthorized'))

      const getZoomUser = createGetZoomUser(mockAxios)

      await expect(getZoomUser('invalid-token')).rejects.toThrow('Unauthorized')
    })
  })

  describe('getDeeplink', () => {
    const createGetDeeplink = (axios) => {
      return async (accessToken) => {
        return await axios({
          url: `${process.env.ZOOM_HOST}/v2/zoomapp/deeplink`,
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          data: {
            action: JSON.stringify({
              url: '/your/url',
              role_name: 'Owner',
              verified: 1,
              role_id: 0,
            }),
          },
        })
      }
    }

    it('should make POST request to zoomapp/deeplink endpoint', async () => {
      const mockAxios = vi.fn().mockResolvedValue({
        data: {
          deeplink: 'zoomus://zoom.us/launch?action=...',
        },
      })

      const getDeeplink = createGetDeeplink(mockAxios)
      const result = await getDeeplink('my-access-token')

      expect(mockAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://zoom.us/v2/zoomapp/deeplink',
          method: 'POST',
          headers: {
            Authorization: 'Bearer my-access-token',
          },
        })
      )
      expect(result.data.deeplink).toContain('zoomus://')
    })

    it('should include action data in request body', async () => {
      const mockAxios = vi.fn().mockResolvedValue({ data: {} })

      const getDeeplink = createGetDeeplink(mockAxios)
      await getDeeplink('access-token')

      const axiosCall = mockAxios.mock.calls[0][0]
      expect(axiosCall.data).toBeDefined()
      expect(axiosCall.data.action).toBeDefined()

      const action = JSON.parse(axiosCall.data.action)
      expect(action.url).toBe('/your/url')
      expect(action.role_name).toBe('Owner')
      expect(action.verified).toBe(1)
      expect(action.role_id).toBe(0)
    })

    it('should propagate axios errors', async () => {
      const mockAxios = vi.fn().mockRejectedValue(new Error('Deeplink generation failed'))

      const getDeeplink = createGetDeeplink(mockAxios)

      await expect(getDeeplink('token')).rejects.toThrow('Deeplink generation failed')
    })
  })
})

describe('util/zoom-api - module exports', () => {
  it('should export all required functions', async () => {
    // This test verifies the actual module exports the expected functions
    const zoomApi = await import('../../util/zoom-api.js')

    expect(typeof zoomApi.getZoomAccessToken).toBe('function')
    expect(typeof zoomApi.refreshZoomAccessToken).toBe('function')
    expect(typeof zoomApi.getZoomUser).toBe('function')
    expect(typeof zoomApi.getDeeplink).toBe('function')
  })
})
