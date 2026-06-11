/**
 * Simple M3U Parser
 * Parses M3U playlist file content into a structured list of channels.
 */

function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')         // Replace spaces with -
    .replace(/[^\w\-]+/g, '')     // Remove all non-word chars
    .replace(/\-\-+/g, '-');      // Replace multiple - with single -
}

function generateHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

function parseM3U(content) {
  if (!content) return [];
  
  const lines = content.split(/\r?\n/);
  const channels = [];
  let currentChannel = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (line.startsWith('#EXTM3U')) {
      continue;
    }
    
    if (line.startsWith('#EXTINF:')) {
      // Parse EXTINF line
      currentChannel = {};
      
      // Extract tvg-logo
      const logoMatch = line.match(/tvg-logo="([^"]+)"/) || line.match(/logo="([^"]+)"/);
      if (logoMatch) {
        currentChannel.logo = logoMatch[1];
      } else {
        currentChannel.logo = '';
      }
      
      // Extract group-title (category)
      const groupMatch = line.match(/group-title="([^"]+)"/);
      currentChannel.group = groupMatch ? groupMatch[1] : 'General';
      
      // Extract tvg-id
      const idMatch = line.match(/tvg-id="([^"]+)"/);
      if (idMatch) {
        currentChannel.tvgId = idMatch[1];
      }
      
      // Extract channel name: it's the text after the last comma
      const commaIndex = line.lastIndexOf(',');
      if (commaIndex !== -1) {
        currentChannel.name = line.substring(commaIndex + 1).trim();
      } else {
        currentChannel.name = 'Unknown Channel';
      }
      
    } else if (line && !line.startsWith('#')) {
      // This is the URL line (if we have a currentChannel)
      if (currentChannel) {
        currentChannel.url = line;
        
        // Generate a unique, deterministic ID based on the name and url
        const slug = slugify(currentChannel.name) || 'channel';
        const hash = generateHash(currentChannel.url);
        currentChannel.id = `${slug}-${hash}`;
        
        channels.push(currentChannel);
        currentChannel = null;
      }
    }
  }
  
  return channels;
}

module.exports = {
  parseM3U
};
