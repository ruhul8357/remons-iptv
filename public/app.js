// ==========================================================================
// REMONS IPTV PLAYER - APPLICATION ENGINE
// ==========================================================================

// Application State
let state = {
  channels: [],
  filteredChannels: [],
  categories: [],
  currentCategory: 'All Channels',
  searchQuery: '',
  playingChannel: null,
  hlsInstance: null,
  isMuted: false,
  volume: 1.0,
  theaterMode: false,
  controlsTimeout: null,
  adminToken: null,
  liveTimerInterval: null,
  liveStartTime: 0
};

// UI Elements (populated on DOMContentLoaded)
let DOM = {};

// Premium Colors for Ambient Backlight Glow matching SVG gradients
const AMBIENT_COLORS = [
  'rgba(0, 198, 255, 0.4)',   // Electric Blue
  'rgba(248, 87, 166, 0.4)',  // Sunset Pink
  'rgba(17, 153, 142, 0.4)',  // Neon Green
  'rgba(252, 70, 107, 0.4)',  // Cyberpunk Magenta
  'rgba(255, 153, 102, 0.4)', // Warm Coral
  'rgba(138, 35, 135, 0.4)',  // Royal Purple
  'rgba(241, 39, 17, 0.4)',   // Fire Gold
  'rgba(71, 118, 230, 0.4)'   // Deep Indigo
];

// Initialize Application Safely
function init() {
  try {
    // 1. Populate UI Selectors
    initDOMSelectors();

    // 2. Load settings from local storage
    state.volume = parseFloat(localStorage.getItem('remons-volume') || '1.0');
    state.adminToken = localStorage.getItem('remons-admin-token') || null;

    // 3. Initialize state views
    initPlayerSettings();

    // 4. Bind event listeners
    setupEventListeners();

    // 5. Fetch channel data
    fetchChannels();

    // 6. Create initial Lucide vector icons
    createIconsSafe();
    
  } catch (error) {
    showGlobalCrashError(error);
  }
}

// Robust execution matching document readyState
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

/**
 * Display a visible crash banner if a critical Javascript error happens on startup
 */
function showGlobalCrashError(error) {
  console.error('Critical initialization error:', error);
  const crashDiv = document.createElement('div');
  crashDiv.style.position = 'fixed';
  crashDiv.style.top = '10px';
  crashDiv.style.left = '10px';
  crashDiv.style.right = '10px';
  crashDiv.style.background = 'rgba(255, 59, 48, 0.95)';
  crashDiv.style.color = 'white';
  crashDiv.style.padding = '20px';
  crashDiv.style.borderRadius = '12px';
  crashDiv.style.fontFamily = 'monospace';
  crashDiv.style.fontSize = '14px';
  crashDiv.style.zIndex = '10000';
  crashDiv.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';
  crashDiv.style.border = '1px solid rgba(255,255,255,0.2)';
  crashDiv.innerHTML = `
    <h3 style="margin-bottom: 10px; font-size: 18px; font-weight: bold;"> Remons IPTV Load Error</h3>
    <p style="margin-bottom: 10px;">The script encountered a fatal error during startup:</p>
    <pre style="background: rgba(0,0,0,0.2); padding: 10px; border-radius: 6px; overflow-x: auto;">${error.stack || error.message || error}</pre>
    <p style="margin-top: 10px; font-size: 12px; opacity: 0.8;">Try refreshing the page or checking if CDN links (Lucide/Hls.js) are accessible in your environment.</p>
  `;
  document.body.appendChild(crashDiv);
}

/**
 * Safe wrapper to call Lucide icon creator
 */
function createIconsSafe() {
  if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
    lucide.createIcons();
  } else {
    console.warn('Lucide icons library not loaded or loaded slowly.');
  }
}

/**
 * Populate selectors dynamically on load
 */
