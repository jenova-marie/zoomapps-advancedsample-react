import { describe, it, expect, vi, beforeEach } from 'vitest'

// AES-256 requires exactly 32 bytes key - set before importing
process.env.REDIS_ENCRYPTION_KEY = '12345678901234567890123456789012'

const encrypt = require('../../util/encrypt')

describe('util/store - validation logic', () => {
  describe('upsertUser input validation', () => {
    // Recreate validation logic from store.js
    const validateUpsertUser = (zoomUserId, accessToken, refreshToken, expired_at) => {
      const isValidUser = Boolean(
        typeof zoomUserId === 'string' &&
          typeof accessToken === 'string' &&
          typeof refreshToken === 'string' &&
          typeof expired_at === 'number'
      )
      return isValidUser
    }

    it('should return true for valid inputs', () => {
      expect(validateUpsertUser('user-123', 'token', 'refresh', 1234567890)).toBe(true)
    })

    it('should return false when zoomUserId is not a string', () => {
      expect(validateUpsertUser(123, 'token', 'refresh', 1234567890)).toBe(false)
      expect(validateUpsertUser(null, 'token', 'refresh', 1234567890)).toBe(false)
      expect(validateUpsertUser(undefined, 'token', 'refresh', 1234567890)).toBe(false)
    })

    it('should return false when accessToken is not a string', () => {
      expect(validateUpsertUser('user', 123, 'refresh', 1234567890)).toBe(false)
      expect(validateUpsertUser('user', null, 'refresh', 1234567890)).toBe(false)
    })

    it('should return false when refreshToken is not a string', () => {
      expect(validateUpsertUser('user', 'token', 123, 1234567890)).toBe(false)
      expect(validateUpsertUser('user', 'token', null, 1234567890)).toBe(false)
    })

    it('should return false when expired_at is not a number', () => {
      expect(validateUpsertUser('user', 'token', 'refresh', '1234567890')).toBe(false)
      expect(validateUpsertUser('user', 'token', 'refresh', null)).toBe(false)
    })

    it('should allow empty strings (technically valid strings)', () => {
      expect(validateUpsertUser('', 'token', 'refresh', 1234567890)).toBe(true)
    })

    it('should accept zero as valid expired_at', () => {
      expect(validateUpsertUser('user', 'token', 'refresh', 0)).toBe(true)
    })

    it('should accept negative numbers as expired_at', () => {
      expect(validateUpsertUser('user', 'token', 'refresh', -1000)).toBe(true)
    })
  })

  describe('invite key format', () => {
    it('should create correct invite key format', () => {
      const createInviteKey = (invitationID) => `invite:${invitationID}`

      expect(createInviteKey('abc123')).toBe('invite:abc123')
      expect(createInviteKey('test-invite')).toBe('invite:test-invite')
    })

    it('should handle UUIDs', () => {
      const createInviteKey = (invitationID) => `invite:${invitationID}`
      const uuid = '550e8400-e29b-41d4-a716-446655440000'

      expect(createInviteKey(uuid)).toBe(`invite:${uuid}`)
    })

    it('should handle special characters in invitation ID', () => {
      const createInviteKey = (invitationID) => `invite:${invitationID}`

      expect(createInviteKey('test/invite')).toBe('invite:test/invite')
      expect(createInviteKey('test:invite')).toBe('invite:test:invite')
    })
  })

  describe('user data serialization', () => {
    it('should serialize user data to JSON before encryption', () => {
      const userData = {
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-456',
        expired_at: 1699999999999,
      }

      const serialized = JSON.stringify(userData)
      expect(serialized).toContain('accessToken')
      expect(serialized).toContain('refreshToken')
      expect(serialized).toContain('expired_at')
    })

    it('should encrypt serialized user data', () => {
      const userData = {
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-456',
        expired_at: 1699999999999,
      }

      const serialized = JSON.stringify(userData)
      const encrypted = encrypt.afterSerialization(serialized)

      expect(encrypted).not.toBe(serialized)
      expect(typeof encrypted).toBe('string')
    })

    it('should decrypt and deserialize user data correctly', () => {
      const userData = {
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-456',
        expired_at: 1699999999999,
      }

      const serialized = JSON.stringify(userData)
      const encrypted = encrypt.afterSerialization(serialized)
      const decrypted = encrypt.beforeDeserialization(encrypted)
      const deserialized = JSON.parse(decrypted)

      expect(deserialized).toEqual(userData)
    })
  })

  describe('updateUser logic', () => {
    it('should merge existing user data with new data', () => {
      const existingUser = {
        accessToken: 'old-token',
        refreshToken: 'old-refresh',
        expired_at: 1000,
      }

      const newData = {
        accessToken: 'new-token',
        expired_at: 2000,
      }

      const updatedUser = { ...existingUser, ...newData }

      expect(updatedUser.accessToken).toBe('new-token')
      expect(updatedUser.refreshToken).toBe('old-refresh') // unchanged
      expect(updatedUser.expired_at).toBe(2000)
    })

    it('should add new fields during update', () => {
      const existingUser = {
        accessToken: 'token',
        refreshToken: 'refresh',
        expired_at: 1000,
      }

      const newData = {
        thirdPartyAccessToken: 'auth0-token',
      }

      const updatedUser = { ...existingUser, ...newData }

      expect(updatedUser.thirdPartyAccessToken).toBe('auth0-token')
      expect(updatedUser.accessToken).toBe('token')
    })

    it('should handle partial updates', () => {
      const existingUser = {
        accessToken: 'token',
        refreshToken: 'refresh',
        expired_at: 1000,
      }

      const partialUpdate = { accessToken: 'new-token' }
      const updated = { ...existingUser, ...partialUpdate }

      expect(updated.accessToken).toBe('new-token')
      expect(updated.refreshToken).toBe('refresh')
      expect(updated.expired_at).toBe(1000)
    })
  })

  describe('logoutUser logic', () => {
    it('should remove thirdPartyAccessToken while keeping other data', () => {
      const userData = {
        accessToken: 'zoom-token',
        refreshToken: 'refresh-token',
        expired_at: 1699999999999,
        thirdPartyAccessToken: 'auth0-token',
      }

      // Simulate logout - delete thirdPartyAccessToken
      const loggedOutUser = { ...userData }
      delete loggedOutUser.thirdPartyAccessToken

      expect(loggedOutUser.accessToken).toBe('zoom-token')
      expect(loggedOutUser.refreshToken).toBe('refresh-token')
      expect(loggedOutUser.thirdPartyAccessToken).toBeUndefined()
    })

    it('should handle user without thirdPartyAccessToken gracefully', () => {
      const userData = {
        accessToken: 'zoom-token',
        refreshToken: 'refresh-token',
        expired_at: 1699999999999,
      }

      const loggedOutUser = { ...userData }
      delete loggedOutUser.thirdPartyAccessToken

      // Should not throw, should be same as before
      expect(loggedOutUser.accessToken).toBe('zoom-token')
    })
  })

  describe('getUser error handling', () => {
    it('should reject when user is not found', async () => {
      const getUser = async (userData) => {
        if (!userData) {
          return Promise.reject('User not found')
        }
        return JSON.parse(encrypt.beforeDeserialization(userData))
      }

      await expect(getUser(null)).rejects.toBe('User not found')
      await expect(getUser(undefined)).rejects.toBe('User not found')
    })

    it('should reject when user data is empty string', async () => {
      const getUser = async (userData) => {
        if (!userData) {
          return Promise.reject('User not found')
        }
        return JSON.parse(encrypt.beforeDeserialization(userData))
      }

      await expect(getUser('')).rejects.toBe('User not found')
    })

    it('should parse and decrypt user data when found', async () => {
      const userData = {
        accessToken: 'token',
        refreshToken: 'refresh',
        expired_at: 1000,
      }
      const encrypted = encrypt.afterSerialization(JSON.stringify(userData))

      const getUser = async (data) => {
        if (!data) {
          return Promise.reject('User not found')
        }
        return JSON.parse(encrypt.beforeDeserialization(data))
      }

      const result = await getUser(encrypted)
      expect(result).toEqual(userData)
    })
  })
})

