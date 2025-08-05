const fs = require('fs');
const path = require('path');
const { getGoogleHelper } = require('./google-helper'); // Adjust path as needed

async function storeImage(fileId, outputDir) {
  if (!fileId || typeof fileId !== 'string' || !fileId.match(/^[a-zA-Z0-9_-]{25,}$/)) {
    throw new Error(`Invalid fileId: ${fileId}`);
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const destPath = path.join(outputDir, `${fileId}.png`);

  if (fs.existsSync(destPath)) {
    console.log(`ℹ️ Skipping ${fileId}, file already exists.`);
    return destPath;
  }

  const googleHelper = getGoogleHelper();

  try {
    // Use helper's downloadFileStream method to get a readable stream
    const stream = await googleHelper.downloadFileStream(fileId);

    return new Promise((resolve, reject) => {
      const dest = fs.createWriteStream(destPath);

      stream
        .on('end', () => {
          console.log(`✅ Downloaded ${fileId} to ${destPath}`);
          resolve(destPath);
        })
        .on('error', err => {
          console.error(`❌ Error downloading ${fileId}:`, err.message);
          reject(err);
        })
        .pipe(dest);
    });
  } catch (err) {
    console.error(`❌ Failed to initiate download for ${fileId}:`, err.message);
    throw err;
  }
}

function extractFileIdFromUrl(url) {
  if (typeof url !== 'string') return null;

  // matches google drive links containing '/d/<fileId>' or 'id=<fileId>'
  const match = url.match(/drive\.google\.com.*(?:\/d\/|id=)([a-zA-Z0-9_-]{25,})/);
  return match ? match[1] : null;
}

module.exports = { storeImage, extractFileIdFromUrl };