function initDOMSelectors() {
  DOM = {
    video: document.getElementById('videoPlayer'),
    playerWrapper: document.getElementById('playerWrapper'),
    ambientBacklight: document.getElementById('ambientBacklight'),
    
    // Overlays
    loadingOverlay: document.getElementById('loadingOverlay'),
    errorOverlay: document.getElementById('errorOverlay'),
    splashOverlay: document.getElementById('splashOverlay'),
    errorMsg: document.getElementById('errorMsg'),
    retryBtn: document.getElementById('retryBtn'),
    
    // Controls
    playerControls: document.getElementById('playerControls'),
    playingChannelName: document.getElementById('playingChannelName'),
    playingChannelLogo: document.getElementById('playingChannelLogo'),
    playPauseBtn: document.getElementById('playPauseBtn'),
    muteBtn: document.getElementById('muteBtn'),
    volumeSlider: document.getElementById('volumeSlider'),
    liveTimer: document.getElementById('liveTimer'),
    pipBtn: document.getElementById('pipBtn'),
    theaterBtn: document.getElementById('theaterBtn'),
    fullscreenBtn: document.getElementById('fullscreenBtn'),
    
    // Channel List
    searchBar: document.getElementById('searchBar'),
    clearSearch: document.getElementById('clearSearch'),
    categoriesContainer: document.getElementById('categoriesContainer'),
    channelsGrid: document.getElementById('channelsGrid'),
    emptyState: document.getElementById('emptyState'),
    
    // Admin Modal
    adminBtn: document.getElementById('adminBtn'),
    adminModal: document.getElementById('adminModal'),
    closeModalBtn: document.getElementById('closeModalBtn'),
    modalAuthSection: document.getElementById('modalAuthSection'),
    modalDashboardSection: document.getElementById('modalDashboardSection'),
    
    // Forms
    loginForm: document.getElementById('loginForm'),
    adminPassword: document.getElementById('adminPassword'),
    togglePasswordBtn: document.getElementById('togglePasswordBtn'),
    authErrorMsg: document.getElementById('authErrorMsg'),
    
    uploadPlaylistForm: document.getElementById('uploadPlaylistForm'),
    playlistFileInput: document.getElementById('playlistFileInput'),
    fileNameDisplay: document.getElementById('fileNameDisplay'),
    playlistUrlInput: document.getElementById('playlistUrlInput'),
    uploadStatusMsg: document.getElementById('uploadStatusMsg'),
    uploadBtn: document.getElementById('uploadBtn'),
    
    settingsForm: document.getElementById('settingsForm'),
    cacheDurationInput: document.getElementById('cacheDurationInput'),
    newPasswordInput: document.getElementById('newPasswordInput'),
    settingsStatusMsg: document.getElementById('settingsStatusMsg'),
    
    // Stats & System
    statsChannelsCount: document.getElementById('statsChannelsCount'),
    statsLogosCount: document.getElementById('statsLogosCount'),
    forceRevalidateBtn: document.getElementById('forceRevalidateBtn'),
    revalidateStatusMsg: document.getElementById('revalidateStatusMsg'),
    logoutBtn: document.getElementById('logoutBtn')
  };

  // Verify that crucial elements are present, throw if missing
  if (!DOM.video || !DOM.channelsGrid || !DOM.playerWrapper) {
    throw new Error('Crucial DOM elements (videoPlayer, channelsGrid, or playerWrapper) could not be resolved in index.html.');
  }
}

// ==========================================================================
// CORE DATA FETCHING & RENDERING
// ==========================================================================

/**
 * Fetch channel list from backend
 */
