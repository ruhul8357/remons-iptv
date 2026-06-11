const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const http = require('http');
const https = require('https');

const { parseM3U } = require('./m3uParser');
const {
  initCacheDirs,
  resolveAndSaveLogoStatic,
  revalidateExpiredLogosBackground,
  readDb,
  writeDb,
  LOGOS_DIR
} = require('./logoCache');

const app = express();
const PORT = process.env.PORT || 3000;

// Setup Multer for M3U file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Serve cached logo files statically (Fast and Non-Dynamic!)
app.use('/api/logos', express.static(LOGOS_DIR));

/**
 * Route: GET /api/channels
 * Returns list of channels and their active groups (categories)
 */
app.get('/api/channels', async (req, res) => {
  try {
    const db = await readDb();
    
    // Group categories
    const categories = ['All Channels', ...new Set(db.channels.map(c => c.group || 'General'))];
    
    res.json({
      success: true,
      channels: db.channels,
      categories
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Route: GET /api/stream
 * Proxies local file streams (like local .m3u8 playlists and local media files) over HTTP
 * to bypass browser security sandbox restrictions.
 */
app.get('/api/stream', async (req, res) => {
  try {
    let filePath = req.query.path;
    if (!filePath) {
      return res.status(400).json({ success: false, error: 'Path parameter is required' });
    }

    // Standardize file paths (replace forward/backward slashes based on OS)
    filePath = path.normalize(filePath);

    // Verify file exists
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({ success: false, error: `File not found: ${filePath}` });
    }

    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.m3u8' || ext === '.m3u') {
      // It's an HLS playlist. We need to serve it and rewrite relative segment paths
      const content = await fs.readFile(filePath, 'utf8');
      const dirName = path.dirname(filePath);
      const lines = content.split(/\r?\n/);

      const rewrittenLines = lines.map(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
          return line;
        }

        // If it's a remote URL, leave it as is
        if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
          return line;
        }

        // If it's a relative path, resolve it to an absolute path and proxy it
        const absoluteSegmentPath = path.resolve(dirName, trimmed);
        return `/api/stream?path=${encodeURIComponent(absoluteSegmentPath)}`;
      });

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'no-cache');
      return res.send(rewrittenLines.join('\n'));
    } else {
      // It's a media segment (TS, MP4, etc.) or key file. Serve it directly
      const absolutePath = path.resolve(filePath);
      
      // Determine content type
      let contentType = 'video/mp2t'; // default for .ts segments
      if (ext === '.mp4') contentType = 'video/mp4';
      else if (ext === '.m4s') contentType = 'video/iso.segment';
      else if (ext === '.key') contentType = 'application/octet-stream';

      res.setHeader('Content-Type', contentType);
      return res.sendFile(absolutePath);
    }
  } catch (error) {
    console.error('Error streaming local file:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Helper to download remote M3U URL
 */
function fetchRemoteM3U(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const options = {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    };
    const request = client.get(url, options, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        fetchRemoteM3U(response.headers.location).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download playlist. Status Code: ${response.statusCode}`));
        return;
      }
      
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => { resolve(data); });
    });
    
    request.on('error', reject);
    request.on('timeout', () => {
      request.destroy();
      reject(new Error('Playlist download timeout'));
    });
  });
}

/**
 * Route: POST /api/admin/login
 * Simple session check
 */
app.post('/api/admin/login', async (req, res) => {
  const { password } = req.body;
  const db = await readDb();
  
  if (password === db.settings.adminPassword) {
    return res.json({ success: true, token: 'iptv-admin-token-2026' });
  }
  
  res.status(401).json({ success: false, error: 'Invalid admin password' });
});

/**
 * Middleware to check admin token
 */
function authenticateAdmin(req, res, next) {
  const token = req.headers['authorization'];
  if (token === 'iptv-admin-token-2026') {
    return next();
  }
  res.status(403).json({ success: false, error: 'Unauthorized admin access' });
}

/**
 * Route: POST /api/admin/m3u
 * Upload local M3U playlist file or supply a remote M3U URL
 */
app.post('/api/admin/m3u', authenticateAdmin, upload.single('playlistFile'), async (req, res) => {
  try {
    let m3uContent = '';
    const { playlistUrl } = req.body;
    
    if (req.file) {
      m3uContent = req.file.buffer.toString('utf8');
    } else if (playlistUrl) {
      m3uContent = await fetchRemoteM3U(playlistUrl);
    } else {
      return res.status(400).json({ success: false, error: 'Provide either an M3U file or URL' });
    }
    
    const parsedChannels = parseM3U(m3uContent);
    if (!parsedChannels || parsedChannels.length === 0) {
      return res.status(400).json({ success: false, error: 'Could not parse any channels. Is it a valid M3U file?' });
    }
    
    // Resolve and save logos from the web permanently during parsing/upload!
    console.log(`Resolving logos for ${parsedChannels.length} channels...`);
    for (let i = 0; i < parsedChannels.length; i++) {
      const channel = parsedChannels[i];
      // Resolve logo (searches DuckDuckGo / IPTV-org, saves locally, returns static path)
      channel.logo = await resolveAndSaveLogoStatic(channel.id, channel.name, channel.logo);
    }
    
    // Save to DB
    const db = await readDb();
    db.channels = parsedChannels;
    await writeDb(db);
    
    res.json({
      success: true,
      message: `Successfully loaded ${parsedChannels.length} channels. All logos searched, downloaded, and updated statically.`,
      channelCount: parsedChannels.length
    });
  } catch (error) {
    console.error('Error uploading/parsing M3U:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Route: POST /api/admin/settings
 * Update settings (Password and Cache Duration)
 */
app.post('/api/admin/settings', authenticateAdmin, async (req, res) => {
  try {
    const { password, cacheDays } = req.body;
    const db = await readDb();
    
    if (password) db.settings.adminPassword = password;
    if (cacheDays) db.settings.cacheDurationDays = parseInt(cacheDays) || 3;
    
    await writeDb(db);
    res.json({ success: true, message: 'Settings updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Route: POST /api/admin/revalidate
 * Force check for logo updates
 */
app.post('/api/admin/revalidate', authenticateAdmin, async (req, res) => {
  try {
    const db = await readDb();
    
    // Run revalidation in the background
    revalidateExpiredLogosBackground(db.channels).catch(err => {
      console.error('Manual background logo revalidation failed:', err);
    });
    
    res.json({ success: true, message: 'Manual logo revalidation started in background.' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start the Express server
async function start() {
  await initCacheDirs();
  
  // Preload default Fifa World Cup playlist from GitHub if empty or containing placeholder channels
  try {
    const db = await readDb();
    if (!db.channels || db.channels.length === 0 || db.channels.some(c => c.id.includes('nasa-tv-1'))) {
      console.log('Preloading default Fifa World Cup playlist from GitHub...');
      const defaultUrl = 'https://raw.githubusercontent.com/mahadi-devsnest/Fifa-world-cup-hd-m3u-link-/refs/heads/main/Fifa-world-cup-2026-hd-link.m3u8';
      const m3uContent = await fetchRemoteM3U(defaultUrl);
      const parsedChannels = parseM3U(m3uContent);
      
      if (parsedChannels && parsedChannels.length > 0) {
        console.log(`Resolving web logos for default ${parsedChannels.length} channels...`);
        for (let i = 0; i < parsedChannels.length; i++) {
          const channel = parsedChannels[i];
          // Search web, download, and store local static logo path
          channel.logo = await resolveAndSaveLogoStatic(channel.id, channel.name, channel.logo);
        }
        // Read fresh DB state containing all logoMetadata from the loop writes
        const freshDb = await readDb();
        freshDb.channels = parsedChannels;
        await writeDb(freshDb);
        console.log('Default playlist successfully loaded and logos cached.');
      }
    }
  } catch (err) {
    console.error('Failed to preload default playlist:', err.message);
  }
  
  // Start the background logo revalidation timer (sweeps database every 24 hours)
  setInterval(async () => {
    try {
      console.log('Running daily logo update check...');
      const db = await readDb();
      await revalidateExpiredLogosBackground(db.channels);
    } catch (err) {
      console.error('Failed to run scheduled background logo revalidation:', err);
    }
  }, 24 * 60 * 60 * 1000); // every 24 hours
  
  // Run an initial logo revalidation sweep 10 seconds after startup
  setTimeout(async () => {
    try {
      console.log('Running initial startup logo revalidation check...');
      const db = await readDb();
      await revalidateExpiredLogosBackground(db.channels);
    } catch (err) {
      console.error('Failed to run initial startup logo revalidation:', err);
    }
  }, 10000);
  
  app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(` IPTV Web Player server listening on port ${PORT}`);
    console.log(` Access Local App at: http://localhost:${PORT}`);
    console.log(`=======================================================`);
  });
}

start();
