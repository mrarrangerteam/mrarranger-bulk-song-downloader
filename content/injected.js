/**
 * ========================================
 * SUNO DOWNLOADER MRARRANGER v1.0.0
 * Injected Script - Runs in Page Context
 * Uses blob + anchor method for correct filename
 * ========================================
 */

(function() {
  'use strict';
  
  console.log('🎵 Suno Downloader v1.0.0 Injected Script Loaded');
  
  const CONFIG = {
    API_BASE: 'https://studio-api.prod.suno.com/api',
    CDN_BASE: 'https://cdn1.suno.ai',
    WAV_RETRY_DELAY: 4000,
    WAV_MAX_RETRIES: 10,
    WAV_FIRST_DELAY: 6000
  };
  
  /**
   * Get auth token from Clerk or cookie
   */
  async function getAuthToken() {
    try {
      if (window.Clerk?.session) {
        const token = await window.Clerk.session.getToken();
        if (token) {
          console.log('✅ Got auth token from Clerk');
          return token;
        }
      }
    } catch (e) {}
    
    const cookie = document.cookie.split('; ').find(c => c.trim().startsWith('__session='));
    if (cookie) {
      const token = cookie.split('=')[1]?.trim();
      if (token) {
        console.log('✅ Got auth token from cookie');
        return token;
      }
    }
    
    console.log('❌ No auth token found');
    return null;
  }
  
  /**
   * Trigger WAV conversion via API
   */
  async function triggerWavConversion(clipId) {
    const authToken = await getAuthToken();
    if (!authToken) return false;
    
    try {
      const response = await fetch(`${CONFIG.API_BASE}/gen/${clipId}/convert_wav/`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      console.log(`WAV conversion trigger: ${response.status}`);
      return response.ok || response.status === 202;
    } catch (e) {
      console.error('WAV conversion error:', e);
      return false;
    }
  }
  
  /**
   * Sanitize filename
   */
  function sanitizeFilename(name) {
    if (!name || typeof name !== 'string') return 'untitled';
    return name
      .replace(/[\/\\:*?"<>|]/g, '-')
      .replace(/[\n\r\t]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 200) || 'untitled';
  }
  
  /**
   * Force download using blob + anchor method
   * This ensures the filename is correctly set!
   */
  async function forceDownload(url, fileName) {
    try {
      console.log(`📥 Fetching: ${url.substring(0, 50)}...`);
      
      const response = await fetch(url);
      if (!response.ok) {
        console.warn(`Fetch failed: ${response.status}`);
        return false;
      }
      
      const blob = await response.blob();
      
      // Check if blob is valid (not XML error)
      if (blob.size < 1000) {
        const text = await blob.text();
        if (text.includes('<?xml') || text.includes('<Error>') || text.includes('AccessDenied')) {
          console.warn('Received XML error instead of audio');
          return false;
        }
      }
      
      // Create blob URL and download with correct filename
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
      
      console.log(`✅ Download started: ${fileName}`);
      return true;
      
    } catch (error) {
      console.error(`Download error: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Download MP3
   */
  async function downloadMP3(clipId, title) {
    console.log(`🎵 downloadMP3: "${title}" (${clipId})`);
    
    const safeTitle = sanitizeFilename(title);
    const fileName = `${safeTitle}.mp3`;
    const url = `${CONFIG.CDN_BASE}/${clipId}.mp3`;
    
    const success = await forceDownload(url, fileName);
    
    return { 
      success, 
      filename: fileName,
      error: success ? null : 'MP3 download failed'
    };
  }
  
  /**
   * Download WAV with retry loop
   */
  async function downloadWAV(clipId, title) {
    console.log(`🎵 downloadWAV: "${title}" (${clipId})`);
    
    const safeTitle = sanitizeFilename(title);
    const fileName = `${safeTitle}.wav`;
    const cdnUrl = `${CONFIG.CDN_BASE}/${clipId}.wav`;
    
    // Trigger WAV conversion
    console.log('🔄 Triggering WAV conversion...');
    await triggerWavConversion(clipId);
    
    // Wait for initial conversion
    console.log(`⏳ Waiting ${CONFIG.WAV_FIRST_DELAY/1000}s...`);
    await new Promise(resolve => setTimeout(resolve, CONFIG.WAV_FIRST_DELAY));
    
    // Retry loop
    for (let attempt = 1; attempt <= CONFIG.WAV_MAX_RETRIES; attempt++) {
      console.log(`🔄 Attempt ${attempt}/${CONFIG.WAV_MAX_RETRIES}...`);
      
      const success = await forceDownload(cdnUrl, fileName);
      
      if (success) {
        console.log(`✅ WAV downloaded on attempt ${attempt}`);
        return { success: true, filename: fileName };
      }
      
      console.log(`⏳ Not ready, waiting ${CONFIG.WAV_RETRY_DELAY/1000}s...`);
      await new Promise(resolve => setTimeout(resolve, CONFIG.WAV_RETRY_DELAY));
    }
    
    console.error(`❌ WAV failed after ${CONFIG.WAV_MAX_RETRIES} attempts`);
    return { 
      success: false, 
      filename: fileName,
      error: `WAV not ready after ${CONFIG.WAV_MAX_RETRIES} attempts`
    };
  }
  
  /**
   * Handle messages from content script
   */
  window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    if (!event.data || event.data.source !== 'suno-downloader-content') return;
    
    const { action, payload, requestId } = event.data;
    
    console.log(`📨 Injected received: ${action}`, payload);
    
    let result;
    
    try {
      switch (action) {
        case 'downloadMP3':
          result = await downloadMP3(payload.clipId, payload.title);
          break;
          
        case 'downloadWAV':
          result = await downloadWAV(payload.clipId, payload.title);
          break;
          
        case 'getAuthToken':
          const token = await getAuthToken();
          result = { success: !!token, token };
          break;
          
        case 'ping':
          result = { success: true, version: '1.0.0' };
          break;
          
        default:
          result = { success: false, error: 'Unknown action' };
      }
    } catch (e) {
      console.error('Injected script error:', e);
      result = { success: false, error: e.message };
    }
    
    // Send response back
    window.postMessage({
      source: 'suno-downloader-injected',
      action: 'response',
      requestId,
      result
    }, '*');
  });
  
  // Notify content script that injected script is ready
  window.postMessage({
    source: 'suno-downloader-injected',
    action: 'ready'
  }, '*');
  
  console.log('✅ Suno Downloader v1.0.0 Injected Script Ready');
  
})();
