import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Test environment
    environment: 'node',

    // Global test timeout
    testTimeout: 10000,

    // Include patterns
    include: ['tests/**/*.test.js'],

    // Exclude patterns
    exclude: ['node_modules', 'dist'],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
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

    // Setup files run before each test file
    setupFiles: ['./tests/setup.js'],

    // Global variables available in tests
    globals: true,

    // Reporter
    reporters: ['verbose'],

    // Pool options for better performance
    pool: 'forks',

    // Retry failed tests
    retry: 0,

    // Sequence options
    sequence: {
      shuffle: false,
    },
  },
})
