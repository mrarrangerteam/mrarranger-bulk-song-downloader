/**
 * ========================================
 * SUNO DOWNLOADER MRARRANGER v1.1.0
 * Content Script - Improved Auto-scroll
 * Collects songs DURING scroll, not just at end
 * ========================================
 */

console.log('🎵 Suno Downloader v1.1.0 Content Script Loaded');

// State
let isDownloading = false;
let stopRequested = false;
let injectedReady = false;
let pendingRequests = new Map();
let requestIdCounter = 0;

// Configuration
const CONFIG = {
  DOWNLOAD_DELAY: 3000,
  REQUEST_TIMEOUT: 180000,
  SCROLL_DELAY: 800,        // Increased for better DOM rendering
  MAX_SCROLL_ATTEMPTS: 200, // Increased for large lists
  SCROLL_STEP: 600,         // Smaller steps for better coverage
  SAME_COUNT_LIMIT: 8       // More patience before giving up
};

/**
 * Inject script into page context
 */
function injectScript() {
  return new Promise((resolve) => {
    if (document.getElementById('suno-downloader-injected')) {
      console.log('✅ Injected script already exists');
      resolve(true);
      return;
    }
    
    const script = document.createElement('script');
    script.id = 'suno-downloader-injected';
    script.src = chrome.runtime.getURL('content/injected.js');
    script.onload = () => {
      console.log('✅ Injected script loaded');
      setTimeout(() => resolve(true), 500);
    };
    script.onerror = (e) => {
      console.error('❌ Failed to inject script:', e);
      resolve(false);
    };
    
    (document.head || document.documentElement).appendChild(script);
  });
}

/**
 * Send message to injected script
 */
function sendToInjected(action, payload = {}) {
  return new Promise((resolve, reject) => {
    const requestId = ++requestIdCounter;
    
    const timeout = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error('Request timeout'));
    }, CONFIG.REQUEST_TIMEOUT);
    
    pendingRequests.set(requestId, { resolve, reject, timeout });
    
    window.postMessage({
      source: 'suno-downloader-content',
      action,
      payload,
      requestId
    }, '*');
  });
}

/**
 * Listen for messages from injected script
 */
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (!event.data || event.data.source !== 'suno-downloader-injected') return;
  
  const { action, requestId, result } = event.data;
  
  if (action === 'ready') {
    console.log('✅ Injected script is ready');
    injectedReady = true;
    return;
  }
  
  if (requestId && pendingRequests.has(requestId)) {
    const { resolve, timeout } = pendingRequests.get(requestId);
    clearTimeout(timeout);
    pendingRequests.delete(requestId);
    resolve(result);
  }
});

/**
 * Ensure injected script is ready
 */
