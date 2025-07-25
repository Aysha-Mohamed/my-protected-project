const fs = require('fs');
const { google } = require('googleapis');

async function main() {
  const auth = new google.auth.GoogleAuth({
    keyFile: 'key.json',
    scopes: ['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/documents.readonly'],
  });

  const drive = google.drive({ version: 'v3', auth });
  const docs = google.docs({ version: 'v1', auth });

  const folderId = 'YOUR_FOLDER_ID_HERE';
  const res = await drive.files.list({
    q: `'${folderId}' in parents and mimeType='application/vnd.google-apps.document'`,
    fields: 'files(id, name, createdTime, modifiedTime)',
  });

  for (const file of res.data.files) {
    console.log(`\n📄 ${file.name}`);
    console.log(`Created: ${file.createdTime}`);
    console.log(`Last Modified: ${file.modifiedTime}`);

    const doc = await docs.documents.get({ documentId: file.id });
    const content = doc.data.body.content.map(el => el.paragraph?.elements?.map(e => e.textRun?.content).join('')).join('\n');
    console.log('Content:\n', content);
  }
}

main().catch(console.error);
