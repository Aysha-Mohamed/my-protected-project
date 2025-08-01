const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { getBlogPostsJson } = require('./read-posts');
const { storeImage, extractFileIdFromUrl } = require('./store-drive-image');

(async () => {
  let posts = await getBlogPostsJson();
  const imgDir = path.join(__dirname, '..', 'blog', 'img');

  // TODO: replace google drive urls with local urls
  // loop through the json and for each url (of a google drive image file):
  // - extract the file id: extractFileIdFromUrl(url)
  // - download the file if it does not exist already: storeImage(fileId, imgDir)
  // - replace the google url with a local one

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
