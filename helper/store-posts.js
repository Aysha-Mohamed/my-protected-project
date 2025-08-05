const fs = require('fs');
const path = require('path');
const { getBlogPostsJson } = require('./read-posts');
const { storeImage, extractFileIdFromUrl } = require('./store-drive-image');
const { initGoogleHelper } = require('./google-helper');
const GitHelper = require('./git-helper');

const HTML_RELATIVE_IMAGE_DIR = '/posts/img';

async function adjustGoogleDriveImageLinks(posts, blogDir) {
  const imgDir = path.join(blogDir, 'img');
  if (!fs.existsSync(imgDir)) {
    fs.mkdirSync(imgDir, { recursive: true });
  }

  for (const post of posts) {
    const titleFileId = extractFileIdFromUrl(post.titleImage);
    if (titleFileId) {
      const localPath = `${HTML_RELATIVE_IMAGE_DIR}/${titleFileId}.png`;
      await storeImage(titleFileId, imgDir);
      post.titleImage = localPath;
    }

    for (const section of post.body) {
      for (const content of section.content) {
        if (content.type !== 'image' || typeof content.data !== 'string') continue;

        const imageFileId = extractFileIdFromUrl(content.data);
        if (imageFileId) {
          const localPath = `${HTML_RELATIVE_IMAGE_DIR}/${imageFileId}.png`;
          await storeImage(imageFileId, imgDir);
          content.data = localPath;
        }
      }
    }
  }
}

(async () => {
  const googleHelper = initGoogleHelper();

  // You can pass a repo URL instead to work with an external repo
  const git = new GitHelper(null, 'automation-bot', 'automation-bot@local');
  const repoRoot = git.init();
  const blogDir = path.join(repoRoot, 'blog');

  let posts = await getBlogPostsJson();
  await adjustGoogleDriveImageLinks(posts, blogDir);

  posts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const newJson = JSON.stringify(posts, null, 2);
  const outputPath = path.join(blogDir, 'posts.json');

  if (git.hasChanges()) {
    fs.writeFileSync(outputPath, newJson);
    console.log('✅ blog/posts.json updated.');
    git.commitAndPush('Update blog/posts.json from Google Docs');
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
