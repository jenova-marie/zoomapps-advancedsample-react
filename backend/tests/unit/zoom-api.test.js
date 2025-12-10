import { describe, it, expect, vi, beforeEach } from 'vitest'

// Create a hoisted mock for axios
const mockAxios = vi.hoisted(() => vi.fn())

vi.mock('axios', () => ({
  default: mockAxios,
}))

describe('util/zoom-api', () => {
  // Import after mock is set up
  let zoomApi

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()
    zoomApi = await import('../../util/zoom-api')
  })

  describe('getZoomAccessToken', () => {
    it('should make POST request to oauth/token endpoint', async () => {
      const mockResponse = {
        data: {
          access_token: 'test-access-token',
          refresh_token: 'test-refresh-token',
          expires_in: 3600,
        },
      }
      mockAxios.mockResolvedValue(mockResponse)

      const result = await zoomApi.getZoomAccessToken('auth-code-123')

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
      expect(result).toEqual(mockResponse)
    })

    it('should include code in request data', async () => {
      mockAxios.mockResolvedValue({ data: {} })

      await zoomApi.getZoomAccessToken('my-auth-code')

      const axiosCall = mockAxios.mock.calls[0][0]
      expect(axiosCall.data).toContain('code=my-auth-code')
      expect(axiosCall.data).toContain('grant_type=authorization_code')
    })

    it('should include code_verifier when pkceVerifier is provided', async () => {
      mockAxios.mockResolvedValue({ data: {} })
      const pkceVerifier = 'my-pkce-verifier'

      await zoomApi.getZoomAccessToken('auth-code', undefined, pkceVerifier)

      const axiosCall = mockAxios.mock.calls[0][0]
      expect(axiosCall.data).toContain('code_verifier=my-pkce-verifier')
    })

    it('should not include code_verifier when pkceVerifier is undefined', async () => {
      mockAxios.mockResolvedValue({ data: {} })

      await zoomApi.getZoomAccessToken('auth-code')

      const axiosCall = mockAxios.mock.calls[0][0]
      expect(axiosCall.data).not.toContain('code_verifier')
    })

    it('should propagate axios errors', async () => {
      const error = new Error('Network error')
      mockAxios.mockRejectedValue(error)

      await expect(zoomApi.getZoomAccessToken('auth-code')).rejects.toThrow('Network error')
    })
  })

  describe('refreshZoomAccessToken', () => {
    it('should make POST request with refresh_token grant type', async () => {
      const mockResponse = {
        data: {
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
        },
      }
      mockAxios.mockResolvedValue(mockResponse)

      const result = await zoomApi.refreshZoomAccessToken('old-refresh-token')

      expect(mockAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          auth: {
            username: process.env.ZOOM_APP_CLIENT_ID,
            password: process.env.ZOOM_APP_CLIENT_SECRET,
          },
        })
      )
      expect(result).toEqual(mockResponse)
    })

    it('should include refresh_token in URL query params', async () => {
      mockAxios.mockResolvedValue({ data: {} })

      await zoomApi.refreshZoomAccessToken('my-refresh-token')

      const axiosCall = mockAxios.mock.calls[0][0]
      expect(axiosCall.url).toContain('grant_type=refresh_token')
      expect(axiosCall.url).toContain('refresh_token=my-refresh-token')
    })

    it('should propagate axios errors', async () => {
      const error = new Error('Token refresh failed')
      mockAxios.mockRejectedValue(error)

      await expect(zoomApi.refreshZoomAccessToken('token')).rejects.toThrow('Token refresh failed')
    })
  })

  describe('getZoomUser', () => {
    it('should make GET request to users/me endpoint', async () => {
      const mockResponse = {
        data: {
          id: 'user-123',
          email: 'test@example.com',
          first_name: 'Test',
          last_name: 'User',
        },
      }
      mockAxios.mockResolvedValue(mockResponse)

      const result = await zoomApi.getZoomUser('my-access-token')

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
      expect(result).toEqual(mockResponse)
    })

    it('should propagate axios errors', async () => {
      const error = new Error('Unauthorized')
      mockAxios.mockRejectedValue(error)

      await expect(zoomApi.getZoomUser('invalid-token')).rejects.toThrow('Unauthorized')
    })
  })

  describe('getDeeplink', () => {
    it('should make POST request to zoomapp/deeplink endpoint', async () => {
      const mockResponse = {
        data: {
          deeplink: 'zoomus://zoom.us/launch?action=...',
        },
      }
      mockAxios.mockResolvedValue(mockResponse)

      const result = await zoomApi.getDeeplink('my-access-token')

      expect(mockAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://zoom.us/v2/zoomapp/deeplink',
          method: 'POST',
          headers: {
            Authorization: 'Bearer my-access-token',
          },
        })
      )
      expect(result).toEqual(mockResponse)
    })

    it('should include action data in request body', async () => {
      mockAxios.mockResolvedValue({ data: {} })

      await zoomApi.getDeeplink('access-token')

      const axiosCall = mockAxios.mock.calls[0][0]
      expect(axiosCall.data).toBeDefined()
      expect(axiosCall.data.action).toBeDefined()

      const action = JSON.parse(axiosCall.data.action)
      expect(action.url).toBe('/your/url')
      expect(action.role_name).toBe('Owner')
    })

    it('should propagate axios errors', async () => {
      const error = new Error('Deeplink generation failed')
      mockAxios.mockRejectedValue(error)

      await expect(zoomApi.getDeeplink('token')).rejects.toThrow('Deeplink generation failed')
    })
  })
})