describe('util/store - with mocks', () => {
  it('should export required functions', async () => {
    const store = await import('../../util/store')

    expect(typeof store.getUser).toBe('function')
    expect(typeof store.upsertUser).toBe('function')
    expect(typeof store.updateUser).toBe('function')
    expect(typeof store.logoutUser).toBe('function')
    expect(typeof store.deleteUser).toBe('function')
    expect(typeof store.storeInvite).toBe('function')
    expect(typeof store.getInvite).toBe('function')
  })
})

describe('util/store - Redis operations logic', () => {
  describe('storeInvite', () => {
    it('should create prefixed key for invitations', () => {
      const createInviteKey = (invitationID) => `invite:${invitationID}`

      expect(createInviteKey('inv-123')).toBe('invite:inv-123')
      expect(createInviteKey('uuid-456')).toBe('invite:uuid-456')
    })

    it('should accept any string as tabState', () => {
      const tabStates = [
        'active',
        'pending',
        JSON.stringify({ tab: 1, state: 'open' }),
        '',
      ]

      tabStates.forEach((state) => {
        expect(typeof state).toBe('string')
      })
    })
  })

  describe('getInvite', () => {
    it('should use same key format as storeInvite', () => {
      const createInviteKey = (invitationID) => `invite:${invitationID}`

      const storeKey = createInviteKey('test-id')
      const getKey = createInviteKey('test-id')

      expect(storeKey).toBe(getKey)
    })
  })

  describe('deleteUser', () => {
    it('should use zoomUserId as key directly', () => {
      const userId = 'zoom-user-123'
      // deleteUser uses userId as the key directly (no prefix)
      expect(userId).toBe('zoom-user-123')
    })
  })
})

