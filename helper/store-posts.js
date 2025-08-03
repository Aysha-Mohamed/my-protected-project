const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { getBlogPostsJson } = require('./read-posts');
const { storeImage, extractFileIdFromUrl } = require('./store-drive-image');

const HTML_RELATIVE_IMAGE_DIR = '/posts/img';

async function adjustGoogleDriveImageLinks(posts) {
  const imgDir = path.join(__dirname, '..', 'blog', 'img');

  for (const post of posts) {
    // Process titleImage if it's a Google Drive URL
    const titleFileId = extractFileIdFromUrl(post.titleImage);
    if (titleFileId) {
      const localPath = `${HTML_RELATIVE_IMAGE_DIR}/${titleFileId}.png`;
      const localFullPath = path.join(imgDir, `${titleFileId}.png`);
      await storeImage(titleFileId, imgDir);
      post.titleImage = localPath;
    }

    // Process images in the body content
    for (const section of post.body) {
      for (const content of section.content) {
        if (content.type !== 'image' || typeof content.data !== 'string') {
          continue;
        }

        const imageFileId = extractFileIdFromUrl(content.data);
        if (imageFileId) {
          const localPath = `${HTML_RELATIVE_IMAGE_DIR}/${imageFileId}.png`;
          const localFullPath = path.join(imgDir, `${imageFileId}.png`);
          await storeImage(imageFileId, imgDir);
          content.data = localPath;
        }
      }
    }
  }
}

(async () => {
  let posts = await getBlogPostsJson();
  const imgDir = path.join(__dirname, '..', 'blog', 'img');

  await adjustGoogleDriveImageLinks(posts);

  // Sort new data by createdAt
  posts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const newJson = JSON.stringify(posts, null, 2);
  const outputPath = path.join(__dirname, '..', 'blog', 'posts.json');

  const fileExists = fs.existsSync(outputPath);
  const oldJson = fileExists ? fs.readFileSync(outputPath, 'utf8') : null;

  // Commit only if there's a difference
  if (newJson !== oldJson) {
    fs.writeFileSync(outputPath, newJson);
    console.log('✅ blog/posts.json updated.');

    try {
      execSync('git config user.name "github-actions[bot]"');
      execSync('git config user.email "github-actions[bot]@users.noreply.github.com"');
      execSync(`git add ${outputPath}`);
      execSync('git commit -m "Update blog/posts.json from Google Docs"');
      execSync('git push');
      console.log('✅ Changes committed and pushed.');
    } catch (err) {
      console.error('❌ Git operation failed:', err.message);
      process.exit(1);
    }
  } else {
    console.log('ℹ️ blog/posts.json is up-to-date — no changes to commit.');
  }
})();

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', err => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});
