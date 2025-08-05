const { google } = require('googleapis');
const { JWT } = require('google-auth-library');

class GoogleHelper {
  constructor(keyFile) {
    this.auth = new JWT({
      keyFile,
      scopes: [
        'https://www.googleapis.com/auth/drive.readonly',
        'https://www.googleapis.com/auth/documents.readonly',
      ],
    });

    this.drive = google.drive({ version: 'v3', auth: this.auth });
    this.docs = google.docs({ version: 'v1', auth: this.auth });
  }

  async listDocFilesInFolder(folderId) {
    const q = [
      `'${folderId}' in parents`,
      `mimeType = 'application/vnd.google-apps.document'`,
      `trashed = false`,
    ].join(' and ');

    let files = [];
    let pageToken;

    do {
      const { data } = await this.drive.files.list({
        q,
        pageSize: 1000,
        pageToken,
        fields: 'nextPageToken, files(id, name, createdTime, modifiedTime, version)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        corpora: 'allDrives',
      });

      files = files.concat(data.files || []);
      pageToken = data.nextPageToken;
    } while (pageToken);

    return files;
  }

  async getDocument(documentId) {
    const { data } = await this.docs.documents.get({ documentId });
    return data;
  }

  async downloadFileStream(fileId) {
    const res = await this.drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' }
    );
    return res.data; // this is a stream
  }


  async getFileVersion(fileId) {
    const { data } = await this.drive.files.get({
      fileId,
      fields: 'version',
      supportsAllDrives: true,
    });
    return data.version;
  }

  async versionUnchanged(fileId, beforeVersion) {
    const currentVersion = await this.getFileVersion(fileId);
    return currentVersion === beforeVersion;
  }
}

let instance = null;

function initGoogleHelper(keyFile = 'key.json') {
  if (!instance) {
    instance = new GoogleHelper(keyFile);
  }
  return instance;
}

function getGoogleHelper() {
  if (!instance) {
    throw new Error('GoogleHelper not initialized. Call initGoogleHelper(keyFile) first.');
  }
  return instance;
}

module.exports = { initGoogleHelper, getGoogleHelper };