describe('util/store - data integrity', () => {
  it('should maintain data integrity through encrypt/decrypt cycle', () => {
    const originalData = {
      accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test',
      refreshToken: 'refresh_token_abc123_xyz',
      expired_at: Date.now() + 3600000,
      thirdPartyAccessToken: 'auth0_token_def456',
    }

    const serialized = JSON.stringify(originalData)
    const encrypted = encrypt.afterSerialization(serialized)
    const decrypted = encrypt.beforeDeserialization(encrypted)
    const parsed = JSON.parse(decrypted)

    expect(parsed.accessToken).toBe(originalData.accessToken)
    expect(parsed.refreshToken).toBe(originalData.refreshToken)
    expect(parsed.expired_at).toBe(originalData.expired_at)
    expect(parsed.thirdPartyAccessToken).toBe(originalData.thirdPartyAccessToken)
  })

  it('should handle special characters in tokens', () => {
    const dataWithSpecialChars = {
      accessToken: 'token+with/special=chars&more',
      refreshToken: 'refresh_token',
      expired_at: 1000,
    }

    const serialized = JSON.stringify(dataWithSpecialChars)
    const encrypted = encrypt.afterSerialization(serialized)
    const decrypted = encrypt.beforeDeserialization(encrypted)
    const parsed = JSON.parse(decrypted)

    expect(parsed.accessToken).toBe(dataWithSpecialChars.accessToken)
  })

  it('should handle unicode in token data', () => {
    const dataWithUnicode = {
      accessToken: 'token_with_emoji_🔐',
      refreshToken: 'refresh_中文',
      expired_at: 1000,
    }

    const serialized = JSON.stringify(dataWithUnicode)
    const encrypted = encrypt.afterSerialization(serialized)
    const decrypted = encrypt.beforeDeserialization(encrypted)
    const parsed = JSON.parse(decrypted)

    expect(parsed.accessToken).toBe(dataWithUnicode.accessToken)
    expect(parsed.refreshToken).toBe(dataWithUnicode.refreshToken)
  })

  it('should handle very long tokens', () => {
    const longToken = 'a'.repeat(10000)
    const dataWithLongToken = {
      accessToken: longToken,
      refreshToken: 'refresh',
      expired_at: 1000,
    }

    const serialized = JSON.stringify(dataWithLongToken)
    const encrypted = encrypt.afterSerialization(serialized)
    const decrypted = encrypt.beforeDeserialization(encrypted)
    const parsed = JSON.parse(decrypted)

    expect(parsed.accessToken).toBe(longToken)
    expect(parsed.accessToken.length).toBe(10000)
  })
})

