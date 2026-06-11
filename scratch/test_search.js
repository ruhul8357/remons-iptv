const https = require('https');
const http = require('http');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const options = {
      timeout: 8000,
      headers: {
        'User-Agent': 'IPTVPlayerBot/1.0 (info@iptvplayer.com)'
      }
    };
    client.get(url, options, (res) => {
      console.log(`JSON fetch status: ${res.statusCode} for ${url}`);
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

async function searchWikipediaForLogo(channelName) {
  try {
    // 1. Search Wikipedia for matching page title
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(channelName)}&format=json&origin=*`;
    const searchResult = await fetchJson(searchUrl);
    
    if (!searchResult.query || !searchResult.query.search || searchResult.query.search.length === 0) {
      console.log(`No Wikipedia page found for: "${channelName}"`);
      return null;
    }
    
    // Take the first matching page title
    const pageTitle = searchResult.query.search[0].title;
    console.log(`Matched Wikipedia page: "${pageTitle}"`);
    
    // 2. Query PageImages for the original image URL of that page
    const imageUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&piprop=original&titles=${encodeURIComponent(pageTitle)}&format=json&origin=*`;
    const imageResult = await fetchJson(imageUrl);
    
    if (imageResult.query && imageResult.query.pages) {
      const pages = imageResult.query.pages;
      const pageId = Object.keys(pages)[0];
      
      if (pageId && pages[pageId].original && pages[pageId].original.source) {
        return pages[pageId].original.source;
      }
    }
    
    console.log(`No original image found on Wikipedia page: "${pageTitle}"`);
    return null;
  } catch (err) {
    console.error(`Wikipedia lookup failed for "${channelName}":`, err.message);
    return null;
  }
}

async function test() {
  const channels = ['Zee Bangla', 'ESPN', 'Cartoon Network', 'NASA TV', 'Somoy TV', 'T Sports', 'Fox Sports'];
  
  for (const channel of channels) {
    console.log(`\n=================== Testing: ${channel} ===================`);
    const logoUrl = await searchWikipediaForLogo(channel);
    console.log(`Wikipedia Logo URL: ${logoUrl}`);
    // Sleep briefly to be nice to Wikipedia
    await new Promise(r => setTimeout(r, 500));
  }
}

test();
