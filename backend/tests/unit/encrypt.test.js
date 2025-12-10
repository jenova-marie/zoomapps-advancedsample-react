import { describe, it, expect, beforeEach } from 'vitest'

// AES-256 requires exactly 32 bytes key - set before importing
process.env.REDIS_ENCRYPTION_KEY = '12345678901234567890123456789012'

const encrypt = require('../../util/encrypt')

describe('util/encrypt', () => {
  describe('afterSerialization', () => {
    it('should encrypt a string and return base64 encoded result', () => {
      const plaintext = 'Hello, World!'
      const encrypted = encrypt.afterSerialization(plaintext)

      expect(encrypted).toBeDefined()
      expect(typeof encrypted).toBe('string')
      // Should be base64 encoded
      expect(() => Buffer.from(encrypted, 'base64')).not.toThrow()
      // Should not equal the original plaintext
      expect(encrypted).not.toBe(plaintext)
    })

    it('should produce different ciphertexts for the same plaintext (due to random IV)', () => {
      const plaintext = 'Same text'
      const encrypted1 = encrypt.afterSerialization(plaintext)
      const encrypted2 = encrypt.afterSerialization(plaintext)

      // Due to random IV, same plaintext should produce different ciphertext
      expect(encrypted1).not.toBe(encrypted2)
    })

    it('should encrypt JSON strings', () => {
      const jsonData = JSON.stringify({ accessToken: 'token123', userId: 'user456' })
      const encrypted = encrypt.afterSerialization(jsonData)

      expect(encrypted).toBeDefined()
      expect(typeof encrypted).toBe('string')
    })

    it('should encrypt empty strings', () => {
      const encrypted = encrypt.afterSerialization('')

      expect(encrypted).toBeDefined()
      expect(typeof encrypted).toBe('string')
    })

    it('should encrypt strings with special characters', () => {
      const specialChars = '!@#$%^&*()_+-=[]{}|;:,.<>?`~"\'\\/'
      const encrypted = encrypt.afterSerialization(specialChars)

      expect(encrypted).toBeDefined()
      expect(typeof encrypted).toBe('string')
    })

    it('should encrypt unicode strings', () => {
      const unicode = '你好世界 🌍 مرحبا'
      const encrypted = encrypt.afterSerialization(unicode)

      expect(encrypted).toBeDefined()
      expect(typeof encrypted).toBe('string')
    })
  })

  describe('beforeDeserialization', () => {
    it('should decrypt an encrypted string back to original', () => {
      const plaintext = 'Hello, World!'
      const encrypted = encrypt.afterSerialization(plaintext)
      const decrypted = encrypt.beforeDeserialization(encrypted)

      expect(decrypted).toBe(plaintext)
    })

    it('should correctly decrypt JSON strings', () => {
      const originalData = { accessToken: 'token123', userId: 'user456' }
      const jsonString = JSON.stringify(originalData)
      const encrypted = encrypt.afterSerialization(jsonString)
      const decrypted = encrypt.beforeDeserialization(encrypted)

      expect(decrypted).toBe(jsonString)
      expect(JSON.parse(decrypted)).toEqual(originalData)
    })

    it('should decrypt empty strings', () => {
      const encrypted = encrypt.afterSerialization('')
      const decrypted = encrypt.beforeDeserialization(encrypted)

      expect(decrypted).toBe('')
    })

    it('should decrypt strings with special characters', () => {
      const specialChars = '!@#$%^&*()_+-=[]{}|;:,.<>?`~"\'\\/'
      const encrypted = encrypt.afterSerialization(specialChars)
      const decrypted = encrypt.beforeDeserialization(encrypted)

      expect(decrypted).toBe(specialChars)
    })

    it('should decrypt unicode strings', () => {
      const unicode = '你好世界 🌍 مرحبا'
      const encrypted = encrypt.afterSerialization(unicode)
      const decrypted = encrypt.beforeDeserialization(encrypted)

      expect(decrypted).toBe(unicode)
    })

    it('should decrypt long strings', () => {
      const longString = 'a'.repeat(10000)
      const encrypted = encrypt.afterSerialization(longString)
      const decrypted = encrypt.beforeDeserialization(encrypted)

      expect(decrypted).toBe(longString)
    })
  })

  describe('roundtrip encryption/decryption', () => {
    const testCases = [
      { name: 'simple string', value: 'hello' },
      { name: 'number as string', value: '12345' },
      { name: 'boolean as string', value: 'true' },
      { name: 'null as string', value: 'null' },
      { name: 'complex JSON', value: JSON.stringify({
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
        refreshToken: 'refresh_token_value',
        expired_at: 1699999999999,
        nested: { key: 'value' }
      })},
      { name: 'array JSON', value: JSON.stringify([1, 2, 3, 'four', { five: 5 }]) },
    ]

    testCases.forEach(({ name, value }) => {
      it(`should roundtrip ${name}`, () => {
        const encrypted = encrypt.afterSerialization(value)
        const decrypted = encrypt.beforeDeserialization(encrypted)
        expect(decrypted).toBe(value)
      })
    })
  })

  describe('error handling', () => {
    it('should throw when decrypting invalid base64', () => {
      expect(() => {
        encrypt.beforeDeserialization('not-valid-base64!!!')
      }).toThrow()
    })

    it('should throw when decrypting corrupted ciphertext', () => {
      const encrypted = encrypt.afterSerialization('test')
      const corrupted = encrypted.slice(0, -5) + 'XXXXX'

      expect(() => {
        encrypt.beforeDeserialization(corrupted)
      }).toThrow()
    })

    it('should produce incorrect output when decrypting with tampered IV', () => {
      // Note: AES-CBC doesn't provide authentication, so tampering with IV
      // produces garbage output instead of throwing an error.
      // This is why GCM is preferred for authenticated encryption.
      const original = 'test'
      const encrypted = encrypt.afterSerialization(original)
      const bytes = Buffer.from(encrypted, 'base64')
      // Tamper with the IV (first 16 bytes)
      bytes[0] = bytes[0] ^ 0xFF
      const tampered = bytes.toString('base64')

      const decrypted = encrypt.beforeDeserialization(tampered)
      // Tampered IV produces different (incorrect) output
      expect(decrypted).not.toBe(original)
    })
  })
})
