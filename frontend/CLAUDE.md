# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the **frontend** React application for a Zoom App, built using the [Zoom Apps SDK](https://github.com/zoom/appssdk). It runs inside Zoom's embedded browser and communicates with the backend (`../backend`) which handles authentication, session management, and serves as a proxy for this frontend.

**Monorepo structure:**
- `/frontend` - React app (this directory) - served by the backend
- `/backend` - Node.js/Express server that proxies this frontend and handles OAuth/sessions
- `/rtms` - Real-Time Media Streaming modules

## Common Commands

```bash
# Install dependencies
pnpm install

# Start development server (runs on port 9090)
pnpm start

# Build for production
pnpm build

# Run tests
pnpm test

# Run a single test file
pnpm test -- --testPathPattern=Test.test.js
```

**Full stack development:** Use `docker-compose up` from the parent directory to run frontend, backend, and Redis together. The backend proxies requests to the frontend dev server.

## Architecture

### Zoom Apps SDK

Uses the [Zoom Apps SDK](https://github.com/zoom/appssdk) loaded via CDN in `public/index.html`:
```html
<script src="https://appssdk.zoom.us/sdk.min.js"></script>
```

This provides the global `zoomSdk` object. Files declare `/* globals zoomSdk */` to suppress ESLint warnings.

### Core Files

- **`src/App.js`** - Main component that configures `zoomSdk.config()` with capabilities. Handles:
  - SDK configuration with 2-hour timeout auto-refresh
  - Meeting instance connection via `zoomSdk.connect()`
  - Cross-instance messaging via `postMessage`/`onMessage` events
  - Pre-meeting state synchronization between client and meeting instances

- **`src/apis.js`** - Defines available Zoom SDK API buttons (virtual background, recording, notifications, etc.) and the `invokeZoomAppsSdk` wrapper function

- **`src/components/Authorization.js`** - Handles OAuth flows:
  - In-client OAuth via `zoomSdk.authorize()` with PKCE
  - Guest mode detection and `promptAuthorize`
  - User context status tracking via `onMyUserContextChange`
  - Contains app routes: `/userinfo`, `/image`, `/iframe`

### Running Contexts

The app behaves differently based on `runningContext`:
- `inMainClient` - Running in Zoom client but not in meeting
- `inMeeting` - Running inside an active meeting

### Frontend-Backend Communication

The backend serves this frontend and proxies all API requests:
- `/api/zoomapp/*` - Zoom App OAuth endpoints (authorize, onauthorized, install)
- `/zoom/api/v2/*` - Proxied Zoom REST API calls (backend attaches user access token)
- `/api/auth0/*` - Optional third-party Auth0 integration

The frontend cannot make direct Zoom API calls - all authenticated requests go through the backend which manages tokens and sessions via Redis.

## Configuration

- `config-overrides.js` - Adds CORS headers for dev server
- `.env.example` - Sets port 9090 and file watching settings
- Uses `react-app-rewired` to customize Create React App without ejecting

## Key Dependencies

- React 17 with react-router-dom v6 (HashRouter)
- React Bootstrap for UI components
- Testing Library for tests