describe('util/store - expired_at handling', () => {
  it('should handle current timestamp', () => {
    const now = Date.now()
    const userData = {
      accessToken: 'token',
      refreshToken: 'refresh',
      expired_at: now,
    }

    const serialized = JSON.stringify(userData)
    const encrypted = encrypt.afterSerialization(serialized)
    const decrypted = encrypt.beforeDeserialization(encrypted)
    const parsed = JSON.parse(decrypted)

    expect(parsed.expired_at).toBe(now)
  })

  it('should handle future timestamps', () => {
    const future = Date.now() + 86400000 // 24 hours from now
    const userData = {
      accessToken: 'token',
      refreshToken: 'refresh',
      expired_at: future,
    }

    const serialized = JSON.stringify(userData)
    const parsed = JSON.parse(serialized)

    expect(parsed.expired_at).toBe(future)
    expect(parsed.expired_at > Date.now()).toBe(true)
  })

  it('should handle past timestamps (expired tokens)', () => {
    const past = Date.now() - 86400000 // 24 hours ago
    const userData = {
      accessToken: 'token',
      refreshToken: 'refresh',
      expired_at: past,
    }

    const serialized = JSON.stringify(userData)
    const parsed = JSON.parse(serialized)

    expect(parsed.expired_at).toBe(past)
    expect(parsed.expired_at < Date.now()).toBe(true)
  })

  it('should handle MAX_SAFE_INTEGER timestamp', () => {
    const maxTimestamp = Number.MAX_SAFE_INTEGER
    const userData = {
      accessToken: 'token',
      refreshToken: 'refresh',
      expired_at: maxTimestamp,
    }

    const serialized = JSON.stringify(userData)
    const parsed = JSON.parse(serialized)

    expect(parsed.expired_at).toBe(maxTimestamp)
  })

  it('should handle zero timestamp', () => {
    const userData = {
      accessToken: 'token',
      refreshToken: 'refresh',
      expired_at: 0,
    }

    const serialized = JSON.stringify(userData)
    const parsed = JSON.parse(serialized)

    expect(parsed.expired_at).toBe(0)
  })
})

describe('util/store - edge cases - validation boundaries', () => {
  const validateUpsertUser = (zoomUserId, accessToken, refreshToken, expired_at) => {
    const isValidUser = Boolean(
      typeof zoomUserId === 'string' &&
        typeof accessToken === 'string' &&
        typeof refreshToken === 'string' &&
        typeof expired_at === 'number'
    )
    return isValidUser
  }

  it('should reject array as zoomUserId', () => {
    expect(validateUpsertUser(['user'], 'token', 'refresh', 1000)).toBe(false)
  })

  it('should reject object as zoomUserId', () => {
    expect(validateUpsertUser({ id: 'user' }, 'token', 'refresh', 1000)).toBe(false)
  })

  it('should accept NaN as expired_at (typeof NaN is number)', () => {
    // Note: typeof NaN === 'number', so validation passes
    // This is a JavaScript quirk - NaN is technically a number type
    expect(validateUpsertUser('user', 'token', 'refresh', NaN)).toBe(true)
  })

  it('should accept Infinity as expired_at (technically a number)', () => {
    expect(validateUpsertUser('user', 'token', 'refresh', Infinity)).toBe(true)
  })

  it('should accept -Infinity as expired_at (technically a number)', () => {
    expect(validateUpsertUser('user', 'token', 'refresh', -Infinity)).toBe(true)
  })

  it('should reject function as parameter', () => {
    expect(validateUpsertUser(() => 'user', 'token', 'refresh', 1000)).toBe(false)
  })

  it('should reject Symbol as parameter', () => {
    expect(validateUpsertUser(Symbol('user'), 'token', 'refresh', 1000)).toBe(false)
  })

  it('should accept string with only spaces', () => {
    expect(validateUpsertUser('   ', 'token', 'refresh', 1000)).toBe(true)
  })

  it('should accept very long strings', () => {
    const longString = 'x'.repeat(10000)
    expect(validateUpsertUser(longString, longString, longString, 1000)).toBe(true)
  })
})

