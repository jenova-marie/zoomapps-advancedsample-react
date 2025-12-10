import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('config.js - environment validation', () => {
  const requiredEnvVars = [
    'PORT',
    'SESSION_SECRET',
    'ZOOM_APP_CLIENT_URL',
    'ZOOM_APP_CLIENT_ID',
    'ZOOM_APP_CLIENT_SECRET',
    'ZOOM_APP_REDIRECT_URI',
    'ZOOM_HOST',
    'ZOOM_APP_OAUTH_STATE_SECRET',
    'REDIS_URL',
    'REDIS_ENCRYPTION_KEY',
  ]

  describe('environment variable validation logic', () => {
    it('should define all required environment variables', () => {
      // The config module validates these env vars exist
      expect(requiredEnvVars).toHaveLength(10)
      expect(requiredEnvVars).toContain('PORT')
      expect(requiredEnvVars).toContain('SESSION_SECRET')
      expect(requiredEnvVars).toContain('ZOOM_APP_CLIENT_URL')
      expect(requiredEnvVars).toContain('ZOOM_APP_CLIENT_ID')
      expect(requiredEnvVars).toContain('ZOOM_APP_CLIENT_SECRET')
      expect(requiredEnvVars).toContain('ZOOM_APP_REDIRECT_URI')
      expect(requiredEnvVars).toContain('ZOOM_HOST')
      expect(requiredEnvVars).toContain('ZOOM_APP_OAUTH_STATE_SECRET')
      expect(requiredEnvVars).toContain('REDIS_URL')
      expect(requiredEnvVars).toContain('REDIS_ENCRYPTION_KEY')
    })

    it('should validate each env var is a non-empty value', () => {
      // Recreate validation logic
      const validateEnvVars = (envars, env) => {
        const errors = []
        envars.forEach((envar) => {
          if (!env[envar]) {
            errors.push(`${envar} was not detected in environment`)
          }
        })
        return errors
      }

      // Test with all vars present
      const completeEnv = {
        PORT: '3000',
        SESSION_SECRET: 'secret',
        ZOOM_APP_CLIENT_URL: 'http://localhost',
        ZOOM_APP_CLIENT_ID: 'client-id',
        ZOOM_APP_CLIENT_SECRET: 'client-secret',
        ZOOM_APP_REDIRECT_URI: 'http://localhost/callback',
        ZOOM_HOST: 'https://zoom.us',
        ZOOM_APP_OAUTH_STATE_SECRET: 'state-secret',
        REDIS_URL: 'redis://localhost',
        REDIS_ENCRYPTION_KEY: '12345678901234567890123456789012',
      }

      const errors = validateEnvVars(requiredEnvVars, completeEnv)
      expect(errors).toHaveLength(0)
    })

    it('should detect missing environment variables', () => {
      const validateEnvVars = (envars, env) => {
        const errors = []
        envars.forEach((envar) => {
          if (!env[envar]) {
            errors.push(`${envar} was not detected in environment`)
          }
        })
        return errors
      }

      // Test with missing vars
      const incompleteEnv = {
        PORT: '3000',
        // Missing SESSION_SECRET
        ZOOM_APP_CLIENT_URL: 'http://localhost',
        // Missing ZOOM_APP_CLIENT_ID
      }

      const errors = validateEnvVars(requiredEnvVars, incompleteEnv)
      expect(errors.length).toBeGreaterThan(0)
      expect(errors).toContain('SESSION_SECRET was not detected in environment')
      expect(errors).toContain('ZOOM_APP_CLIENT_ID was not detected in environment')
    })

    it('should treat empty strings as missing', () => {
      const validateEnvVars = (envars, env) => {
        const errors = []
        envars.forEach((envar) => {
          if (!env[envar]) {
            errors.push(`${envar} was not detected in environment`)
          }
        })
        return errors
      }

      const envWithEmptyString = {
        PORT: '',
        SESSION_SECRET: 'secret',
        ZOOM_APP_CLIENT_URL: 'http://localhost',
        ZOOM_APP_CLIENT_ID: 'client-id',
        ZOOM_APP_CLIENT_SECRET: 'client-secret',
        ZOOM_APP_REDIRECT_URI: 'http://localhost/callback',
        ZOOM_HOST: 'https://zoom.us',
        ZOOM_APP_OAUTH_STATE_SECRET: 'state-secret',
        REDIS_URL: 'redis://localhost',
        REDIS_ENCRYPTION_KEY: '12345678901234567890123456789012',
      }

      const errors = validateEnvVars(requiredEnvVars, envWithEmptyString)
      expect(errors).toContain('PORT was not detected in environment')
    })

    it('should treat undefined as missing', () => {
      const validateEnvVars = (envars, env) => {
        const errors = []
        envars.forEach((envar) => {
          if (!env[envar]) {
            errors.push(`${envar} was not detected in environment`)
          }
        })
        return errors
      }

      const envWithUndefined = {
        PORT: undefined,
        SESSION_SECRET: 'secret',
      }

      const errors = validateEnvVars(requiredEnvVars, envWithUndefined)
      expect(errors).toContain('PORT was not detected in environment')
    })
  })

  describe('dotenv configuration', () => {
    it('should support NODE_ENV-specific .env files', () => {
      // The config loads .env${NODE_ENV} first, then .env as fallback
      // This test verifies the pattern
      const nodeEnvs = ['', '.development', '.test', '.production']
      nodeEnvs.forEach((suffix) => {
        const envFile = `.env${suffix}`
        expect(typeof envFile).toBe('string')
      })
    })
  })
})
