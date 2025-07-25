const fs = require('fs');
const { google } = require('googleapis');

async function main() {
  const auth = new google.auth.GoogleAuth({
    keyFile: 'key.json', // This file is created by your GitHub Action
    scopes: [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/documents.readonly'
    ]
  });

  const drive = google.drive({ version: 'v3', auth });
  const docs = google.docs({ version: 'v1', auth });

  const folderId = '15pv_L5uzLyA5mC7jlejlj1doe21GH1WU';

  console.log(`🔍 Fetching Google Docs from folder: ${folderId}`);

  const res = await drive.files.list({
    q: `'${folderId}' in parents and mimeType='application/vnd.google-apps.document'`,
    fields: 'files(id, name, createdTime, modifiedTime)'
  });

  if (!res.data.files.length) {
    console.log('📭 No Google Docs found in the folder.');
    return;
  }

  const output = [];

  for (const file of res.data.files) {
    console.log(`\n📄 ${file.name}`);
    console.log(`🗓️  Created: ${file.createdTime}`);
    console.log(`📝 Last Modified: ${file.modifiedTime}`);

    const doc = await docs.documents.get({ documentId: file.id });

    const content = doc.data.body.content
      .map(el =>
        el.paragraph?.elements?.map(e => e.textRun?.content).join('')
      )
      .filter(Boolean)
      .join('\n');

    console.log('📘 Content:');
    console.log(content.trim());

    output.push({
      id: file.id,
      name: file.name,
      created: file.createdTime,
      modified: file.modifiedTime,
      content: content.trim()
    });
  }

  fs.writeFileSync('docs-output.json', JSON.stringify(output, null, 2));
  console.log('\n✅ All document data written to docs-output.json');
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
