const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { getBlogPostsJson } = require('./read-posts');

(async () => {
  const posts = await getBlogPostsJson();
  const jsonOutput = JSON.stringify(posts, null, 2);

  const outputPath = path.join(__dirname, '..', 'blog', 'posts.json');
  fs.writeFileSync(outputPath, jsonOutput);
  console.log('✅ blog/posts.json updated.');

  try {
    execSync('git config user.name "github-actions[bot]"');
    execSync('git config user.email "github-actions[bot]@users.noreply.github.com"');
    execSync(`git add ${outputPath}`);

    const status = execSync('git status --porcelain').toString();
    if (status.trim()) {
      execSync('git commit -m "Update blog/posts.json from Google Docs"');
      execSync('git push');
      console.log('✅ Changes committed and pushed.');
    } else {
      console.log('ℹ️ No changes to commit.');
    }
  } catch (err) {
    console.error('❌ Git operation failed:', err.message);
    process.exit(1);
  }
})();
