/* globals zoomSdk */
/**
 * Zoom SDK API Utilities
 *
 * TIER 4: Optional utilities for calling Zoom SDK APIs
 *
 * Generic wrapper functions for calling zoomSdk methods with consistent
 * error handling and response formatting.
 */

/**
 * Call any Zoom SDK API method
 *
 * @param {string} apiName - Name of the zoomSdk method to call
 * @param {Object} options - Options to pass to the API
 * @returns {Promise<{success: boolean, data?: any, error?: Error}>}
 *
 * @example
 * const result = await callZoomApi('getSupportedJsApis')
 * if (result.success) {
 *   console.log('Supported APIs:', result.data)
 * }
 *
 * @example
 * const result = await callZoomApi('openUrl', { url: 'https://example.com' })
 */
export async function callZoomApi(apiName, options = null) {
  try {
    const apiMethod = zoomSdk[apiName]
    if (typeof apiMethod !== 'function') {
      throw new Error(`Unknown Zoom SDK API: ${apiName}`)
    }

    const result = await apiMethod.call(zoomSdk, options)
    return { success: true, data: result }
  } catch (error) {
    console.error(`${apiName} error:`, error)
    return { success: false, error }
  }
}

/**
 * Show a notification in the Zoom client
 *
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 * @param {'info' | 'warning' | 'error'} type - Notification type
 */
export async function showNotification(title, message, type = 'info') {
  return callZoomApi('showNotification', { title, message, type })
}

/**
 * Open a URL in the user's default browser
 *
 * @param {string} url - URL to open
 */
export async function openUrl(url) {
  return callZoomApi('openUrl', { url })
}

/**
 * Get the current meeting context
 */
export async function getMeetingContext() {
  return callZoomApi('getMeetingContext')
}

/**
 * Get the current running context
 */
export async function getRunningContext() {
  return callZoomApi('getRunningContext')
}

/**
 * Get list of meeting participants
 */
export async function getMeetingParticipants() {
  return callZoomApi('getMeetingParticipants')
}

/**
 * Get meeting UUID
 */
export async function getMeetingUUID() {
  return callZoomApi('getMeetingUUID')
}

/**
 * Get meeting join URL
 */
export async function getMeetingJoinUrl() {
  return callZoomApi('getMeetingJoinUrl')
}

/**
 * Expand the app panel
 */
export async function expandApp() {
  return callZoomApi('expandApp')
}

/**
 * Set virtual background
 *
 * @param {string} fileUrl - URL of the background image
 */
export async function setVirtualBackground(fileUrl) {
  return callZoomApi('setVirtualBackground', { fileUrl })
}

/**
 * Remove virtual background
 */
export async function removeVirtualBackground() {
  return callZoomApi('removeVirtualBackground')
}

/**
 * Control cloud recording
 *
 * @param {'start' | 'stop' | 'pause' | 'resume'} action - Recording action
 */
export async function cloudRecording(action) {
  return callZoomApi('cloudRecording', { action })
}

/**
 * Share the app with meeting participants
 *
 * @param {'start' | 'stop'} action - Share action
 */
export async function shareApp(action) {
  return callZoomApi('shareApp', { action })
}

/**
 * Set video mirror effect
 *
 * @param {boolean} mirrorMyVideo - Whether to mirror the video
 */
export async function setVideoMirrorEffect(mirrorMyVideo) {
  return callZoomApi('setVideoMirrorEffect', { mirrorMyVideo })
}

/**
 * Send app invitation to all participants
 */
export async function sendAppInvitationToAllParticipants() {
  return callZoomApi('sendAppInvitationToAllParticipants')
}

/**
 * Show app invitation dialog
 */
export async function showAppInvitationDialog() {
  return callZoomApi('showAppInvitationDialog')
}

/**
 * Get supported JS APIs
 */
export async function getSupportedJsApis() {
  return callZoomApi('getSupportedJsApis')
}

/**
 * List available cameras
 */
export async function listCameras() {
  return callZoomApi('listCameras')
}

/**
 * Start RTMS (Real-Time Media Streaming)
 */
export async function startRTMS() {
  return callZoomApi('startRTMS')
}

/**
 * Stop RTMS
 */
export async function stopRTMS() {
  return callZoomApi('stopRTMS')
}

// Export all utilities
export default {
  callZoomApi,
  showNotification,
  openUrl,
  getMeetingContext,
  getRunningContext,
  getMeetingParticipants,
  getMeetingUUID,
  getMeetingJoinUrl,
  expandApp,
  setVirtualBackground,
  removeVirtualBackground,
  cloudRecording,
  shareApp,
  setVideoMirrorEffect,
  sendAppInvitationToAllParticipants,
  showAppInvitationDialog,
  getSupportedJsApis,
  listCameras,
  startRTMS,
  stopRTMS,
}