async function fetchChannels() {
  try {
    const response = await fetch('/api/channels');
    const data = await response.json();
    
    if (data.success) {
      state.channels = data.channels;
      state.categories = data.categories;
      
      renderCategories();
      filterAndSearch();
      
      // Update system stats if logged in
      if (state.adminToken) {
        updateSystemStats();
      }
    } else {
      showGridError('Failed to fetch channels: ' + (data.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('Error fetching channels:', error);
    showGridError('Server connection error. Please ensure backend is running.');
  }
}

/**
 * Render category navigation pills
 */
function renderCategories() {
  if (!DOM.categoriesContainer) return;
  DOM.categoriesContainer.innerHTML = '';
  
  state.categories.forEach(category => {
    const button = document.createElement('button');
    button.className = `category-pill ${state.currentCategory === category ? 'active' : ''}`;
    button.textContent = category;
    button.addEventListener('click', () => {
      // Set active state
      document.querySelectorAll('.category-pill').forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      
      state.currentCategory = category;
      filterAndSearch();
    });
    DOM.categoriesContainer.appendChild(button);
  });
}

/**
 * Helper to match channel against search query with support for aliases and abbreviations.
 */
function matchSearch(channel, query) {
  const nameClean = channel.name.toLowerCase();
  const groupClean = (channel.group || '').toLowerCase();
  const qClean = query.toLowerCase().trim();
  
  if (!qClean) return true;
  
  // 1. Direct substring match
  if (nameClean.includes(qClean) || groupClean.includes(qClean)) return true;
  
  // 2. Normalize "tyc" to "tc" (and vice versa) to support "tc" searching for "TyC Sports"
  // "tyc" represents "T y C" (Torneos y Competencias) which is often abbreviated or searched as "tc"
  const nameNoY = nameClean.replace(/tyc/g, 'tc');
  const qNoY = qClean.replace(/tyc/g, 'tc');
  if (nameNoY.includes(qNoY) || nameClean.includes(qNoY)) return true;
  
  // 3. Initials / acronym matching (e.g. "ts" for "Tyc Sports", "ds" for "DSports")
  // Strip emojis, country flags/tags and split into alphanumeric words
  const words = nameClean
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(Boolean);
  
  if (words.length > 0) {
    const initials = words.map(w => w[0]).join('');
    if (initials.includes(qClean)) return true;
  }
  
  return false;
}

/**
 * Filter and Search Channels
 */
function filterAndSearch() {
  let list = state.channels;
  
  // Apply Category Filter
  if (state.currentCategory !== 'All Channels') {
    list = list.filter(c => c.group === state.currentCategory);
  }
  
  // Apply Search query
  if (state.searchQuery) {
    list = list.filter(c => matchSearch(c, state.searchQuery));
  }
  
  state.filteredChannels = list;
  renderChannelsGrid();
}

/**
 * Render the Channel Cards Grid
 */
function renderChannelsGrid() {
  if (!DOM.channelsGrid) return;
  DOM.channelsGrid.innerHTML = '';
  
  if (state.filteredChannels.length === 0) {
    if (DOM.emptyState) DOM.emptyState.style.display = 'flex';
    return;
  }
  
  if (DOM.emptyState) DOM.emptyState.style.display = 'none';
  
  state.filteredChannels.forEach(channel => {
    const card = document.createElement('div');
    const isPlaying = state.playingChannel && state.playingChannel.id === channel.id;
    card.className = `channel-card ${isPlaying ? 'active' : ''}`;
    
    // Use the static cached logo resolved by the server, or default fallback
    const logoUrl = channel.logo || `/api/logos/${channel.id}.svg`;
    
    card.innerHTML = `
      <div class="channel-logo-container">
        <img src="${logoUrl}" alt="${channel.name}" onerror="this.style.display='none'">
      </div>
      <div class="channel-name">${channel.name}</div>
      ${isPlaying ? `
        <div class="playing-indicator" title="Now Playing">
          <span></span><span></span><span></span><span></span>
        </div>
      ` : ''}
    `;
    
    card.addEventListener('click', () => {
      playChannel(channel);
    });
    
    DOM.channelsGrid.appendChild(card);
  });
}

function showGridError(msg) {
  if (DOM.channelsGrid) {
    DOM.channelsGrid.innerHTML = `<div class="error-msg" style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--error); font-weight: 500;">${msg}</div>`;
  }
}

// ==========================================================================
// VIDEO PLAYER PLAYBACK & ENGINE (HLS.js)
// ==========================================================================

/**
 * Initialize player states (Volume, local timers, etc.)
 */
function initPlayerSettings() {
  if (DOM.video) DOM.video.volume = state.volume;
  if (DOM.volumeSlider) DOM.volumeSlider.value = state.volume;
  updateVolumeIcon();
  
  // Reset overlay views
  if (DOM.loadingOverlay) DOM.loadingOverlay.classList.add('hidden');
  if (DOM.errorOverlay) DOM.errorOverlay.style.display = 'none';
  if (DOM.splashOverlay) DOM.splashOverlay.classList.remove('hidden');
}

/**
 * Resolves local file paths to a proxied API stream URL so that
 * the browser can read local HLS files over HTTP bypassing sandbox rules.
 */
function getStreamUrl(url) {
  if (!url) return '';
  
  const trimmed = url.trim();
  
  // Check if it is a remote HTTP/HTTPS URL
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  
  // If it is a file URL starting with file:///
  let cleanPath = trimmed;
  if (trimmed.startsWith('file:///')) {
    cleanPath = trimmed.replace('file:///', '');
  }
  
  // Return proxied stream url
  return `/api/stream?path=${encodeURIComponent(cleanPath)}`;
}

/**
 * Play a specific channel in the top player
 */
function playChannel(channel) {
  state.playingChannel = channel;
  
  // Update UI selection grid
  renderChannelsGrid();
  
  // Reset Overlays
  if (DOM.splashOverlay) DOM.splashOverlay.classList.add('hidden');
  if (DOM.errorOverlay) DOM.errorOverlay.style.display = 'none';
  if (DOM.loadingOverlay) DOM.loadingOverlay.classList.remove('hidden');
  
  if (DOM.playingChannelName) DOM.playingChannelName.textContent = channel.name;
  
  if (DOM.playingChannelLogo) {
    const logoUrl = channel.logo || `/api/logos/${channel.id}.svg`;
    DOM.playingChannelLogo.src = logoUrl;
    DOM.playingChannelLogo.style.display = 'block';
  }
  
  // Setup Backlight Ambient Color dynamically based on Channel Name hash
  setAmbientGlow(channel.name);
  
  // Destroy old Hls instance
  if (state.hlsInstance) {
    state.hlsInstance.destroy();
    state.hlsInstance = null;
  }
  
  // Reset video source
  if (DOM.video) {
    DOM.video.removeAttribute('src');
    DOM.video.load();
  }
  
  // Clear any existing timer
  if (state.liveTimerInterval) {
    clearInterval(state.liveTimerInterval);
  }
  if (DOM.liveTimer) DOM.liveTimer.textContent = '00:00:00';
  state.liveStartTime = Date.now();
  
  const streamUrl = getStreamUrl(channel.url);
  const isHlsUrl = streamUrl.toLowerCase().includes('.m3u8') || (streamUrl.toLowerCase().includes('path=') && streamUrl.toLowerCase().includes('.m3u8'));
  const hasHlsLibrary = typeof Hls !== 'undefined';
  
  // Load new source
  if (hasHlsLibrary && Hls.isSupported() && isHlsUrl) {
    state.hlsInstance = new Hls({
      maxMaxBufferLength: 10,
      enableWorker: true,
      lowLatencyMode: true
    });
    
    state.hlsInstance.loadSource(streamUrl);
    state.hlsInstance.attachMedia(DOM.video);
    
    state.hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
      if (DOM.loadingOverlay) DOM.loadingOverlay.classList.add('hidden');
      DOM.video.play()
        .then(startLiveTimer)
        .catch(handlePlayBlock);
    });
    
    state.hlsInstance.on(Hls.Events.ERROR, (event, data) => {
      if (data.fatal) {
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            console.warn('HLS Network error, trying to recover...', data);
            state.hlsInstance.startLoad();
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            console.warn('HLS Media error, trying to recover...', data);
            state.hlsInstance.recoverMediaError();
            break;
          default:
            handlePlaybackError(data.details || 'HLS Decoding fatal error');
            break;
        }
      }
    });
    
  } else if (DOM.video) {
    // Native browser playback (Safari/iOS support HLS natively, or playing MP4/WebM)
    DOM.video.src = streamUrl;
    
    const onCanPlay = () => {
      if (DOM.loadingOverlay) DOM.loadingOverlay.classList.add('hidden');
      DOM.video.play()
        .then(startLiveTimer)
        .catch(handlePlayBlock);
      DOM.video.removeEventListener('canplay', onCanPlay);
    };
    
    DOM.video.addEventListener('canplay', onCanPlay);
    
    const onNativeError = (e) => {
      handlePlaybackError('Native player loading error.');
      DOM.video.removeEventListener('error', onNativeError);
    };
    DOM.video.addEventListener('error', onNativeError);
  }
  
  // Scroll to player for smooth mobile feel
  if (window.innerWidth < 768 && DOM.playerWrapper) {
    DOM.playerWrapper.scrollIntoView({ behavior: 'smooth' });
  }
}

