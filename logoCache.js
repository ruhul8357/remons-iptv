const fs = require('fs').promises;
const path = require('path');
const http = require('http');
const https = require('https');

const DATA_DIR = path.join(__dirname, 'data');
const LOGOS_DIR = path.join(DATA_DIR, 'logos');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// A list of premium gradients for fallback logos
const PREMIUM_GRADIENTS = [
  { c1: '#00c6ff', c2: '#0072ff' }, // Electric Blue
  { c1: '#f857a6', c2: '#ff5858' }, // Sunset Pink
  { c1: '#11998e', c2: '#38ef7d' }, // Neon Green
  { c1: '#FC466B', c2: '#3F5EFB' }, // Cyberpunk Magenta-Blue
  { c1: '#ff9966', c2: '#ff5e62' }, // Warm Coral
  { c1: '#8A2387', c2: '#E94057' }, // Royal Purple-Red
  { c1: '#f12711', c2: '#f5af19' }, // Fire Gold
  { c1: '#4776E6', c2: '#8E54E9' }  // Deep Indigo
];

let writeQueue = Promise.resolve();
let iptvOrgLogosMap = null; // Memory cache for IPTV-org logo index mapping

/**
 * Initialize cache directories and database file
 */
async function initCacheDirs() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.mkdir(LOGOS_DIR, { recursive: true });
    
    // Check if db.json exists, if not create it
    try {
      await fs.access(DB_FILE);
    } catch {
      const defaultDb = {
        channels: [],
        settings: {
          cacheDurationDays: 3,
          adminPassword: 'admin' // Default password
        },
        logoMetadata: {}
      };
      await fs.writeFile(DB_FILE, JSON.stringify(defaultDb, null, 2), 'utf8');
    }
  } catch (error) {
    console.error('Error initializing cache directories:', error);
  }
}

/**
 * Reads the DB file
 */
async function readDb() {
  try {
    const data = await fs.readFile(DB_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading database:', error);
    return { channels: [], settings: { cacheDurationDays: 3, adminPassword: 'admin' }, logoMetadata: {} };
  }
}

/**
 * Writes the DB file atomically using a promise queue to prevent concurrency corruption
 */
async function writeDb(dbData) {
  writeQueue = writeQueue.then(async () => {
    try {
      const tempPath = DB_FILE + '.tmp';
      await fs.writeFile(tempPath, JSON.stringify(dbData, null, 2), 'utf8');
      await fs.rename(tempPath, DB_FILE);
    } catch (error) {
      console.error('Error writing database:', error);
    }
  });
  return writeQueue;
}

function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')         // Replace spaces with -
    .replace(/[^\w\-]+/g, '')     // Remove all non-word chars
    .replace(/\-\-+/g, '-');      // Replace multiple - with single -
}

/**
 * Fetch JSON helper with a descriptive User-Agent complying with Wikipedia's robot policy
 */
