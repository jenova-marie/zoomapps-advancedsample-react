import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Test environment
    environment: 'node',

    // Longer timeout for integration tests
    testTimeout: 30000,

    // Include only integration tests
    include: ['tests/integration/**/*.test.js'],

    // Exclude patterns
    exclude: ['node_modules', 'dist'],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage-integration',
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

    // Setup files for integration tests
    setupFiles: ['./tests/integration/setup.js'],

    // Global variables available in tests
    globals: true,

    // Reporter
    reporters: ['verbose'],

    // Run integration tests sequentially to avoid Redis conflicts
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },

    // Retry failed tests
    retry: 0,

    // Sequence options - run sequentially
    sequence: {
      shuffle: false,
    },
  },
})
