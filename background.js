/**
 * ========================================
 * SUNO DOWNLOADER MRARRANGER v1.0.0
 * Background Service Worker
 * ========================================
 */

console.log('🎵 Suno Downloader v1.0.0 Background Loaded');

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// Set side panel behavior
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('Side panel error:', error));

// Handle messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'downloadProgress') {
    // Forward progress to sidepanel
    chrome.runtime.sendMessage(message).catch(() => {});
    sendResponse({ received: true });
  }
  return false;
});

console.log('✅ Suno Downloader v1.0.0 Background Ready');