function fetchJsonWithCustomAgent(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const options = {
      timeout: 8000,
      headers: {
        'User-Agent': 'IPTVPlayerBot/1.0 (info@iptvplayer.com)'
      }
    };
    client.get(url, options, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to load URL: Status ${res.statusCode}`));
        return;
      }
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

/**
 * Load the IPTV-org logo database index mapped into memory once
 */
async function loadIptvOrgLogosMap() {
  if (iptvOrgLogosMap) return iptvOrgLogosMap;
  try {
    console.log('Fetching IPTV-org logo index database...');
    const data = await fetchJsonWithCustomAgent('https://iptv-org.github.io/api/logos.json');
    iptvOrgLogosMap = {};
    if (Array.isArray(data)) {
      data.forEach(item => {
        if (item && item.channel) {
          // Map slugified channel name to logo URL (e.g. item.channel = "espn.us" -> "espn" : item.url)
          const parts = item.channel.split('.');
          const namePart = parts[0];
          if (namePart) {
            iptvOrgLogosMap[slugify(namePart)] = item.url;
          }
        }
      });
    }
    console.log(`IPTV-org logos database loaded: ${Object.keys(iptvOrgLogosMap).length} logo mappings.`);
    return iptvOrgLogosMap;
  } catch (err) {
    console.warn('Failed to load IPTV-org logos database:', err.message);
    return {};
  }
}

/**
 * Query Wikipedia's search and PageImages API to extract the official Commons SVG/PNG logo
 */
/**
 * Helper to get logo from Wikidata given a Wikipedia page title
 */
async function getWikidataLogo(pageTitle) {
  try {
    // 1. Get Wikidata item ID (QID) for the Wikipedia page
    const wpUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=pageprops&ppprop=wikibase_item&titles=${encodeURIComponent(pageTitle)}&format=json&origin=*`;
    const wpRes = await fetchJsonWithCustomAgent(wpUrl);
    
    if (!wpRes.query || !wpRes.query.pages) return null;
    const pages = wpRes.query.pages;
    const pageId = Object.keys(pages)[0];
    if (pageId === '-1') return null;
    
    const qid = pages[pageId].pageprops && pages[pageId].pageprops.wikibase_item;
    if (!qid) return null;

    // 2. Get claims for the QID from Wikidata
    const wdUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qid}&props=claims&format=json&origin=*`;
    const wdRes = await fetchJsonWithCustomAgent(wdUrl);
    
    if (!wdRes.entities || !wdRes.entities[qid]) return null;
    const claims = wdRes.entities[qid].claims;
    
    // Property P154 is "logo image"
    let logoFilename = null;
    if (claims.P154 && claims.P154.length > 0) {
      const claim = claims.P154[0];
      if (claim.mainsnak && claim.mainsnak.datavalue && claim.mainsnak.datavalue.value) {
        logoFilename = claim.mainsnak.datavalue.value;
      }
    }
    
    // Property P18 is "image" (general fallback image, e.g. logo or photo)
    if (!logoFilename && claims.P18 && claims.P18.length > 0) {
      const claim = claims.P18[0];
      if (claim.mainsnak && claim.mainsnak.datavalue && claim.mainsnak.datavalue.value) {
        logoFilename = claim.mainsnak.datavalue.value;
      }
    }
    
    if (!logoFilename) return null;

    // 3. Resolve Wikimedia Commons file URL
    const commonsUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=File:${encodeURIComponent(logoFilename)}&prop=imageinfo&iiprop=url&format=json&origin=*`;
    const commonsRes = await fetchJsonWithCustomAgent(commonsUrl);
    
    if (!commonsRes.query || !commonsRes.query.pages) return null;
    const commonsPages = commonsRes.query.pages;
    const commonsPageId = Object.keys(commonsPages)[0];
    if (commonsPageId === '-1') return null;
    
    const imageinfo = commonsPages[commonsPageId].imageinfo;
    if (imageinfo && imageinfo.length > 0) {
      return imageinfo[0].url;
    }
    
    return null;
  } catch (err) {
    console.warn(`Wikidata lookup failed for page "${pageTitle}":`, err.message);
    return null;
  }
}

async function searchWikipediaForLogo(channelName) {
  try {
    // 1. Search Wikipedia for matching page title
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(channelName)}&format=json&origin=*`;
    const searchResult = await fetchJsonWithCustomAgent(searchUrl);
    
    if (!searchResult.query || !searchResult.query.search || searchResult.query.search.length === 0) {
      return null;
    }
    
    // Take the first matching page title
    const pageTitle = searchResult.query.search[0].title;
    
    // Try Wikidata first
    const wikidataLogo = await getWikidataLogo(pageTitle);
    if (wikidataLogo) {
      return wikidataLogo;
    }
    
    // 2. Query PageImages for the original image URL of that page
    const imageUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&piprop=original&titles=${encodeURIComponent(pageTitle)}&format=json&origin=*`;
    const imageResult = await fetchJsonWithCustomAgent(imageUrl);
    
    if (imageResult.query && imageResult.query.pages) {
      const pages = imageResult.query.pages;
      const pageId = Object.keys(pages)[0];
      
      if (pageId && pages[pageId].original && pages[pageId].original.source) {
        return pages[pageId].original.source;
      }
    }
    return null;
  } catch (err) {
    console.warn(`Wikipedia logo lookup failed for "${channelName}":`, err.message);
    return null;
  }
}

/**
 * Search the web for a channel logo (using Wikipedia, IPTV-org index database, and DuckDuckGo)
 */
function cleanChannelNameForSearch(channelName) {
  if (!channelName) return '';
  return channelName
    // Remove brackets, parentheses, and their contents
    .replace(/\[.*?\]|\(.*?\)/g, '')
    // Remove country tags and quality tags
    .replace(/\b(?:HD|SD|FHD|UHD|4K|US|UK|CA|IN|AR|ES|MX|FR|DE|IT|VIP|RAW|ARG|BRA|BD|BGD)\b/gi, '')
    // Remove emojis (including flag emojis)
    .replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD00-\uDFFF]/g, '')
    // Replace multiple spaces/punctuation and clean up trailing symbols
    .replace(/\s+/g, ' ')
    .trim()
    // Remove trailing hyphens, pipes, slashes, colons
    .replace(/[-|/:\s]+$/, '')
    .trim();
}

