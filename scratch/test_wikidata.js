const https = require('https');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const options = {
      timeout: 8000,
      headers: {
        'User-Agent': 'IPTVPlayerBot/1.0 (info@iptvplayer.com)'
      }
    };
    https.get(url, options, (res) => {
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

async function getWikidataLogo(pageTitle) {
  try {
    // 1. Get Wikidata item ID (QID) for the Wikipedia page
    const wpUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=pageprops&ppprop=wikibase_item&titles=${encodeURIComponent(pageTitle)}&format=json&origin=*`;
    const wpRes = await fetchJson(wpUrl);
    
    if (!wpRes.query || !wpRes.query.pages) return null;
    const pages = wpRes.query.pages;
    const pageId = Object.keys(pages)[0];
    if (pageId === '-1') return null;
    
    const qid = pages[pageId].pageprops && pages[pageId].pageprops.wikibase_item;
    if (!qid) {
      console.log(`No Wikidata ID found for Wikipedia page: "${pageTitle}"`);
      return null;
    }
    console.log(`Wikidata QID for "${pageTitle}": ${qid}`);

    // 2. Get claims for the QID from Wikidata
    const wdUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qid}&props=claims&format=json&origin=*`;
    const wdRes = await fetchJson(wdUrl);
    
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
        console.log(`Fallback to general image (P18) for "${pageTitle}": ${logoFilename}`);
      }
    }
    
    if (!logoFilename) {
      console.log(`No logo (P154) or image (P18) claims found on Wikidata for QID: ${qid}`);
      return null;
    }

    // 3. Resolve Wikimedia Commons file URL
    const commonsUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=File:${encodeURIComponent(logoFilename)}&prop=imageinfo&iiprop=url&format=json&origin=*`;
    const commonsRes = await fetchJson(commonsUrl);
    
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
    console.error(`Wikidata lookup failed for page "${pageTitle}":`, err.message);
    return null;
  }
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
    
    // First try Wikidata
    const wikidataLogo = await getWikidataLogo(pageTitle);
    if (wikidataLogo) {
      return wikidataLogo;
    }
    
    // Fallback to PageImages
    const imageUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&piprop=original&titles=${encodeURIComponent(pageTitle)}&format=json&origin=*`;
    const imageResult = await fetchJson(imageUrl);
    
    if (imageResult.query && imageResult.query.pages) {
      const pages = imageResult.query.pages;
      const pageId = Object.keys(pages)[0];
      
      if (pageId && pages[pageId].original && pages[pageId].original.source) {
        console.log(`Fallback PageImage URL: ${pages[pageId].original.source}`);
        return pages[pageId].original.source;
      }
    }
    
    return null;
  } catch (err) {
    console.error(`Wikipedia search failed for "${channelName}":`, err.message);
    return null;
  }
}

async function test() {
  const channels = ['ESPN', 'Zee Bangla', 'Somoy TV', 'T Sports', 'NASA TV', 'Fox Sports', 'Cartoon Network'];
  for (const channel of channels) {
    console.log(`\n=================== Testing: ${channel} ===================`);
    const logoUrl = await searchWikipediaForLogo(channel);
    console.log(`Resulting Logo URL: ${logoUrl}`);
    await new Promise(r => setTimeout(r, 1000));
  }
}

test();
