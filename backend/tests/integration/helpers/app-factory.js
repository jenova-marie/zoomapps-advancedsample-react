/**
 * Test App Factory
 * Creates an Express app instance for testing without starting the server
 */

const express = require('express')

/**
 * Creates a minimal Express app for testing specific routes
 * @param {Object} options - Configuration options
 * @param {Function} options.router - The router to mount
 * @param {string} options.path - The path to mount the router at
 * @param {Array} options.middleware - Additional middleware to apply
 * @returns {Express.Application}
 */
function createTestApp(options = {}) {
  const app = express()

  // Basic middleware
  app.use(express.json())
  app.use(express.urlencoded({ extended: false }))

  // Mock session middleware
  app.use((req, res, next) => {
    req.session = req.session || {
      destroy: (cb) => cb && cb(),
    }
    next()
  })

  // Apply custom middleware
  if (options.middleware) {
    options.middleware.forEach((mw) => app.use(mw))
  }

  // Mount router
  if (options.router && options.path) {
    app.use(options.path, options.router)
  }

  // Error handler
  app.use((error, req, res, next) => {
    res.status(error.status || 500).json({
      error: error.message,
      status: error.status || 500,
    })
  })

  return app
}

/**
 * Creates a mock session middleware that allows setting session data
 * @param {Object} sessionData - Initial session data
 * @returns {Function} Express middleware
 */
function createMockSession(sessionData = {}) {
  return (req, res, next) => {
    req.session = {
      ...sessionData,
      destroy: (cb) => {
        req.session = {}
        if (cb) cb()
      },
      save: (cb) => {
        if (cb) cb()
      },
    }
    next()
  }
}

/**
 * Creates mock response headers middleware
 * @returns {Function} Express middleware
 */
function createMockResponseHeaders() {
  return (req, res, next) => {
    res.setHeader('X-Test', 'true')
    next()
  }
}

module.exports = {
  createTestApp,
  createMockSession,
  createMockResponseHeaders,
}
