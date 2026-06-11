const https = require('https');
const fs = require('fs');
const path = require('path');

function downloadFile(url, destPath, ua) {
  return new Promise((resolve, reject) => {
    const options = {
      timeout: 10000,
      headers: {
        'User-Agent': ua
      }
    };
    
    https.get(url, options, (response) => {
      console.log(`URL: ${url}`);
      console.log(`Status Code: ${response.statusCode}`);
      console.log(`Content-Type: ${response.headers['content-type']}`);
      
      if (response.statusCode === 301 || response.statusCode === 302) {
        console.log(`Redirecting to: ${response.headers.location}`);
        downloadFile(response.headers.location, destPath, ua).then(resolve).catch(reject);
        return;
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: Status Code ${response.statusCode}`));
        return;
      }
      
      const fileStream = fs.createWriteStream(destPath);
      response.pipe(fileStream);
      
      fileStream.on('finish', () => {
        fileStream.close();
        resolve();
      });
    }).on('error', reject);
  });
}

async function test() {
  const url = 'https://upload.wikimedia.org/wikipedia/commons/3/38/FS2_logo_2015.svg';
  const destPath = path.join(__dirname, 'test_logo.svg');
  
  const uas = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'IPTVPlayerBot/1.0 (info@iptvplayer.com)'
  ];
  
  for (const ua of uas) {
    console.log(`\nTesting UA: ${ua}`);
    try {
      await downloadFile(url, destPath, ua);
      console.log('Download SUCCESS!');
      fs.unlinkSync(destPath);
    } catch (err) {
      console.log(`Download FAILED: ${err.message}`);
    }
  }
}

test();
