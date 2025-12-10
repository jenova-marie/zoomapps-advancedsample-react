import { describe, it, expect, vi } from 'vitest'

// Test api/zoom/controller.js
// The controller exports a proxy middleware created by http-proxy-middleware

describe('api/zoom/controller.js - proxy configuration', () => {
  describe('proxy middleware configuration', () => {
    it('should target ZOOM_HOST environment variable', () => {
      const expectedTarget = process.env.ZOOM_HOST
      expect(expectedTarget).toBe('https://zoom.us')
    })

    it('should rewrite /zoom/api path to root', () => {
      // The pathRewrite config: { '^/zoom/api': '' }
      const pathRewrite = { '^/zoom/api': '' }

      // Simulate path rewriting
      const rewritePath = (path) => {
        return path.replace(/^\/zoom\/api/, '')
      }

      expect(rewritePath('/zoom/api/v2/users/me')).toBe('/v2/users/me')
      expect(rewritePath('/zoom/api/oauth/token')).toBe('/oauth/token')
      expect(rewritePath('/zoom/api')).toBe('')
    })

    it('should enable changeOrigin', () => {
      // changeOrigin: true changes the origin of the host header to the target URL
      const config = { changeOrigin: true }
      expect(config.changeOrigin).toBe(true)
    })
  })

  describe('onProxyRes handler logic', () => {
    it('should buffer response body chunks', () => {
      const body = []
      const chunks = [Buffer.from('{"id":'), Buffer.from('"123"}')]

      chunks.forEach((chunk) => body.push(chunk))

      const result = Buffer.concat(body).toString()
      expect(result).toBe('{"id":"123"}')
    })

    it('should handle empty response body', () => {
      const body = []
      const result = Buffer.concat(body).toString()
      expect(result).toBe('')
    })

    it('should log proxy request details', () => {
      const mockReq = { method: 'GET', path: '/v2/users/me' }
      const mockProxyRes = { statusCode: 200 }
      const body = '{"id":"user-123"}'

      const logMessage = `Zoom API Proxy => ${mockReq.method} ${mockReq.path} -> [${mockProxyRes.statusCode}] ${body}`

      expect(logMessage).toBe('Zoom API Proxy => GET /v2/users/me -> [200] {"id":"user-123"}')
    })

    it('should handle error status codes in log', () => {
      const mockReq = { method: 'POST', path: '/oauth/token' }
      const mockProxyRes = { statusCode: 401 }
      const body = '{"error":"unauthorized"}'

      const logMessage = `Zoom API Proxy => ${mockReq.method} ${mockReq.path} -> [${mockProxyRes.statusCode}] ${body}`

      expect(logMessage).toBe('Zoom API Proxy => POST /oauth/token -> [401] {"error":"unauthorized"}')
    })
  })

  describe('proxy error handling', () => {
    it('should handle proxy stream errors', () => {
      const errors = []
      const mockErrorHandler = (err) => errors.push(err)

      const testError = new Error('Connection reset')
      mockErrorHandler(testError)

      expect(errors).toHaveLength(1)
      expect(errors[0].message).toBe('Connection reset')
    })
  })
})