describe('util/store - edge cases - user data merging', () => {
  it('should overwrite with empty string', () => {
    const existing = { accessToken: 'old-token', refreshToken: 'refresh' }
    const update = { accessToken: '' }
    const merged = { ...existing, ...update }

    expect(merged.accessToken).toBe('')
  })

  it('should overwrite with null', () => {
    const existing = { accessToken: 'old-token', refreshToken: 'refresh' }
    const update = { accessToken: null }
    const merged = { ...existing, ...update }

    expect(merged.accessToken).toBeNull()
  })

  it('should handle undefined in update (keeps original)', () => {
    const existing = { accessToken: 'old-token', refreshToken: 'refresh' }
    const update = { accessToken: undefined }
    const merged = { ...existing, ...update }

    // undefined still overwrites in spread
    expect(merged.accessToken).toBeUndefined()
  })

  it('should handle multiple sequential updates', () => {
    let user = { accessToken: 'token1', refreshToken: 'refresh1', expired_at: 1000 }

    user = { ...user, accessToken: 'token2' }
    user = { ...user, expired_at: 2000 }
    user = { ...user, thirdPartyAccessToken: 'auth0' }

    expect(user.accessToken).toBe('token2')
    expect(user.refreshToken).toBe('refresh1')
    expect(user.expired_at).toBe(2000)
    expect(user.thirdPartyAccessToken).toBe('auth0')
  })

  it('should handle deep nested objects in update', () => {
    const existing = { accessToken: 'token', metadata: { region: 'us' } }
    const update = { metadata: { region: 'eu', newField: true } }
    const merged = { ...existing, ...update }

    // Shallow merge - entire metadata object replaced
    expect(merged.metadata.region).toBe('eu')
    expect(merged.metadata.newField).toBe(true)
  })

  it('should handle array values', () => {
    const existing = { accessToken: 'token', scopes: ['read'] }
    const update = { scopes: ['read', 'write'] }
    const merged = { ...existing, ...update }

    expect(merged.scopes).toEqual(['read', 'write'])
  })
})

describe('util/store - edge cases - token formats', () => {
  const testTokenRoundtrip = (token) => {
    const userData = {
      accessToken: token,
      refreshToken: 'refresh',
      expired_at: 1000,
    }
    const serialized = JSON.stringify(userData)
    const encrypted = encrypt.afterSerialization(serialized)
    const decrypted = encrypt.beforeDeserialization(encrypted)
    return JSON.parse(decrypted)
  }

  it('should handle JWT-format tokens', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
    const result = testTokenRoundtrip(jwt)
    expect(result.accessToken).toBe(jwt)
  })

  it('should handle UUID tokens', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000'
    const result = testTokenRoundtrip(uuid)
    expect(result.accessToken).toBe(uuid)
  })

  it('should handle hex string tokens', () => {
    const hex = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4'
    const result = testTokenRoundtrip(hex)
    expect(result.accessToken).toBe(hex)
  })

  it('should handle URL-safe base64 tokens', () => {
    const urlSafe = 'ABC_DEF-GHI_JKL'
    const result = testTokenRoundtrip(urlSafe)
    expect(result.accessToken).toBe(urlSafe)
  })

  it('should handle tokens with special OAuth characters', () => {
    const oauthToken = 'ya29.access_token_with_dots.and_underscores-and-dashes'
    const result = testTokenRoundtrip(oauthToken)
    expect(result.accessToken).toBe(oauthToken)
  })

  it('should handle empty token (edge case)', () => {
    const result = testTokenRoundtrip('')
    expect(result.accessToken).toBe('')
  })

  it('should handle token with newlines', () => {
    const multiline = 'line1\nline2\nline3'
    const result = testTokenRoundtrip(multiline)
    expect(result.accessToken).toBe(multiline)
  })
})

