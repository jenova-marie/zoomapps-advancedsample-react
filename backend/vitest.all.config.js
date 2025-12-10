import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Test environment
    environment: 'node',

    // Longer timeout for integration tests
    testTimeout: 30000,

    // Include all tests
    include: ['tests/**/*.test.js'],

    // Exclude patterns
    exclude: ['node_modules', 'dist'],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage-all',
      include: [
        'util/**/*.js',
        'api/**/*.js',
        'middleware.js',
        'config.js',
      ],
      exclude: [
        'node_modules',
        'tests',
        '**/*.test.js',
      ],
    },

    // Setup files - use unit test setup (integration setup is in integration test files)
    setupFiles: ['./tests/setup.js'],

    // Global variables available in tests
    globals: true,

    // Reporter
    reporters: ['verbose'],

    // Use forks for better isolation
    pool: 'forks',

    // Retry failed tests
    retry: 0,

    // Sequence options
    sequence: {
      shuffle: false,
    },
  },
})