/**
 * Handle browser blocking autoplay (requires user interaction or muted playback)
 */
function handlePlayBlock() {
  console.log('Autoplay blocked. Initializing muted playback.');
  state.isMuted = true;
  if (DOM.video) DOM.video.muted = true;
  updateVolumeIcon();
  if (DOM.video) {
    DOM.video.play()
      .then(startLiveTimer)
      .catch(err => {
        handlePlaybackError('User interaction required to start audio/video.');
      });
  }
}

function handlePlaybackError(details) {
  console.error('Stream playback failed:', details);
  if (DOM.loadingOverlay) DOM.loadingOverlay.classList.add('hidden');
  if (DOM.errorOverlay) DOM.errorOverlay.style.display = 'flex';
  if (DOM.errorMsg) DOM.errorMsg.textContent = `The channel stream is offline, has CORS policies, or is invalid: (${details})`;
  
  if (state.liveTimerInterval) {
    clearInterval(state.liveTimerInterval);
  }
  
  // Set glow to deep red on error
  if (DOM.ambientBacklight) {
    DOM.ambientBacklight.style.background = `radial-gradient(circle, rgba(255, 59, 48, 0.2) 0%, rgba(3, 2, 9, 0) 70%)`;
  }
}

/**
 * Live duration counter
 */