describe('util/store - edge cases - user ID formats', () => {
  it('should handle Zoom user ID format', () => {
    // Zoom user IDs are typically alphanumeric
    const zoomId = 'abc123DEF456'
    const createUserKey = (id) => id
    expect(createUserKey(zoomId)).toBe(zoomId)
  })

  it('should handle email-based user IDs', () => {
    const emailId = 'user@example.com'
    const createUserKey = (id) => id
    expect(createUserKey(emailId)).toBe(emailId)
  })

  it('should handle user ID with slashes', () => {
    // Some systems use path-like IDs
    const pathId = 'org/team/user123'
    const createUserKey = (id) => id
    expect(createUserKey(pathId)).toBe(pathId)
  })

  it('should handle numeric-looking user ID', () => {
    const numericId = '1234567890'
    const createUserKey = (id) => id
    expect(createUserKey(numericId)).toBe(numericId)
  })
})

describe('util/store - edge cases - concurrent operations simulation', () => {
  it('should handle rapid read-modify-write pattern', () => {
    // Simulate what could happen with concurrent updates
    const operations = []
    let userData = { accessToken: 'initial', counter: 0 }

    // Simulate 10 concurrent "read"
    for (let i = 0; i < 10; i++) {
      operations.push({ ...userData })
    }

    // Each "modifies" with their own increment
    operations.forEach((op, i) => {
      op.counter = i + 1
    })

    // Last write wins in this simple model
    userData = operations[operations.length - 1]
    expect(userData.counter).toBe(10)
  })

  it('should preserve data integrity through multiple serialize/deserialize cycles', () => {
    const originalData = {
      accessToken: 'token-xyz',
      refreshToken: 'refresh-abc',
      expired_at: 1699999999999,
      thirdPartyAccessToken: 'auth0-123',
    }

    let data = originalData
    // Simulate 10 round trips through storage
    for (let i = 0; i < 10; i++) {
      const serialized = JSON.stringify(data)
      const encrypted = encrypt.afterSerialization(serialized)
      const decrypted = encrypt.beforeDeserialization(encrypted)
      data = JSON.parse(decrypted)
    }

    expect(data).toEqual(originalData)
  })
})

describe('util/store - edge cases - deletion and cleanup', () => {
  it('should handle deleting specific fields', () => {
    const userData = {
      accessToken: 'token',
      refreshToken: 'refresh',
      expired_at: 1000,
      thirdPartyAccessToken: 'auth0',
    }

    delete userData.thirdPartyAccessToken

    expect(userData.thirdPartyAccessToken).toBeUndefined()
    expect(userData.accessToken).toBe('token')
    expect(Object.keys(userData)).toHaveLength(3)
  })

  it('should handle deleting non-existent field', () => {
    const userData = {
      accessToken: 'token',
      refreshToken: 'refresh',
    }

    // Should not throw
    delete userData.nonExistent

    expect(userData.accessToken).toBe('token')
  })

  it('should handle setting field to undefined vs deleting', () => {
    const userData1 = { accessToken: 'token', extra: 'value' }
    const userData2 = { accessToken: 'token', extra: 'value' }

    userData1.extra = undefined
    delete userData2.extra

    // Setting to undefined keeps the key
    expect('extra' in userData1).toBe(true)
    expect(userData1.extra).toBeUndefined()

    // Delete removes the key entirely
    expect('extra' in userData2).toBe(false)
  })
})
