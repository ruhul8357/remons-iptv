const fs = require('fs').promises;
const path = require('path');

const DB_FILE = path.join(__dirname, '..', 'data', 'db.json');

async function test() {
  const data = await fs.readFile(DB_FILE, 'utf8');
  const db = JSON.parse(data);
  
  console.log('Searching for "tc" (case-insensitive):');
  const matches1 = db.channels.filter(c => c.name.toLowerCase().includes('tc'));
  matches1.forEach(c => console.log(`- Name: "${c.name}", ID: "${c.id}", Logo: "${c.logo}"`));
  
  console.log('\nSearching for "tyc" (case-insensitive):');
  const matches2 = db.channels.filter(c => c.name.toLowerCase().includes('tyc'));
  matches2.forEach(c => console.log(`- Name: "${c.name}", ID: "${c.id}", Logo: "${c.logo}"`));
}

test();