function startLiveTimer() {
  if (state.liveTimerInterval) clearInterval(state.liveTimerInterval);
  
  state.liveStartTime = Date.now();
  state.liveTimerInterval = setInterval(() => {
    const diff = Date.now() - state.liveStartTime;
    const hrs = Math.floor(diff / 3600000).toString().padStart(2, '0');
    const mins = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
    const secs = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
    if (DOM.liveTimer) DOM.liveTimer.textContent = `${hrs}:${mins}:${secs}`;
  }, 1000);
}

/**
 * Premium Hashing to pick ambient background glow matching channel card gradients
 */
function setAmbientGlow(name) {
  if (!DOM.ambientBacklight) return;
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colorIdx = Math.abs(hash) % AMBIENT_COLORS.length;
  const color = AMBIENT_COLORS[colorIdx];
  DOM.ambientBacklight.style.background = `radial-gradient(circle, ${color} 0%, rgba(3, 2, 9, 0) 70%)`;
}

// ==========================================================================
// PLAYER CONTROLS & EVENT BINDINGS
// ==========================================================================

function togglePlay() {
  if (!DOM.video) return;
  if (DOM.video.paused) {
    DOM.video.play()
      .then(startLiveTimer)
      .catch(handlePlayBlock);
    if (DOM.playPauseBtn) DOM.playPauseBtn.innerHTML = '<i data-lucide="pause"></i>';
  } else {
    DOM.video.pause();
    if (state.liveTimerInterval) clearInterval(state.liveTimerInterval);
    if (DOM.playPauseBtn) DOM.playPauseBtn.innerHTML = '<i data-lucide="play"></i>';
  }
  createIconsSafe();
}

function toggleMute() {
  if (!DOM.video) return;
  state.isMuted = !state.isMuted;
  DOM.video.muted = state.isMuted;
  
  if (DOM.volumeSlider) {
    if (state.isMuted) {
      DOM.volumeSlider.value = 0;
    } else {
      DOM.volumeSlider.value = state.volume;
    }
  }
  updateVolumeIcon();
}

function handleVolumeChange(e) {
  if (!DOM.video) return;
  state.volume = parseFloat(e.target.value);
  DOM.video.volume = state.volume;
  
  if (state.volume === 0) {
    state.isMuted = true;
    DOM.video.muted = true;
  } else {
    state.isMuted = false;
    DOM.video.muted = false;
  }
  
  localStorage.setItem('remons-volume', state.volume);
  updateVolumeIcon();
}

function updateVolumeIcon() {
  if (!DOM.muteBtn) return;
  let icon = 'volume-2';
  if (state.isMuted || state.volume === 0) {
    icon = 'volume-x';
  } else if (state.volume < 0.4) {
    icon = 'volume';
  } else if (state.volume < 0.7) {
    icon = 'volume-1';
  }
  DOM.muteBtn.innerHTML = `<i data-lucide="${icon}"></i>`;
  createIconsSafe();
}

// Theater Mode toggle
function toggleTheaterMode() {
  if (!DOM.playerWrapper) return;
  state.theaterMode = !state.theaterMode;
  DOM.playerWrapper.classList.toggle('theater', state.theaterMode);
  
  if (DOM.theaterBtn) {
    DOM.theaterBtn.innerHTML = `<i data-lucide="${state.theaterMode ? 'minimize-2' : 'layout'}"></i>`;
  }
  createIconsSafe();
}

// Fullscreen toggle
function toggleFullscreen() {
  if (!DOM.playerWrapper) return;
  if (!document.fullscreenElement) {
    DOM.playerWrapper.requestFullscreen()
      .catch(err => console.error(`Error attempting fullscreen: ${err.message}`));
  } else {
    document.exitFullscreen();
  }
}

// Picture-in-Picture
function togglePip() {
  if (!DOM.video) return;
  if (document.pictureInPictureElement) {
    document.exitPictureInPicture().catch(e => console.error(e));
  } else if (DOM.video.readyState >= 2) {
    DOM.video.requestPictureInPicture().catch(e => console.error(e));
  }
}

// Auto hide player controls on idle (3 seconds)
function triggerControlsTimeout() {
  if (!DOM.playerControls || !DOM.playerWrapper || !DOM.video) return;
  DOM.playerControls.classList.remove('hide-controls');
  DOM.playerWrapper.classList.remove('hide-cursor');
  
  clearTimeout(state.controlsTimeout);
  
  if (!DOM.video.paused && !DOM.video.ended) {
    state.controlsTimeout = setTimeout(() => {
      DOM.playerControls.classList.add('hide-controls');
      DOM.playerWrapper.classList.add('hide-cursor');
    }, 3000);
  }
}

