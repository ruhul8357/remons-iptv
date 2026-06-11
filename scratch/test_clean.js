function cleanChannelName(channelName) {
  let cleanName = channelName
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

  return cleanName;
}

const testNames = [
  "Tyc Sports -  🇦🇷",
  "Tyc Sports B -  🇦🇷",
  "DSports  -  🇦🇷",
  "Caze TV -  🇧🇷",
  "Caze TV B -  🇧🇷",
  "Bein Sports  - 🇫🇷",
  "Bein Sports 2 B- 🇫🇷",
  "Fox Sports 2 -",
  "Zee Bangla",
  "Star Sports 1 B",
  "Somoy TV"
];

for (const name of testNames) {
  console.log(`Original: "${name}" -> Cleaned: "${cleanChannelName(name)}"`);
}
