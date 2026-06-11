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

async function test() {
  try {
    const data = await fetchJson('https://iptv-org.github.io/api/logos.json');
    console.log('Is Array:', Array.isArray(data));
    console.log('Length:', data.length);
    console.log('Sample item 1:', JSON.stringify(data[0]));
    console.log('Sample item 2:', JSON.stringify(data[1]));
    console.log('Sample item 3:', JSON.stringify(data[2]));
  } catch (err) {
    console.error('Error fetching IPTV-org logos:', err.message);
  }
}

test();