// ==========================================================================
// ADMIN DASHBOARD & AUTHENTICATION
// ==========================================================================

/**
 * Open admin dashboard and determine login status
 */
function openAdminModal() {
  if (!DOM.adminModal) return;
  DOM.adminModal.classList.add('open');
  if (DOM.authErrorMsg) DOM.authErrorMsg.textContent = '';
  
  if (state.adminToken) {
    showAdminDashboard();
  } else {
    showAdminAuth();
  }
}

function showAdminAuth() {
  if (DOM.modalAuthSection) DOM.modalAuthSection.style.display = 'block';
  if (DOM.modalDashboardSection) DOM.modalDashboardSection.style.display = 'none';
  if (DOM.adminPassword) DOM.adminPassword.value = '';
}

function showAdminDashboard() {
  if (DOM.modalAuthSection) DOM.modalAuthSection.style.display = 'none';
  if (DOM.modalDashboardSection) DOM.modalDashboardSection.style.display = 'block';
  updateSystemStats();
  
  // Reset tab selection
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(tab => tab.style.display = 'none');
  
  const defaultTab = document.querySelector('[data-tab="uploadTab"]');
  if (defaultTab) defaultTab.classList.add('active');
  const defaultContent = document.getElementById('uploadTab');
  if (defaultContent) defaultContent.style.display = 'block';
}

/**
 * Fetch and render stats in admin dashboard
 */
async function updateSystemStats() {
  try {
    const response = await fetch('/api/channels');
    const data = await response.json();
    if (data.success) {
      if (DOM.statsChannelsCount) DOM.statsChannelsCount.textContent = data.channels.length;
      
      // Filter out fallback logo generated SVGs to count successfully cached network images
      const cachedCount = data.channels.filter(c => c.logo && !c.logo.startsWith('data:')).length;
      if (DOM.statsLogosCount) DOM.statsLogosCount.textContent = cachedCount;
    }
  } catch (err) {
    console.error('Stats loading failed:', err);
  }
}

/**
 * Set up listeners for file uploads, settings updates, and auth submittals
 */