async function searchWebForLogo(channelName) {
  const cleanName = cleanChannelNameForSearch(channelName);
  if (!cleanName) return null;

  console.log(`Searching web for logo: "${cleanName}"`);

  // Source 1: Wikipedia PageImages API (official SVG vector logos from Wikimedia Commons)
  const wikiLogo = await searchWikipediaForLogo(cleanName);
  if (wikiLogo) {
    console.log(`Logo found on Wikipedia for: "${cleanName}" -> ${wikiLogo}`);
    return wikiLogo;
  }

  // Source 2: IPTV-org JSON database lookup
  try {
    const map = await loadIptvOrgLogosMap();
    const slug = slugify(cleanName);
    if (map[slug]) {
      console.log(`Logo found in IPTV-org database index for: "${cleanName}" -> ${map[slug]}`);
      return map[slug];
    }
  } catch (err) {
    console.log(`IPTV-org database lookup failed for: "${cleanName}"`);
  }

  // Source 3: DuckDuckGo Instant Answer API
  try {
    const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(cleanName + " TV logo")}&format=json`;
    const data = await fetchJsonWithCustomAgent(ddgUrl);
    if (data.Image && data.Image.startsWith('http')) {
      console.log(`Logo found on DuckDuckGo for: "${cleanName}" -> ${data.Image}`);
      return data.Image;
    }
  } catch (err) {
    console.log(`DuckDuckGo logo lookup failed for: "${cleanName}"`);
  }

  return null;
}

/**
 * Generate initials from channel name (e.g. "HBO HD" -> "HBO")
 */
function getInitials(name) {
  if (!name) return 'TV';
  
  let cleanName = cleanChannelNameForSearch(name);
  if (!cleanName) cleanName = name;
  
  const words = cleanName.split(/\s+/);
  if (words.length >= 2) {
    return words
      .map(w => w[0])
      .slice(0, 3)
      .join('')
      .toUpperCase();
  }
  
  return cleanName.slice(0, 3).toUpperCase();
}

/**
 * Generate a premium SVG logo and save it to logos directory
 */
async function generateSvgLogo(channelId, name) {
  const initials = getInitials(name);
  
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const gradIdx = Math.abs(hash) % PREMIUM_GRADIENTS.length;
  const grad = PREMIUM_GRADIENTS[gradIdx];
  
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="120" height="120">
    <defs>
      <linearGradient id="grad-${channelId}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:${grad.c1};stop-opacity:1" />
        <stop offset="100%" style="stop-color:${grad.c2};stop-opacity:1" />
      </linearGradient>
    </defs>
    <rect width="100" height="100" rx="24" fill="url(#grad-${channelId})" />
    <rect width="94" height="94" x="3" y="3" rx="21" fill="none" stroke="#ffffff" stroke-opacity="0.15" stroke-width="2" />
    <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#ffffff" font-family="'Outfit', 'Inter', -apple-system, sans-serif" font-size="28" font-weight="800" letter-spacing="0.5">${initials}</text>
  </svg>`;
  
  const filePath = path.join(LOGOS_DIR, `${channelId}.svg`);
  await fs.writeFile(filePath, svg, 'utf8');
  return `${channelId}.svg`;
}

