const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

class GitHelper {
  constructor(repoUrl = null, name = 'automation-bot', email = 'automation-bot@local') {
    this.repoUrl = repoUrl;
    this.repoPath = null;
    this.name = name;
    this.email = email;
    this.isLocal = !repoUrl;
  }

  init() {
    if (this.isLocal) {
      // Get the root of the local git repo
      const rootPath = execSync('git rev-parse --show-toplevel', {
        cwd: process.cwd(),
        encoding: 'utf-8',
      }).trim();
  
      this.repoPath = rootPath;
      return this.repoPath;
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-clone-'));
    this.repoPath = tempDir;

    console.log(`Cloning ${this.repoUrl} into ${this.repoPath}...`);
    this.run(`clone ${this.repoUrl} ${this.repoPath}`, process.cwd());

    return this.repoPath;
  }

  run(cmd, cwd = this.repoPath) {
    if (!cwd) throw new Error('Repository path not set. Call init() first.');
    return execSync(`git ${cmd}`, { cwd );
  }

  hasChanges(dir = '') {
    const cwd = path.join(this.repoPath, dir);
    
    try {
      const output = this.run('status --porcelain', cwd);
      const status = output.toString().trim();
      const changedTrackedFiles = status
        .split('\n')
        .filter(line => line && !line.startsWith('??'));

      return changedTrackedFiles.length > 0;
    } catch (err) {
      console.error('❌ Failed to check for Git changes:', err.message);
      return false;
    }
  }

  commitAndPush(message, dir = '') {
    const cwd = path.join(this.repoPath, dir);

    this.run(`config user.name "${this.name}"`);
    this.run(`config user.email "${this.email}"`);
    this.run('add .');

    try {
      this.run(`commit -m "${message}"`);
    } catch {
      console.log('ℹ️ No changes to commit.');
      return;
    }

    this.run('push');
  }
}

module.exports = GitHelper;
