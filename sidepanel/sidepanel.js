/**
 * ========================================
 * SUNO DOWNLOADER MRARRANGER v1.2.0
 * Sidepanel - Compact UI with Show/Hide
 * ========================================
 */

const state = {
  songs: [],
  selectedSongs: new Set(),
  selectedFormat: 'mp3',
  isDownloading: false,
  startTime: null,
  timerInterval: null,
  expectedCount: null,
  listVisible: false,
  terminalVisible: false
};

// ========== INITIALIZATION ==========
document.addEventListener('DOMContentLoaded', () => {
  initButtons();
  initFormatSelection();
  checkConnection();
  
  setInterval(checkConnection, 3000);
  
  // Listen for download progress
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'downloadProgress') {
      handleDownloadProgress(message);
    }
  });
});

// ========== CONNECTION CHECK ==========
async function checkConnection() {
  const dot = document.getElementById('statusDot');
  const text = document.getElementById('statusText');
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab?.url?.includes('suno.com')) {
      dot.className = 'status-dot error';
      text.textContent = 'OPEN SUNO.COM FIRST';
      return;
    }
    
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
    
    if (response?.status === 'ok') {
      dot.className = 'status-dot connected';
      text.textContent = `CONNECTED v${response.version}`;
    } else {
      dot.className = 'status-dot error';
      text.textContent = 'REFRESH PAGE';
    }
  } catch (e) {
    dot.className = 'status-dot error';
    text.textContent = 'REFRESH PAGE';
  }
}

// ========== BUTTONS ==========
function initButtons() {
  document.getElementById('scanBtn').addEventListener('click', scanSongs);
  document.getElementById('toggleListBtn').addEventListener('click', toggleSongList);
  document.getElementById('selectAllBtn').addEventListener('click', selectAll);
  document.getElementById('selectNoneBtn').addEventListener('click', selectNone);
  document.getElementById('downloadSelectedBtn').addEventListener('click', downloadSelected);
  document.getElementById('downloadAllBtn').addEventListener('click', downloadAll);
  document.getElementById('clearBtn').addEventListener('click', clearList);
  document.getElementById('stopBtn').addEventListener('click', stopDownload);
  document.getElementById('terminalHeader').addEventListener('click', toggleTerminal);
  document.getElementById('toggleTerminalBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleTerminal();
  });
}

// ========== FORMAT SELECTION ==========
function initFormatSelection() {
  document.querySelectorAll('.format-option').forEach(option => {
    option.addEventListener('click', () => {
      document.querySelectorAll('.format-option').forEach(o => o.classList.remove('selected'));
      option.classList.add('selected');
      state.selectedFormat = option.dataset.format;
    });
  });
}

// ========== TOGGLE SONG LIST ==========
function toggleSongList() {
  state.listVisible = !state.listVisible;
  
  const container = document.getElementById('songsListContainer');
  const btn = document.getElementById('toggleListBtn');
  
  if (state.listVisible) {
    container.style.display = 'block';
    btn.classList.add('active');
    btn.querySelector('.toggle-text').textContent = 'Hide';
  } else {
    container.style.display = 'none';
    btn.classList.remove('active');
    btn.querySelector('.toggle-text').textContent = 'Show';
  }
}

// ========== TOGGLE TERMINAL ==========
function toggleTerminal() {
  state.terminalVisible = !state.terminalVisible;
  
  const terminal = document.getElementById('terminal');
  const btn = document.getElementById('toggleTerminalBtn');
  
  if (state.terminalVisible) {
    terminal.style.display = 'block';
    btn.querySelector('.toggle-icon').style.transform = 'rotate(90deg)';
  } else {
    terminal.style.display = 'none';
    btn.querySelector('.toggle-icon').style.transform = 'rotate(0deg)';
  }
}

// ========== SCAN SONGS ==========
async function scanSongs() {
  showToast('🔍 Scanning songs...', 'info');
  
  const scanBtn = document.getElementById('scanBtn');
  
  scanBtn.disabled = true;
  scanBtn.innerHTML = '<span class="btn-icon">⏳</span> SCANNING...';
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Use getSongsWithScroll for auto-scroll
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'getSongsWithScroll' });
    
    if (response?.songs?.length > 0) {
      state.songs = response.songs;
      state.selectedSongs = new Set(response.songs.map(s => s.id));
      state.expectedCount = response.expectedCount;
      
      updateSongsCount(response.songs.length, response.expectedCount);
      updateSongList();
      showSections();
      
      const found = response.songs.length;
      const expected = response.expectedCount;
      
      if (expected && found < expected) {
        showToast(`⚠️ Found ${found}/${expected} songs`, 'warning');
      } else {
        showToast(`✅ Found ${found} songs!`, 'success');
      }
    } else {
      showToast('❌ No songs found on this page', 'error');
    }
  } catch (e) {
    console.error('Scan error:', e);
    showToast('❌ Scan failed - refresh page', 'error');
  }
  
  scanBtn.disabled = false;
  scanBtn.innerHTML = '<span class="btn-icon">🔍</span> SCAN SONGS FROM PAGE';
}

// ========== UPDATE SONGS COUNT ==========
function updateSongsCount(found, expected) {
  const countEl = document.getElementById('songsCount');
  
  if (expected) {
    countEl.textContent = `${found}/${expected}`;
    
    if (found >= expected) {
      countEl.className = 'songs-count complete';
    } else {
      countEl.className = 'songs-count incomplete';
    }
  } else {
    countEl.textContent = found;
    countEl.className = 'songs-count complete';
  }
}