function setupEventListeners() {
  // Player Listeners
  if (DOM.playPauseBtn) DOM.playPauseBtn.addEventListener('click', togglePlay);
  if (DOM.video) DOM.video.addEventListener('click', togglePlay);
  if (DOM.muteBtn) DOM.muteBtn.addEventListener('click', toggleMute);
  if (DOM.volumeSlider) DOM.volumeSlider.addEventListener('input', handleVolumeChange);
  if (DOM.pipBtn) DOM.pipBtn.addEventListener('click', togglePip);
  if (DOM.theaterBtn) DOM.theaterBtn.addEventListener('click', toggleTheaterMode);
  if (DOM.fullscreenBtn) DOM.fullscreenBtn.addEventListener('click', toggleFullscreen);
  if (DOM.retryBtn) DOM.retryBtn.addEventListener('click', () => playChannel(state.playingChannel));
  
  // Track fullscreen state to update icon
  document.addEventListener('fullscreenchange', () => {
    if (!DOM.fullscreenBtn) return;
    const isFS = !!document.fullscreenElement;
    DOM.fullscreenBtn.innerHTML = `<i data-lucide="${isFS ? 'minimize' : 'maximize'}"></i>`;
    createIconsSafe();
  });
  
  // Hide controls on mouse idle
  if (DOM.playerWrapper) {
    DOM.playerWrapper.addEventListener('mousemove', triggerControlsTimeout);
    DOM.playerWrapper.addEventListener('mouseleave', () => {
      if (DOM.video && !DOM.video.paused) {
        if (DOM.playerControls) DOM.playerControls.classList.add('hide-controls');
        DOM.playerWrapper.classList.add('hide-cursor');
      }
    });
  }
  
  if (DOM.video) {
    DOM.video.addEventListener('play', triggerControlsTimeout);
    DOM.video.addEventListener('pause', () => {
      if (DOM.playerControls) DOM.playerControls.classList.remove('hide-controls');
      if (DOM.playerWrapper) DOM.playerWrapper.classList.remove('hide-cursor');
      clearTimeout(state.controlsTimeout);
    });
  }
  
  // Search Bar
  if (DOM.searchBar) {
    DOM.searchBar.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      if (DOM.clearSearch) {
        DOM.clearSearch.style.display = state.searchQuery ? 'block' : 'none';
      }
      filterAndSearch();
    });
  }
  
  if (DOM.clearSearch) {
    DOM.clearSearch.addEventListener('click', () => {
      if (DOM.searchBar) DOM.searchBar.value = '';
      state.searchQuery = '';
      DOM.clearSearch.style.display = 'none';
      filterAndSearch();
    });
  }
  
  // Admin button modal triggers
  if (DOM.adminBtn) DOM.adminBtn.addEventListener('click', openAdminModal);
  if (DOM.closeModalBtn) DOM.closeModalBtn.addEventListener('click', () => DOM.adminModal.classList.remove('open'));
  
  // Close modal when clicking backdrop
  if (DOM.adminModal) {
    DOM.adminModal.addEventListener('click', (e) => {
      if (e.target === DOM.adminModal) {
        DOM.adminModal.classList.remove('open');
      }
    });
  }
  
  // Toggle Password Visibility
  let showPassword = false;
  if (DOM.togglePasswordBtn) {
    DOM.togglePasswordBtn.addEventListener('click', () => {
      showPassword = !showPassword;
      if (DOM.adminPassword) DOM.adminPassword.type = showPassword ? 'text' : 'password';
      DOM.togglePasswordBtn.innerHTML = `<i data-lucide="${showPassword ? 'eye-off' : 'eye'}"></i>`;
      createIconsSafe();
    });
  }
  
  // Login Form Submission
  if (DOM.loginForm) {
    DOM.loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (DOM.authErrorMsg) DOM.authErrorMsg.textContent = '';
      
      const password = DOM.adminPassword ? DOM.adminPassword.value : '';
      try {
        const response = await fetch('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password })
        });
        const data = await response.json();
        
        if (data.success) {
          state.adminToken = data.token;
          localStorage.setItem('remons-admin-token', data.token);
          showAdminDashboard();
        } else {
          if (DOM.authErrorMsg) DOM.authErrorMsg.textContent = data.error || 'Login failed';
        }
      } catch (err) {
        if (DOM.authErrorMsg) DOM.authErrorMsg.textContent = 'Server communication error';
      }
    });
  }
  
  // Logout
  if (DOM.logoutBtn) {
    DOM.logoutBtn.addEventListener('click', () => {
      state.adminToken = null;
      localStorage.removeItem('remons-admin-token');
      showAdminAuth();
    });
  }
  
  // Tab Switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
      
      btn.classList.add('active');
      const tabId = btn.getAttribute('data-tab');
      const targetTab = document.getElementById(tabId);
      if (targetTab) targetTab.style.display = 'block';
    });
  });
  
  // Radio button source toggles in upload tab
  document.querySelectorAll('input[name="playlistSource"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      const isFile = e.target.value === 'file';
      const fileGroup = document.getElementById('fileSourceGroup');
      const urlGroup = document.getElementById('urlSourceGroup');
      if (fileGroup) fileGroup.style.display = isFile ? 'block' : 'none';
      if (urlGroup) urlGroup.style.display = isFile ? 'none' : 'block';
    });
  });
  
  // File input change tracker
  if (DOM.playlistFileInput) {
    DOM.playlistFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (DOM.fileNameDisplay) {
        DOM.fileNameDisplay.textContent = file ? file.name : 'No file selected';
      }
    });
  }
  
  // Playlist Form Upload
  if (DOM.uploadPlaylistForm) {
    DOM.uploadPlaylistForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (DOM.uploadStatusMsg) {
        DOM.uploadStatusMsg.className = 'status-msg loading';
        DOM.uploadStatusMsg.textContent = 'Uploading playlist and parsing channels... Please wait...';
      }
      if (DOM.uploadBtn) DOM.uploadBtn.disabled = true;
      
      const sourceEl = document.querySelector('input[name="playlistSource"]:checked');
      const source = sourceEl ? sourceEl.value : 'file';
      const formData = new FormData();
      
      if (source === 'file') {
        const file = DOM.playlistFileInput ? DOM.playlistFileInput.files[0] : null;
        if (!file) {
          if (DOM.uploadStatusMsg) {
            DOM.uploadStatusMsg.className = 'status-msg error';
            DOM.uploadStatusMsg.textContent = 'Please select an M3U file to upload';
          }
          if (DOM.uploadBtn) DOM.uploadBtn.disabled = false;
          return;
        }
        formData.append('playlistFile', file);
      } else {
        const url = DOM.playlistUrlInput ? DOM.playlistUrlInput.value.trim() : '';
        if (!url) {
          if (DOM.uploadStatusMsg) {
            DOM.uploadStatusMsg.className = 'status-msg error';
            DOM.uploadStatusMsg.textContent = 'Please enter a valid playlist URL';
          }
          if (DOM.uploadBtn) DOM.uploadBtn.disabled = false;
          return;
        }
        formData.append('playlistUrl', url);
      }
      
      try {
        const response = await fetch('/api/admin/m3u', {
          method: 'POST',
          headers: {
            'Authorization': state.adminToken
          },
          body: formData
        });
        const data = await response.json();
        
        if (data.success) {
          if (DOM.uploadStatusMsg) {
            DOM.uploadStatusMsg.className = 'status-msg success';
            DOM.uploadStatusMsg.textContent = data.message;
          }
          
          // Refresh channels list
          await fetchChannels();
          
          // Reset forms
          if (DOM.playlistFileInput) DOM.playlistFileInput.value = '';
          if (DOM.fileNameDisplay) DOM.fileNameDisplay.textContent = 'No file selected';
          if (DOM.playlistUrlInput) DOM.playlistUrlInput.value = '';
        } else {
          if (DOM.uploadStatusMsg) {
            DOM.uploadStatusMsg.className = 'status-msg error';
            DOM.uploadStatusMsg.textContent = data.error || 'Failed to upload playlist';
          }
        }
      } catch (err) {
        if (DOM.uploadStatusMsg) {
          DOM.uploadStatusMsg.className = 'status-msg error';
          DOM.uploadStatusMsg.textContent = 'Network error while parsing playlist';
        }
      } finally {
        if (DOM.uploadBtn) DOM.uploadBtn.disabled = false;
      }
    });
  }
  
  // Settings Update
  if (DOM.settingsForm) {
    DOM.settingsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (DOM.settingsStatusMsg) {
        DOM.settingsStatusMsg.className = 'status-msg loading';
        DOM.settingsStatusMsg.textContent = 'Updating settings...';
      }
      
      const cacheDays = DOM.cacheDurationInput ? DOM.cacheDurationInput.value : 3;
      const password = DOM.newPasswordInput ? DOM.newPasswordInput.value.trim() : '';
      
      const body = { cacheDays };
      if (password) body.password = password;
      
      try {
        const response = await fetch('/api/admin/settings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': state.adminToken
          },
          body: JSON.stringify(body)
        });
        const data = await response.json();
        
        if (data.success) {
          if (DOM.settingsStatusMsg) {
            DOM.settingsStatusMsg.className = 'status-msg success';
            DOM.settingsStatusMsg.textContent = data.message;
          }
          if (DOM.newPasswordInput) DOM.newPasswordInput.value = '';
        } else {
          if (DOM.settingsStatusMsg) {
            DOM.settingsStatusMsg.className = 'status-msg error';
            DOM.settingsStatusMsg.textContent = data.error || 'Failed to update settings';
          }
        }
      } catch (err) {
        if (DOM.settingsStatusMsg) {
          DOM.settingsStatusMsg.className = 'status-msg error';
          DOM.settingsStatusMsg.textContent = 'Network communication failed';
        }
      }
    });
  }
  
  // Force Logo Revalidation
  if (DOM.forceRevalidateBtn) {
    DOM.forceRevalidateBtn.addEventListener('click', async () => {
      if (DOM.revalidateStatusMsg) {
        DOM.revalidateStatusMsg.className = 'status-msg loading';
        DOM.revalidateStatusMsg.textContent = 'Revalidation sequence triggered. Background processor started...';
      }
      DOM.forceRevalidateBtn.disabled = true;
      
      try {
        const response = await fetch('/api/admin/revalidate', {
          method: 'POST',
          headers: {
            'Authorization': state.adminToken
          }
        });
        const data = await response.json();
        
        if (data.success) {
          if (DOM.revalidateStatusMsg) {
            DOM.revalidateStatusMsg.className = 'status-msg success';
            DOM.revalidateStatusMsg.textContent = data.message;
          }
        } else {
          if (DOM.revalidateStatusMsg) {
            DOM.revalidateStatusMsg.className = 'status-msg error';
            DOM.revalidateStatusMsg.textContent = data.error || 'Operation failed';
          }
          DOM.forceRevalidateBtn.disabled = false;
        }
      } catch (err) {
        if (DOM.revalidateStatusMsg) {
          DOM.revalidateStatusMsg.className = 'status-msg error';
          DOM.revalidateStatusMsg.textContent = 'Network error during request';
        }
        DOM.forceRevalidateBtn.disabled = false;
      }
    });
  }
}