/**
 * Network downloader helper (uses compliant User-Agent to prevent 429s/403s)
 */
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const options = {
      timeout: 10000,
      headers: {
        'User-Agent': 'IPTVPlayerBot/1.0 (info@iptvplayer.com)'
      }
    };
    
    const request = client.get(url, options, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
        return;
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: Status Code ${response.statusCode}`));
        return;
      }
      
      const contentType = response.headers['content-type'] || '';
      if (!contentType.startsWith('image/')) {
        reject(new Error(`Invalid content type: ${contentType}`));
        return;
      }
      
      const fileStream = require('fs').createWriteStream(destPath);
      response.pipe(fileStream);
      
      fileStream.on('finish', () => {
        fileStream.close();
        resolve(contentType);
      });
      
      fileStream.on('error', (err) => {
        fs.unlink(destPath).catch(() => {});
        reject(err);
      });
    });
    
    request.on('error', reject);
    request.on('timeout', () => {
      request.destroy();
      reject(new Error('Download timeout'));
    });
  });
}

function getExtension(contentType, url) {
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg';
  if (contentType.includes('svg')) return 'svg';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('gif')) return 'gif';
  
  const extMatch = url.match(/\.([a-zA-Z0-9]+)(?:[\?#]|$)/);
  if (extMatch) {
    const ext = extMatch[1].toLowerCase();
    if (['png', 'jpg', 'jpeg', 'svg', 'webp', 'gif'].includes(ext)) {
      return ext;
    }
  }
  
  return 'png';
}

/**
 * Download logo from URL, falling back to SVG if download fails
 */
async function cacheLogo(channelId, name, originalUrl) {
  if (!originalUrl) {
    const filename = await generateSvgLogo(channelId, name);
    return { filename, contentType: 'image/svg+xml' };
  }
  
  const tempPath = path.join(LOGOS_DIR, `${channelId}_temp`);
  
  try {
    const contentType = await downloadFile(originalUrl, tempPath);
    const ext = getExtension(contentType, originalUrl);
    const finalFilename = `${channelId}.${ext}`;
    const finalPath = path.join(LOGOS_DIR, finalFilename);
    
    await fs.rename(tempPath, finalPath);
    return { filename: finalFilename, contentType };
  } catch (error) {
    console.warn(`Download failed for ${originalUrl}: ${error.message}. Generating SVG fallback...`);
    try {
      await fs.unlink(tempPath);
    } catch {}
    
    const filename = await generateSvgLogo(channelId, name);
    return { filename, contentType: 'image/svg+xml' };
  }
}

/**
 * Searches for and caches a channel logo. 
 * Updates the database metadata and returns the static URL path of the logo.
 */
async function resolveAndSaveLogoStatic(channelId, name, originalUrl) {
  const db = await readDb();
  let logoUrlToFetch = originalUrl || '';
  
  // If we don't have a logo, search the web!
  if (!logoUrlToFetch) {
    const searchResult = await searchWebForLogo(name);
    if (searchResult) {
      logoUrlToFetch = searchResult;
    }
  }
  
  // Cache the logo
  const result = await cacheLogo(channelId, name, logoUrlToFetch);
  
  // Update DB metadata
  db.logoMetadata[channelId] = {
    filename: result.filename,
    contentType: result.contentType,
    lastChecked: Date.now(),
    originalUrl: logoUrlToFetch
  };
  
  await writeDb(db);
  
  // Return the static local URL path
  return `/api/logos/${result.filename}`;
}

/**
 * Scheduled background sweep to check for logo updates every 3 days.
 * Does not block server API calls or render dynamic lookups.
 */
async function revalidateExpiredLogosBackground(channels) {
  console.log('Background logo revalidation sequence starting...');
  const db = await readDb();
  const cacheDurationMs = (db.settings.cacheDurationDays || 3) * 24 * 60 * 60 * 1000;
  const now = Date.now();
  let updated = false;

  for (const channel of channels) {
    const meta = db.logoMetadata[channel.id];
    let needsRevalidation = false;

    if (!meta) {
      needsRevalidation = true;
    } else {
      const fileExists = await fs.access(path.join(LOGOS_DIR, meta.filename)).then(() => true).catch(() => false);
      if (!fileExists || (now - meta.lastChecked > cacheDurationMs)) {
        needsRevalidation = true;
      }
    }

    if (needsRevalidation) {
      try {
        let originalUrl = meta ? meta.originalUrl : channel.logo;
        
        // If it's a fallback local logo or empty, try web search again
        if (!originalUrl || originalUrl.startsWith('/api/logos/')) {
          originalUrl = await searchWebForLogo(channel.name) || '';
        }

        const result = await cacheLogo(channel.id, channel.name, originalUrl);
        
        // Update database metadata
        db.logoMetadata[channel.id] = {
          filename: result.filename,
          contentType: result.contentType,
          lastChecked: now,
          originalUrl: originalUrl
        };

        // Find the channel in db and update its logo pointer
        const dbChannel = db.channels.find(c => c.id === channel.id);
        if (dbChannel) {
          dbChannel.logo = `/api/logos/${result.filename}`;
        }
        
        updated = true;
        
        if (originalUrl) {
          // Sleep briefly to avoid rate limits
          await new Promise(r => setTimeout(r, 350));
        }
      } catch (err) {
        console.error(`Background revalidation failed for ${channel.name}:`, err.message);
      }
    }
  }

  if (updated) {
    await writeDb(db);
    console.log('Background logo revalidation completed. Database updated.');
  } else {
    console.log('Background logo revalidation completed. No updates required.');
  }
}

module.exports = {
  initCacheDirs,
  resolveAndSaveLogoStatic,
  revalidateExpiredLogosBackground,
  readDb,
  writeDb,
  LOGOS_DIR
};
