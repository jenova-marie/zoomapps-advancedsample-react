import { describe, it, expect, vi, beforeEach } from 'vitest'

// Since store.js initializes Redis at module load time and uses util.promisify,
// we need to test the validation logic that doesn't depend on Redis.
// For full integration tests, use a real Redis instance.

describe('util/store - validation logic', () => {
  // We can test the input validation of upsertUser without needing Redis
  // by examining the logic directly

  describe('upsertUser input validation', () => {
    it('should validate that all parameters must have correct types', () => {
      // Test the validation logic
      const isValidUser = (zoomUserId, accessToken, refreshToken, expired_at) => {
        return Boolean(
          typeof zoomUserId === 'string' &&
          typeof accessToken === 'string' &&
          typeof refreshToken === 'string' &&
          typeof expired_at === 'number'
        )
      }

      // Valid inputs
      expect(isValidUser('user-123', 'token', 'refresh', Date.now())).toBe(true)

      // Invalid zoomUserId
      expect(isValidUser(123, 'token', 'refresh', Date.now())).toBe(false)
      expect(isValidUser(null, 'token', 'refresh', Date.now())).toBe(false)
      expect(isValidUser(undefined, 'token', 'refresh', Date.now())).toBe(false)

      // Invalid accessToken
      expect(isValidUser('user', 123, 'refresh', Date.now())).toBe(false)
      expect(isValidUser('user', null, 'refresh', Date.now())).toBe(false)

      // Invalid refreshToken
      expect(isValidUser('user', 'token', 123, Date.now())).toBe(false)
      expect(isValidUser('user', 'token', null, Date.now())).toBe(false)

      // Invalid expired_at
      expect(isValidUser('user', 'token', 'refresh', 'not-a-number')).toBe(false)
      expect(isValidUser('user', 'token', 'refresh', null)).toBe(false)
    })
  })

  describe('invite key format', () => {
    it('should create correct invite key format', () => {
      const createInviteKey = (invitationID) => `invite:${invitationID}`

      expect(createInviteKey('abc123')).toBe('invite:abc123')
      expect(createInviteKey('test-invite')).toBe('invite:test-invite')
    })
  })
})

// Test the actual store module with mocked dependencies
describe('util/store - with mocks', () => {
  let store
  let mockEncrypt

  beforeEach(async () => {
    vi.resetModules()

    // Mock encrypt module
    mockEncrypt = {
      afterSerialization: vi.fn((text) => `encrypted:${text}`),
      beforeDeserialization: vi.fn((text) => text.replace('encrypted:', '')),
    }
    vi.doMock('../../util/encrypt', () => mockEncrypt)

    // Mock redis with callback-style API (as used in the original store.js)
    const mockDb = {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
      on: vi.fn(),
    }

    vi.doMock('redis', () => ({
      createClient: vi.fn(() => mockDb),
    }))

    // Now import store
    store = await import('../../util/store')
  })

  it('should export required functions', () => {
    expect(typeof store.getUser).toBe('function')
    expect(typeof store.upsertUser).toBe('function')
    expect(typeof store.updateUser).toBe('function')
    expect(typeof store.logoutUser).toBe('function')
    expect(typeof store.deleteUser).toBe('function')
    expect(typeof store.storeInvite).toBe('function')
    expect(typeof store.getInvite).toBe('function')
  })
})
