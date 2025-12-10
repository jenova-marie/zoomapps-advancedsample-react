# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the **backend** component of the Advanced Zoom Apps Sample - a Node.js/Express server that serves as the single entry point for the Zoom App. It handles:
- **Authentication** - OAuth flows with Zoom (web-based and in-client with PKCE)
- **Session management** - Cookie-based sessions backed by Redis (v4+)
- **Frontend proxy** - Proxies requests to the React frontend (`../frontend`) via `/api/zoomapp/proxy`
- **Security** - Helmet headers, rate limiting, AES-256-GCM encryption

The backend sits in front of the frontend; all requests go through this server first.

## Commands

```bash
# Development (with hot reload via nodemon)
npm run start:dev

# Production
npm start

# Full stack via Docker (run from parent directory)
docker compose up --build
```

## Required Environment Variables

Copy `.env.example` to `.env` and configure:
- `ZOOM_APP_CLIENT_ID`, `ZOOM_APP_CLIENT_SECRET` - From Zoom Marketplace
- `ZOOM_HOST` - Usually `https://zoom.us`
- `ZOOM_APP_REDIRECT_URI` - OAuth callback URL
- `SESSION_SECRET`, `ZOOM_APP_OAUTH_STATE_SECRET` - Random secrets
- `REDIS_URL`, `REDIS_ENCRYPTION_KEY` - Redis connection and encryption
- `PUBLIC_URL` - Your ngrok/public URL
- `ZOOM_APP_CLIENT_URL` - Frontend URL (default: `http://frontend:9090` in Docker)

Optional Auth0 variables enable third-party OAuth demo: `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, `AUTH0_ISSUER_BASE_URL`

## Architecture

### Request Flow

```
Zoom Client/Browser → ngrok (HTTPS) → Backend (HTTP:3000) → Frontend (HTTP:9090)
```

Ngrok provides HTTPS termination during development - required for Zoom Apps and OAuth. The `PUBLIC_URL` env var must match your ngrok URL.

### Route Structure

- `/api/zoomapp/proxy` - **Frontend proxy** - serves the React app from `../frontend`
- `/api/zoomapp/*` - Core Zoom App endpoints (install, auth, home, in-client OAuth)
- `/api/auth0/*` - Third-party OAuth demo (Auth0) - only enabled if Auth0 env vars are set
- `/zoom/*` - Zoom REST API proxy (adds user access token to requests)

### Key Files

- `server.js` - Express app setup, async startup with Redis connection, helmet, rate limiting
- `config.js` - Environment variable validation (fails fast on missing required vars)
- `middleware.js` - Session middleware factory (connect-redis v7), security headers
- `util/store.js` - Redis v4+ client with native async/await, exports shared client
- `util/encrypt.js` - AES-256-GCM authenticated encryption for token storage
- `util/sanitize.js` - Log sanitization utilities to mask sensitive data

### OAuth Flows

**Web-based install flow:**
1. `/api/zoomapp/install` - Redirects to Zoom OAuth
2. `/api/zoomapp/auth` - Handles OAuth callback, stores tokens, returns deeplink

**In-client OAuth flow (PKCE):**
1. `/api/zoomapp/authorize` - Returns SHA256 code challenge and state
2. `/api/zoomapp/onauthorized` - Exchanges code for tokens with code verifier

**Home URL:**
- `/api/zoomapp/home` - Entry point when app opens in Zoom client; decrypts `x-zoom-app-context` header

### Security Features

- **Helmet** - Secure HTTP headers (HSTS, X-Content-Type-Options, etc.)
- **Rate limiting** - 100 requests per 15 minutes on `/api/` routes
- **Session hardening** - 2-hour expiry, secure cookies, sameSite=lax
- **AES-256-GCM** - Authenticated encryption for stored tokens
- **Log sanitization** - Tokens/secrets masked in console output

### Data Storage (util/store.js)

Redis v4+ client with native Promise support. Tokens encrypted with AES-256-GCM before storage. Server must call `store.connect()` before using the client.

## Session Behavior

Sessions are cookie-based and stored in Redis. **Restarting Docker containers clears Redis**, requiring users to re-authenticate via the install flow.

## Breaking Changes from Previous Version

- **Encryption format changed** - AES-256-CBC → AES-256-GCM. Existing encrypted data in Redis will not decrypt. Clear Redis data after upgrade.
- **Redis client** - Upgraded from v3 (callback) to v4 (native async). Server startup is now async.
- **Session middleware** - Now a factory function `createSessionMiddleware()` instead of pre-instantiated middleware.