// ========== SONG LIST ==========
function updateSongList() {
  const listEl = document.getElementById('songList');
  listEl.innerHTML = '';
  
  state.songs.forEach((song, index) => {
    const item = document.createElement('div');
    item.className = `song-item ${state.selectedSongs.has(song.id) ? 'selected' : ''}`;
    item.innerHTML = `
      <span class="song-index">${index + 1}</span>
      <div class="song-checkbox">${state.selectedSongs.has(song.id) ? '✓' : ''}</div>
      <div class="song-title">${song.title}</div>
    `;
    item.addEventListener('click', () => toggleSong(song.id));
    listEl.appendChild(item);
  });
  
  updateSelectedCount();
}

function toggleSong(id) {
  if (state.selectedSongs.has(id)) {
    state.selectedSongs.delete(id);
  } else {
    state.selectedSongs.add(id);
  }
  updateSongList();
}

function selectAll() {
  state.selectedSongs = new Set(state.songs.map(s => s.id));
  updateSongList();
}

function selectNone() {
  state.selectedSongs.clear();
  updateSongList();
}

function updateSelectedCount() {
  const count = state.selectedSongs.size;
  document.getElementById('selectedCount').textContent = count;
  document.getElementById('downloadCount').textContent = count;
}

function showSections() {
  document.getElementById('songsSection').style.display = 'block';
  document.getElementById('formatSection').style.display = 'block';
  document.getElementById('downloadSection').style.display = 'block';
}

function clearList() {
  state.songs = [];
  state.selectedSongs.clear();
  state.expectedCount = null;
  state.listVisible = false;
  
  document.getElementById('songsSection').style.display = 'none';
  document.getElementById('formatSection').style.display = 'none';
  document.getElementById('downloadSection').style.display = 'none';
  document.getElementById('progressSection').style.display = 'none';
  document.getElementById('songsListContainer').style.display = 'none';
  document.getElementById('toggleListBtn').classList.remove('active');
  document.getElementById('toggleListBtn').querySelector('.toggle-text').textContent = 'Show';
  
  showToast('🗑 List cleared', 'info');
}

// ========== DOWNLOAD ==========
async function downloadSelected() {
  const selectedSongs = state.songs.filter(s => state.selectedSongs.has(s.id));
  
  if (selectedSongs.length === 0) {
    showToast('❌ Select songs first', 'error');
    return;
  }
  
  startDownload(selectedSongs);
}

async function downloadAll() {
  if (state.songs.length === 0) {
    showToast('❌ Scan songs first', 'error');
    return;
  }
  
  startDownload(state.songs);
}

async function startDownload(songs) {
  state.isDownloading = true;
  state.startTime = Date.now();
  
  // Show progress section
  document.getElementById('progressSection').style.display = 'block';
  document.getElementById('terminal').innerHTML = '';
  document.getElementById('progressBar').style.width = '0%';
  
  // Start timer
  state.timerInterval = setInterval(updateTimer, 1000);
  
  addTerminalLog(`🚀 Starting download: ${songs.length} songs`, 'success');
  addTerminalLog(`📦 Format: ${state.selectedFormat.toUpperCase()}`, 'info');
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    chrome.tabs.sendMessage(tab.id, {
      action: 'downloadSongs',
      songs: songs,
      format: state.selectedFormat
    });
  } catch (e) {
    console.error('Download error:', e);
    showToast('❌ Download failed', 'error');
    finishDownload();
  }
}

function handleDownloadProgress(data) {
  const { current, total, songName, step, status } = data;
  
  // Update progress bar
  const percent = (current / total) * 100;
  document.getElementById('progressBar').style.width = `${percent}%`;
  document.getElementById('progressStats').textContent = `${current} / ${total}`;
  
  // Update current song info
  document.getElementById('currentSong').textContent = songName || '-';
  document.getElementById('currentStep').textContent = step || '-';
  
  // Add terminal log
  if (status === 'downloading') {
    addTerminalLog(`📥 [${current}/${total}] ${songName}`, 'info');
  } else if (status === 'complete') {
    addTerminalLog(`✅ ${songName}`, 'success');
  } else if (status === 'error') {
    addTerminalLog(`❌ ${songName}: ${step}`, 'error');
  } else if (status === 'finished' || status === 'stopped') {
    finishDownload();
    showToast(status === 'finished' ? '✅ Download complete!' : '⏹ Download stopped', 
              status === 'finished' ? 'success' : 'info');
  }
}

function addTerminalLog(message, type = 'info') {
  const terminal = document.getElementById('terminal');
  const line = document.createElement('div');
  line.className = `terminal-line ${type}`;
  line.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  terminal.appendChild(line);
  terminal.scrollTop = terminal.scrollHeight;
}

async function stopDownload() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id, { action: 'stopDownload' });
  } catch (e) {
    console.error('Stop error:', e);
  }
  
  finishDownload();
  showToast('⏹ Download stopped', 'info');
}

function finishDownload() {
  state.isDownloading = false;
  
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
}

function updateTimer() {
  if (!state.startTime) return;
  
  const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
  const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
  const secs = (elapsed % 60).toString().padStart(2, '0');
  
  document.getElementById('progressTime').textContent = `${mins}:${secs}`;
}

// ========== TOAST ==========
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  
  setTimeout(() => {
    toast.className = 'toast';
  }, 3000);
}
