import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import redis from 'redis'
import { promisify } from 'util'

// Integration tests for util/store.js
// These tests require a running Redis instance
// Run with: npm run test:integration

// Set up encryption key before importing store
process.env.REDIS_ENCRYPTION_KEY = '12345678901234567890123456789012'

describe('util/store - Redis Integration', () => {
  let store
  let testClient
  let getAsync
  let delAsync
  let keysAsync
  const testPrefix = 'test_user_'
  const testUsers = []

  beforeAll(async () => {
    // Create a separate client for test verification
    testClient = redis.createClient({
      url: process.env.REDIS_URL,
    })

    testClient.on('error', (err) => {
      console.error('Test Redis client error:', err)
    })

    getAsync = promisify(testClient.get).bind(testClient)
    delAsync = promisify(testClient.del).bind(testClient)
    keysAsync = promisify(testClient.keys).bind(testClient)

    // Import the actual store module
    store = await import('../../util/store.js')
  })

  afterAll(async () => {
    // Clean up all test users
    for (const userId of testUsers) {
      try {
        await delAsync(userId)
      } catch (e) {
        // Ignore cleanup errors
      }
    }

    // Clean up any test invites
    try {
      const inviteKeys = await keysAsync('invite:test_*')
      for (const key of inviteKeys) {
        await delAsync(key)
      }
    } catch (e) {
      // Ignore cleanup errors
    }

    // Close test client
    if (testClient) {
      testClient.quit()
    }
  })

  beforeEach(() => {
    // Generate unique user ID for each test
  })

  const generateTestUserId = () => {
    const userId = `${testPrefix}${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    testUsers.push(userId)
    return userId
  }

  describe('upsertUser', () => {
    it('should store a new user in Redis', async () => {
      const userId = generateTestUserId()
      const accessToken = 'test-access-token-123'
      const refreshToken = 'test-refresh-token-456'
      const expiredAt = Date.now() + 3600000

      await store.upsertUser(userId, accessToken, refreshToken, expiredAt)

      // Verify data was stored
      const storedData = await getAsync(userId)
      expect(storedData).toBeDefined()
      expect(storedData).not.toBeNull()
      expect(typeof storedData).toBe('string')
    })

    it('should encrypt user data before storing', async () => {
      const userId = generateTestUserId()
      const accessToken = 'plaintext-token'
      const refreshToken = 'plaintext-refresh'
      const expiredAt = Date.now() + 3600000

      await store.upsertUser(userId, accessToken, refreshToken, expiredAt)

      const storedData = await getAsync(userId)
      // Encrypted data should not contain plaintext tokens
      expect(storedData).not.toContain('plaintext-token')
      expect(storedData).not.toContain('plaintext-refresh')
    })

    it('should reject invalid user input', async () => {
      await expect(
        store.upsertUser(123, 'token', 'refresh', Date.now())
      ).rejects.toBe('Invalid user input')

      await expect(
        store.upsertUser('user', null, 'refresh', Date.now())
      ).rejects.toBe('Invalid user input')

      await expect(
        store.upsertUser('user', 'token', 'refresh', 'not-a-number')
      ).rejects.toBe('Invalid user input')
    })

    it('should overwrite existing user data', async () => {
      const userId = generateTestUserId()

      // First insert
      await store.upsertUser(userId, 'token-1', 'refresh-1', 1000)

      // Second insert (overwrite)
      await store.upsertUser(userId, 'token-2', 'refresh-2', 2000)

      // Verify latest data
      const user = await store.getUser(userId)
      expect(user.accessToken).toBe('token-2')
      expect(user.refreshToken).toBe('refresh-2')
      expect(user.expired_at).toBe(2000)
    })
  })

  describe('getUser', () => {
    it('should retrieve and decrypt user data', async () => {
      const userId = generateTestUserId()
      const accessToken = 'get-test-token'
      const refreshToken = 'get-test-refresh'
      const expiredAt = Date.now() + 7200000

      await store.upsertUser(userId, accessToken, refreshToken, expiredAt)

      const user = await store.getUser(userId)

      expect(user).toBeDefined()
      expect(user.accessToken).toBe(accessToken)
      expect(user.refreshToken).toBe(refreshToken)
      expect(user.expired_at).toBe(expiredAt)
    })

    it('should reject when user is not found', async () => {
      const nonExistentUserId = 'non_existent_user_12345'

      await expect(store.getUser(nonExistentUserId)).rejects.toBe('User not found')
    })

    it('should handle special characters in tokens', async () => {
      const userId = generateTestUserId()
      const accessToken = 'token+with/special=chars&more?query#hash'
      const refreshToken = 'refresh_token'
      const expiredAt = Date.now() + 3600000

      await store.upsertUser(userId, accessToken, refreshToken, expiredAt)

      const user = await store.getUser(userId)
      expect(user.accessToken).toBe(accessToken)
    })

    it('should handle unicode in tokens', async () => {
      const userId = generateTestUserId()
      const accessToken = 'token_🔐_中文_日本語'
      const refreshToken = 'refresh_émoji_ñ'
      const expiredAt = Date.now() + 3600000

      await store.upsertUser(userId, accessToken, refreshToken, expiredAt)

      const user = await store.getUser(userId)
      expect(user.accessToken).toBe(accessToken)
      expect(user.refreshToken).toBe(refreshToken)
    })
  })

  describe('updateUser', () => {
    it('should update specific fields while preserving others', async () => {
      const userId = generateTestUserId()

      // Create initial user
      await store.upsertUser(userId, 'original-token', 'original-refresh', 1000)

      // Update only accessToken
      await store.updateUser(userId, { accessToken: 'new-token' })

      const user = await store.getUser(userId)
      expect(user.accessToken).toBe('new-token')
      expect(user.refreshToken).toBe('original-refresh')
      expect(user.expired_at).toBe(1000)
    })

    it('should add new fields to existing user', async () => {
      const userId = generateTestUserId()

      await store.upsertUser(userId, 'token', 'refresh', 1000)

      // Add thirdPartyAccessToken
      await store.updateUser(userId, {
        thirdPartyAccessToken: 'auth0-token-xyz',
      })

      const user = await store.getUser(userId)
      expect(user.accessToken).toBe('token')
      expect(user.refreshToken).toBe('refresh')
      expect(user.thirdPartyAccessToken).toBe('auth0-token-xyz')
    })

    it('should update multiple fields at once', async () => {
      const userId = generateTestUserId()

      await store.upsertUser(userId, 'token', 'refresh', 1000)

      await store.updateUser(userId, {
        accessToken: 'new-token',
        refreshToken: 'new-refresh',
        expired_at: 2000,
      })

      const user = await store.getUser(userId)
      expect(user.accessToken).toBe('new-token')
      expect(user.refreshToken).toBe('new-refresh')
      expect(user.expired_at).toBe(2000)
    })
  })

  describe('logoutUser', () => {
    it('should remove thirdPartyAccessToken from user', async () => {
      const userId = generateTestUserId()

      // Create user with third party token
      await store.upsertUser(userId, 'zoom-token', 'refresh', 1000)
      await store.updateUser(userId, { thirdPartyAccessToken: 'auth0-token' })

      // Verify token exists
      let user = await store.getUser(userId)
      expect(user.thirdPartyAccessToken).toBe('auth0-token')

      // Logout
      await store.logoutUser(userId)

      // Verify token is removed but other data preserved
      user = await store.getUser(userId)
      expect(user.accessToken).toBe('zoom-token')
      expect(user.refreshToken).toBe('refresh')
      expect(user.thirdPartyAccessToken).toBeUndefined()
    })

    it('should work when user has no thirdPartyAccessToken', async () => {
      const userId = generateTestUserId()

      await store.upsertUser(userId, 'token', 'refresh', 1000)

      // Should not throw
      await store.logoutUser(userId)

      const user = await store.getUser(userId)
      expect(user.accessToken).toBe('token')
    })
  })

  describe('deleteUser', () => {
    it('should completely remove user from Redis', async () => {
      const userId = generateTestUserId()

      await store.upsertUser(userId, 'token', 'refresh', 1000)

      // Verify user exists
      const userBefore = await store.getUser(userId)
      expect(userBefore).toBeDefined()

      // Delete user
      await store.deleteUser(userId)

      // Verify user is gone
      await expect(store.getUser(userId)).rejects.toBe('User not found')

      // Remove from cleanup list since already deleted
      const index = testUsers.indexOf(userId)
      if (index > -1) testUsers.splice(index, 1)
    })

    it('should not throw when deleting non-existent user', async () => {
      const nonExistentUserId = 'non_existent_delete_test'

      // Should not throw
      await store.deleteUser(nonExistentUserId)
    })
  })

  describe('storeInvite and getInvite', () => {
    const testInviteIds = []

    afterAll(async () => {
      // Clean up test invites
      for (const inviteId of testInviteIds) {
        try {
          await delAsync(`invite:${inviteId}`)
        } catch (e) {
          // Ignore
        }
      }
    })

    it('should store and retrieve an invitation', async () => {
      const inviteId = `test_invite_${Date.now()}`
      testInviteIds.push(inviteId)
      const tabState = 'active'

      await store.storeInvite(inviteId, tabState)

      const retrieved = await store.getInvite(inviteId)
      expect(retrieved).toBe(tabState)
    })

    it('should store JSON tab state', async () => {
      const inviteId = `test_invite_json_${Date.now()}`
      testInviteIds.push(inviteId)
      const tabState = JSON.stringify({ tab: 1, active: true, data: [1, 2, 3] })

      await store.storeInvite(inviteId, tabState)

      const retrieved = await store.getInvite(inviteId)
      expect(retrieved).toBe(tabState)
      expect(JSON.parse(retrieved)).toEqual({ tab: 1, active: true, data: [1, 2, 3] })
    })

    it('should return null for non-existent invite', async () => {
      const result = await store.getInvite('non_existent_invite_xyz')
      expect(result).toBeNull()
    })

    it('should overwrite existing invite', async () => {
      const inviteId = `test_invite_overwrite_${Date.now()}`
      testInviteIds.push(inviteId)

      await store.storeInvite(inviteId, 'state-1')
      await store.storeInvite(inviteId, 'state-2')

      const retrieved = await store.getInvite(inviteId)
      expect(retrieved).toBe('state-2')
    })
  })

  describe('data integrity under concurrent operations', () => {
    it('should handle multiple concurrent user updates', async () => {
      const userId = generateTestUserId()

      await store.upsertUser(userId, 'initial', 'refresh', 1000)

      // Perform concurrent updates
      const updates = [
        store.updateUser(userId, { accessToken: 'token-1' }),
        store.updateUser(userId, { accessToken: 'token-2' }),
        store.updateUser(userId, { accessToken: 'token-3' }),
      ]

      await Promise.all(updates)

      // User should have one of the tokens (last write wins)
      const user = await store.getUser(userId)
      expect(['token-1', 'token-2', 'token-3']).toContain(user.accessToken)
    })

    it('should handle multiple users simultaneously', async () => {
      const userIds = [
        generateTestUserId(),
        generateTestUserId(),
        generateTestUserId(),
      ]

      // Create users concurrently
      await Promise.all(
        userIds.map((id, index) =>
          store.upsertUser(id, `token-${index}`, `refresh-${index}`, 1000 + index)
        )
      )

      // Retrieve users concurrently
      const users = await Promise.all(userIds.map((id) => store.getUser(id)))

      // Verify each user has correct data
      users.forEach((user, index) => {
        expect(user.accessToken).toBe(`token-${index}`)
        expect(user.refreshToken).toBe(`refresh-${index}`)
        expect(user.expired_at).toBe(1000 + index)
      })
    })
  })
})
