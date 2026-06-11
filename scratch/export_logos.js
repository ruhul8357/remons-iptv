const fs = require('fs').promises;
const path = require('path');

const DB_FILE = path.join(__dirname, '..', 'data', 'db.json');
const LOGOS_DIR = path.join(__dirname, '..', 'data', 'logos');
const EXPORT_DIR = path.resolve(__dirname, '..', '..', 'channel_logos');

function slugifyName(text) {
  return text
    .toString()
    .trim()
    .replace(/[^a-zA-Z0-9\s-]/g, '') // Remove special chars
    .replace(/\s+/g, '_');          // Replace spaces with underscores
}

async function exportLogos() {
  try {
    // 1. Create export folder
    await fs.mkdir(EXPORT_DIR, { recursive: true });
    console.log(`Export directory created/verified: ${EXPORT_DIR}`);

    // 2. Read db.json
    const dbData = await fs.readFile(DB_FILE, 'utf8');
    const db = JSON.parse(dbData);
    
    if (!db.channels || db.channels.length === 0) {
      console.error('No channels found in db.json. Make sure the server has finished preloading.');
      return;
    }

    console.log(`Found ${db.channels.length} channels in database.`);

    const reportLines = [
      '# Channel Logo Export Index',
      '',
      `Exported: ${new Date().toLocaleString()}`,
      `Total Channels: ${db.channels.length}`,
      '',
      '| Channel Name | Logo Filename | Source Type | Original Web URL |',
      '| --- | --- | --- | --- |'
    ];

    let copiedCount = 0;
    let fallbackCount = 0;

    for (const channel of db.channels) {
      const metadata = db.logoMetadata[channel.id];
      if (!metadata) {
        console.warn(`No metadata found for channel: "${channel.name}" (ID: ${channel.id})`);
        reportLines.push(`| ${channel.name} | *Not resolved* | N/A | N/A |`);
        continue;
      }

      const sourceFile = path.join(LOGOS_DIR, metadata.filename);
      const ext = path.extname(metadata.filename);
      
      // Clean and slugify the channel name for the new file
      const cleanFileName = `${slugifyName(channel.name)}${ext}`;
      const destFile = path.join(EXPORT_DIR, cleanFileName);

      try {
        // Verify source file exists
        await fs.access(sourceFile);
        
        // Copy the file to the export folder
        await fs.copyFile(sourceFile, destFile);
        copiedCount++;

        const isFallback = metadata.contentType === 'image/svg+xml' && (!metadata.originalUrl || metadata.originalUrl.startsWith('/api/logos/'));
        if (isFallback) fallbackCount++;

        const sourceType = isFallback ? 'Generated SVG Fallback' : 'Downloaded Web Logo';
        const originalUrl = metadata.originalUrl || 'N/A';

        reportLines.push(`| ${channel.name} | [${cleanFileName}](file:///${destFile.replace(/\\/g, '/')}) | ${sourceType} | ${originalUrl} |`);
      } catch (err) {
        console.error(`Failed to copy logo for "${channel.name}" from ${sourceFile}:`, err.message);
        reportLines.push(`| ${channel.name} | *Missing cached file (${metadata.filename})* | N/A | N/A |`);
      }
    }

    // Write index markdown file
    const reportPath = path.join(EXPORT_DIR, 'index.md');
    await fs.writeFile(reportPath, reportLines.join('\n'), 'utf8');

    console.log('\n=========================================');
    console.log(' Export Completed Successfully!');
    console.log(` Total Copied: ${copiedCount}`);
    console.log(` Web Logos: ${copiedCount - fallbackCount}`);
    console.log(` Fallback Initials SVGs: ${fallbackCount}`);
    console.log(` Index saved to: ${reportPath}`);
    console.log('=========================================');

  } catch (err) {
    console.error('Error during logo export:', err.message);
  }
}

exportLogos();
