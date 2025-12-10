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

    it('should throw when decrypting empty string', () => {
      expect(() => {
        encrypt.beforeDeserialization('')
      }).toThrow()
    })

    it('should throw when decrypting too-short ciphertext', () => {
      // Less than 16 bytes (IV size)
      const tooShort = Buffer.from([1, 2, 3, 4, 5]).toString('base64')
      expect(() => {
        encrypt.beforeDeserialization(tooShort)
      }).toThrow()
    })

    it('should throw when decrypting just the IV with no ciphertext', () => {
      // Exactly 16 bytes (just IV, no data)
      const justIV = Buffer.alloc(16).toString('base64')
      expect(() => {
        encrypt.beforeDeserialization(justIV)
      }).toThrow()
    })
  })

  describe('edge cases - boundary conditions', () => {
    it('should handle single character encryption', () => {
      const char = 'a'
      const encrypted = encrypt.afterSerialization(char)
      const decrypted = encrypt.beforeDeserialization(encrypted)
      expect(decrypted).toBe(char)
    })

    it('should handle whitespace-only strings', () => {
      const whitespace = '   \t\n\r   '
      const encrypted = encrypt.afterSerialization(whitespace)
      const decrypted = encrypt.beforeDeserialization(encrypted)
      expect(decrypted).toBe(whitespace)
    })

    it('should handle strings with null bytes', () => {
      const withNulls = 'hello\x00world\x00'
      const encrypted = encrypt.afterSerialization(withNulls)
      const decrypted = encrypt.beforeDeserialization(encrypted)
      expect(decrypted).toBe(withNulls)
    })

    it('should handle newlines and carriage returns', () => {
      const multiline = 'line1\nline2\r\nline3\rline4'
      const encrypted = encrypt.afterSerialization(multiline)
      const decrypted = encrypt.beforeDeserialization(encrypted)
      expect(decrypted).toBe(multiline)
    })

    it('should handle tab characters', () => {
      const tabbed = 'col1\tcol2\tcol3'
      const encrypted = encrypt.afterSerialization(tabbed)
      const decrypted = encrypt.beforeDeserialization(encrypted)
      expect(decrypted).toBe(tabbed)
    })

    it('should handle strings at AES block boundaries (16 bytes)', () => {
      // 16 bytes - exactly one block
      const oneBlock = 'a'.repeat(16)
      const encrypted1 = encrypt.afterSerialization(oneBlock)
      expect(encrypt.beforeDeserialization(encrypted1)).toBe(oneBlock)

      // 32 bytes - exactly two blocks
      const twoBlocks = 'b'.repeat(32)
      const encrypted2 = encrypt.afterSerialization(twoBlocks)
      expect(encrypt.beforeDeserialization(encrypted2)).toBe(twoBlocks)

      // 15 bytes - just under one block
      const underBlock = 'c'.repeat(15)
      const encrypted3 = encrypt.afterSerialization(underBlock)
      expect(encrypt.beforeDeserialization(encrypted3)).toBe(underBlock)

      // 17 bytes - just over one block
      const overBlock = 'd'.repeat(17)
      const encrypted4 = encrypt.afterSerialization(overBlock)
      expect(encrypt.beforeDeserialization(encrypted4)).toBe(overBlock)
    })

    it('should handle very large payloads (100KB)', () => {
      const largePayload = 'x'.repeat(100 * 1024)
      const encrypted = encrypt.afterSerialization(largePayload)
      const decrypted = encrypt.beforeDeserialization(encrypted)
      expect(decrypted).toBe(largePayload)
      expect(decrypted.length).toBe(100 * 1024)
    })
  })

  describe('edge cases - special data types as strings', () => {
    it('should handle JSON with deeply nested structure', () => {
      const deepNested = JSON.stringify({
        level1: {
          level2: {
            level3: {
              level4: {
                level5: { value: 'deep' }
              }
            }
          }
        }
      })
      const encrypted = encrypt.afterSerialization(deepNested)
      const decrypted = encrypt.beforeDeserialization(encrypted)
      expect(JSON.parse(decrypted).level1.level2.level3.level4.level5.value).toBe('deep')
    })

    it('should handle JSON with arrays', () => {
      const withArrays = JSON.stringify({
        tokens: ['token1', 'token2', 'token3'],
        nested: [{ a: 1 }, { b: 2 }]
      })
      const encrypted = encrypt.afterSerialization(withArrays)
      const decrypted = encrypt.beforeDeserialization(encrypted)
      expect(JSON.parse(decrypted).tokens).toHaveLength(3)
    })

    it('should handle base64 strings (tokens often look like base64)', () => {
      const base64Token = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature'
      const encrypted = encrypt.afterSerialization(base64Token)
      const decrypted = encrypt.beforeDeserialization(encrypted)
      expect(decrypted).toBe(base64Token)
    })

    it('should handle URL strings', () => {
      const url = 'https://api.zoom.us/v2/users/me?include=host_key&oauth=true'
      const encrypted = encrypt.afterSerialization(url)
      const decrypted = encrypt.beforeDeserialization(encrypted)
      expect(decrypted).toBe(url)
    })

    it('should handle HTML/XML-like strings', () => {
      const html = '<div class="token">secret&amp;value</div>'
      const encrypted = encrypt.afterSerialization(html)
      const decrypted = encrypt.beforeDeserialization(encrypted)
      expect(decrypted).toBe(html)
    })

    it('should handle SQL-like strings (injection test data)', () => {
      const sqlLike = "'; DROP TABLE users; --"
      const encrypted = encrypt.afterSerialization(sqlLike)
      const decrypted = encrypt.beforeDeserialization(encrypted)
      expect(decrypted).toBe(sqlLike)
    })
  })

  describe('edge cases - unicode and international', () => {
    it('should handle emoji sequences', () => {
      const emojis = '👨‍👩‍👧‍👦🏳️‍🌈🇺🇸'
      const encrypted = encrypt.afterSerialization(emojis)
      const decrypted = encrypt.beforeDeserialization(encrypted)
      expect(decrypted).toBe(emojis)
    })

    it('should handle right-to-left text (Arabic/Hebrew)', () => {
      const rtl = 'مرحبا שלום'
      const encrypted = encrypt.afterSerialization(rtl)
      const decrypted = encrypt.beforeDeserialization(encrypted)
      expect(decrypted).toBe(rtl)
    })

    it('should handle mixed scripts', () => {
      const mixed = 'Hello世界مرحباשלום'
      const encrypted = encrypt.afterSerialization(mixed)
      const decrypted = encrypt.beforeDeserialization(encrypted)
      expect(decrypted).toBe(mixed)
    })

    it('should handle combining characters', () => {
      const combining = 'e\u0301' // é as e + combining acute accent
      const encrypted = encrypt.afterSerialization(combining)
      const decrypted = encrypt.beforeDeserialization(encrypted)
      expect(decrypted).toBe(combining)
    })

    it('should handle zero-width characters', () => {
      const zeroWidth = 'hello\u200Bworld' // zero-width space
      const encrypted = encrypt.afterSerialization(zeroWidth)
      const decrypted = encrypt.beforeDeserialization(encrypted)
      expect(decrypted).toBe(zeroWidth)
    })
  })

  describe('consistency and determinism', () => {
    it('should produce different ciphertext for 100 encryptions of same plaintext', () => {
      const plaintext = 'consistent-test'
      const ciphertexts = new Set()

      for (let i = 0; i < 100; i++) {
        ciphertexts.add(encrypt.afterSerialization(plaintext))
      }

      // All 100 should be unique due to random IV
      expect(ciphertexts.size).toBe(100)
    })

    it('should always decrypt back to original regardless of IV', () => {
      const plaintext = 'roundtrip-test'

      for (let i = 0; i < 50; i++) {
        const encrypted = encrypt.afterSerialization(plaintext)
        const decrypted = encrypt.beforeDeserialization(encrypted)
        expect(decrypted).toBe(plaintext)
      }
    })
  })
})