async function ensureInjected() {
  if (injectedReady) return true;
  
  const success = await injectScript();
  if (!success) return false;
  
  let attempts = 0;
  while (!injectedReady && attempts < 20) {
    await delay(250);
    attempts++;
  }
  
  return injectedReady;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get total song count from page text
 */
function getTotalSongCount() {
  // Look for "X songs" text anywhere on page
  const allText = document.body.innerText;
  const match = allText.match(/(\d+)\s*(songs?|เพลง)/i);
  if (match) {
    const count = parseInt(match[1], 10);
    console.log(`📊 Expected song count: ${count}`);
    return count;
  }
  return null;
}

/**
 * Find the correct scrollable container
 */
function findScrollContainer() {
  // Method 1: Look for Virtuoso scroller (Suno uses this)
  const virtuoso = document.querySelector('[data-virtuoso-scroller="true"]');
  if (virtuoso) {
    console.log('📜 Found Virtuoso scroller');
    return virtuoso;
  }
  
  // Method 2: Find parent of rowgroup
  const rowgroup = document.querySelector('div[role="rowgroup"]');
  if (rowgroup) {
    let parent = rowgroup.parentElement;
    while (parent && parent !== document.body) {
      const style = window.getComputedStyle(parent);
      if (style.overflow === 'auto' || style.overflowY === 'auto' || 
          style.overflow === 'scroll' || style.overflowY === 'scroll') {
        console.log('📜 Found scrollable parent of rowgroup');
        return parent;
      }
      parent = parent.parentElement;
    }
  }
  
  // Method 3: Find any scrollable container with song links
  const containers = document.querySelectorAll('div');
  for (const container of containers) {
    if (container.scrollHeight > container.clientHeight + 200 &&
        container.clientHeight > 300 &&
        container.querySelectorAll('a[href*="/song/"]').length > 0) {
      console.log('📜 Found scrollable container with songs');
      return container;
    }
  }
  
  // Fallback
  console.log('📜 Using document.documentElement');
  return document.documentElement;
}

/**
 * Sanitize filename
 */
function sanitizeFilename(name) {
  if (!name || typeof name !== 'string') return 'untitled';
  return name
    .replace(/[\/\\:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 200) || 'untitled';
}

/**
 * Extract songs from current DOM state
 * Returns Map of id -> song object
 */
function extractSongsFromDOM() {
  const songLinks = document.querySelectorAll('a[href*="/song/"]');
  const songs = new Map();
  
  songLinks.forEach((a) => {
    const href = a.href;
    const idMatch = href.match(/\/song\/([a-f0-9-]{36})/i);
    if (!idMatch) return;
    
    const id = idMatch[1];
    if (songs.has(id)) return;
    
    // Get title
    let title = a.textContent?.trim() || '';
    
    // Clean up title - remove duration
    if (title) {
      title = title.replace(/\s*\d{1,2}:\d{2}\s*$/, '').trim();
    }
    
    // Try parent row if title empty
    if (!title || title.length < 2) {
      const row = a.closest('[class*="row"], [class*="clip"], [class*="item"]');
      if (row) {
        const titleEl = row.querySelector('[class*="title"], [class*="name"]');
        if (titleEl) {
          title = titleEl.textContent?.trim() || '';
        }
      }
    }
    
    // Fallback
    if (!title || title.length < 2) {
      title = `Song_${id.substring(0, 8)}`;
    }
    
    title = sanitizeFilename(title);
    
    songs.set(id, { id, title, href });
  });
  
  return songs;
}

/**
 * IMPROVED Auto-scroll that collects songs DURING scroll
 * This is the key fix for virtual scroll lists
 */
async function autoScrollAndCollect() {
  console.log('📜 Starting improved auto-scroll...');
  
  const targetCount = getTotalSongCount();
  const scrollContainer = findScrollContainer();
  
  console.log(`🎯 Target: ${targetCount || 'unknown'} songs`);
  
  // Accumulated songs from all scroll positions
  const allSongs = new Map();
  
  let lastCount = 0;
  let sameCountTimes = 0;
  let scrollAttempts = 0;
  
  // Scroll to top first
  scrollContainer.scrollTop = 0;
  window.scrollTo(0, 0);
  await delay(500);
  
  // Collect songs at top
  extractSongsFromDOM().forEach((song, id) => allSongs.set(id, song));
  console.log(`📊 Initial: ${allSongs.size} songs`);
  
  while (scrollAttempts < CONFIG.MAX_SCROLL_ATTEMPTS) {
    // Scroll down
    if (scrollContainer === document.documentElement) {
      window.scrollBy(0, CONFIG.SCROLL_STEP);
    } else {
      scrollContainer.scrollTop += CONFIG.SCROLL_STEP;
    }
    
    // Also scroll window (some pages need both)
    window.scrollBy(0, CONFIG.SCROLL_STEP);
    
    await delay(CONFIG.SCROLL_DELAY);
    
    // IMPORTANT: Collect songs at EVERY scroll position
    extractSongsFromDOM().forEach((song, id) => allSongs.set(id, song));
    
    const currentCount = allSongs.size;
    
    // Log progress every 10 scrolls
    if (scrollAttempts % 10 === 0) {
      console.log(`📜 Scroll ${scrollAttempts}: ${currentCount}/${targetCount || '?'} songs`);
    }
    
    // Check if we have all songs
    if (targetCount && currentCount >= targetCount) {
      console.log(`✅ Collected all ${currentCount} songs!`);
      break;
    }
    
    // Check if stuck
    if (currentCount === lastCount) {
      sameCountTimes++;
      
      // Try scrolling to absolute bottom
      if (sameCountTimes === 4) {
        console.log('📜 Trying scroll to bottom...');
        if (scrollContainer === document.documentElement) {
          window.scrollTo(0, document.body.scrollHeight);
        } else {
          scrollContainer.scrollTop = scrollContainer.scrollHeight;
        }
        await delay(1000);
        extractSongsFromDOM().forEach((song, id) => allSongs.set(id, song));
      }
      
      // Try scroll back up then down again
      if (sameCountTimes === 6) {
        console.log('📜 Trying scroll up then down...');
        scrollContainer.scrollTop = 0;
        window.scrollTo(0, 0);
        await delay(500);
        extractSongsFromDOM().forEach((song, id) => allSongs.set(id, song));
      }
      
      // Give up after limit
      if (sameCountTimes >= CONFIG.SAME_COUNT_LIMIT) {
        console.log(`📜 No more songs loading. Got ${currentCount} songs.`);
        break;
      }
    } else {
      sameCountTimes = 0;
    }
    
    lastCount = currentCount;
    scrollAttempts++;
  }
  
  // Final collection at bottom
  extractSongsFromDOM().forEach((song, id) => allSongs.set(id, song));
  
  // Scroll back to top
  scrollContainer.scrollTop = 0;
  window.scrollTo(0, 0);
  await delay(300);
  
  // Final collection at top
  extractSongsFromDOM().forEach((song, id) => allSongs.set(id, song));
  
  const finalCount = allSongs.size;
  console.log(`📜 Auto-scroll complete. Total: ${finalCount} songs`);
  
  return Array.from(allSongs.values());
}

/**
 * Get songs without scroll (quick scan)
 */
function getSongsQuick() {
  console.log('🔍 Quick scan...');
  const songs = extractSongsFromDOM();
  console.log(`🎵 Quick scan: ${songs.size} songs`);
  return Array.from(songs.values());
}

/**
 * Send progress update
 */
function sendProgress(data) {
  chrome.runtime.sendMessage({
    action: 'downloadProgress',
    ...data
  }).catch(() => {});
}

/**
 * Download a single song
 */
async function downloadSong(song, format) {
  console.log(`📥 Downloading: "${song.title}" as ${format.toUpperCase()}`);
  
  try {
    const result = await sendToInjected(
      format === 'wav' ? 'downloadWAV' : 'downloadMP3',
      { clipId: song.id, title: song.title }
    );
    return result;
  } catch (e) {
    console.error(`Download error for ${song.title}:`, e);
    return { success: false, error: e.message };
  }
}

/**
 * Main download function
 */
async function downloadSongs(songs, format) {
  if (isDownloading) {
    console.log('⚠️ Download already in progress');
    return;
  }
  
  isDownloading = true;
  stopRequested = false;
  
  // Ensure injected script is ready
  const injected = await ensureInjected();
  if (!injected) {
    sendProgress({
      current: 0,
      total: songs.length,
      songName: 'Error',
      step: '❌ Failed to initialize - refresh page',
      status: 'error'
    });
    isDownloading = false;
    return;
  }
  
  const total = songs.length;
  let successCount = 0;
  let failCount = 0;
  
  console.log(`🚀 Starting download: ${total} songs, format: ${format.toUpperCase()}`);
  
  for (let i = 0; i < songs.length; i++) {
    if (stopRequested) {
      console.log('⏹ Download stopped by user');
      sendProgress({ status: 'stopped' });
      break;
    }
    
    const song = songs[i];
    const current = i + 1;
    
    sendProgress({
      current,
      total,
      songName: song.title,
      step: `Downloading ${format.toUpperCase()}...`,
      status: 'downloading'
    });
    
    console.log(`📥 [${current}/${total}] "${song.title}"`);
    
    const result = await downloadSong(song, format);
    
    if (result && result.success) {
      successCount++;
      sendProgress({
        current,
        total,
        songName: song.title,
        step: '✅ Success',
        status: 'complete'
      });
      console.log(`✅ [${current}/${total}] Success`);
    } else {
      failCount++;
      sendProgress({
        current,
        total,
        songName: song.title,
        step: `❌ ${result?.error || 'Failed'}`,
        status: 'error'
      });
      console.log(`❌ [${current}/${total}] Failed`);
    }
    
    // Delay between downloads
    if (i < songs.length - 1 && !stopRequested) {
      await delay(CONFIG.DOWNLOAD_DELAY);
    }
  }
  
  isDownloading = false;
  
  console.log(`🎉 Complete: ${successCount} success, ${failCount} failed`);
  sendProgress({
    current: total,
    total: total,
    songName: `✅ ${successCount} success, ❌ ${failCount} failed`,
    step: 'Complete',
    status: 'finished'
  });
}

/**
 * Message listener
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('📨 Message:', message.action);
  
  switch (message.action) {
    case 'ping':
      sendResponse({ status: 'ok', version: '1.1.0' });
      break;
      
    case 'getSongs':
      // Quick scan without scroll
      const quickSongs = getSongsQuick();
      const expectedCount = getTotalSongCount();
      sendResponse({ songs: quickSongs, expectedCount });
      break;
      
    case 'getSongsWithScroll':
      // Full scan with auto-scroll
      (async () => {
        const allSongs = await autoScrollAndCollect();
        const expected = getTotalSongCount();
        sendResponse({ songs: allSongs, expectedCount: expected });
      })();
      return true; // Keep channel open for async response
      
    case 'getExpectedCount':
      // Just get the expected count from page
      sendResponse({ expectedCount: getTotalSongCount() });
      break;
      
    case 'downloadSongs':
      downloadSongs(message.songs, message.format);
      sendResponse({ status: 'started' });
      break;
      
    case 'stopDownload':
      stopRequested = true;
      isDownloading = false;
      sendResponse({ status: 'stopped' });
      break;
      
    default:
      sendResponse({ status: 'unknown' });
  }
  
  return true;
});

// Initialize
(async function init() {
  if (document.readyState !== 'complete') {
    await new Promise(resolve => window.addEventListener('load', resolve));
  }
  
  await delay(2000);
  await injectScript();
  
  console.log('✅ Suno Downloader v1.1.0 Ready');
})();
