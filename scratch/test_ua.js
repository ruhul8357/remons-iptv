const https = require('https');

function fetchJson(url, headers) {
  return new Promise((resolve, reject) => {
    const options = {
      timeout: 8000,
      headers: headers
    };
    https.get(url, options, (res) => {
      console.log(`URL: ${url}`);
      console.log(`Status: ${res.statusCode}`);
      console.log(`Headers: ${JSON.stringify(res.headers)}`);
      
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode === 200) {
            resolve(JSON.parse(body));
          } else {
            resolve({ error: `Status ${res.statusCode}`, body });
          }
        } catch (e) {
          resolve({ error: 'JSON Parse Error', body });
        }
      });
    }).on('error', reject);
  });
}

async function test() {
  const query = 'Zee Bangla';
  const urlWithOrigin = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*`;
  const urlWithoutOrigin = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json`;
  
  const userAgents = [
    {
      name: 'Custom Compliant UA',
      headers: {
        'User-Agent': 'NebulaIPTV/1.0 (contact@nebula-iptv.org; http://nebula-iptv.org)'
      }
    },
    {
      name: 'Standard Chrome UA',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    },
    {
      name: 'Minimal Descriptive UA',
      headers: {
        'User-Agent': 'IPTVPlayerBot/1.0 (info@iptvplayer.com)'
      }
    }
  ];

  for (const ua of userAgents) {
    console.log(`\n--- Testing UA: ${ua.name} ---`);
    console.log('Testing with origin=* ...');
    const res1 = await fetchJson(urlWithOrigin, ua.headers);
    console.log('Result length/error:', res1.error || JSON.stringify(res1).slice(0, 100));

    console.log('Testing without origin=* ...');
    const res2 = await fetchJson(urlWithoutOrigin, ua.headers);
    console.log('Result length/error:', res2.error || JSON.stringify(res2).slice(0, 100));
    
    await new Promise(r => setTimeout(r, 1000));
  }
}

test();
