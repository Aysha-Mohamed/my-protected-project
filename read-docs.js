const fs = require('fs');
const { google } = require('googleapis');
const { JWT } = require('google-auth-library');

async function main() {
  const auth = new JWT({
    keyFile: 'key.json',
    scopes: [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/documents.readonly',
    ],
  });

  const drive = google.drive({ version: 'v3', auth });
  const docs = google.docs({ version: 'v1', auth });

  const folderId = '15pv_L5uzLyA5mC7jlejlj1doe21GH1WU';

  const res = await drive.files.list({
    q: `'${folderId}' in parents and mimeType='application/vnd.google-apps.document'`,
    fields: 'files(id, name, createdTime, modifiedTime)',
  });

  if (!res.data.files.length) {
    console.log('📭 No Google Docs found in the folder.');
    return;
  }

  const output = [];

  for (const file of res.data.files) {
    console.log(`📄 Processing: ${file.name}`);

    const doc = await docs.documents.get({ documentId: file.id });
    const content = doc.data.body.content;

    console.log(JSON.stringify(doc.data.body.content, null, 2));

    let title = '';
    let titleImage = '';
    let excerpt = '';
    let tags = [];

    let state = 'title'; // state flow: title -> titleImage -> excerpt -> tags

    for (const block of content) {
      if (!block.paragraph) continue;

      const text = block.paragraph.elements
        .map(e => e.textRun?.content || '')
        .join('')
        .trim();

      if (!text) continue;

      if (state === 'title') {
        title = text;
        state = 'titleImage';
        continue;
      }

      if (state === 'titleImage' && text.startsWith('http')) {
        titleImage = text;
        state = 'excerpt';
        continue;
      }

      if (state === 'excerpt') {
        excerpt = text;
        state = 'tags';
        continue;
      }

      if (state === 'tags' && text.toLowerCase().startsWith('tags:')) {
        tags = text
          .substring(5)
          .split(',')
          .map(t => t.trim())
          .filter(Boolean);
      }
    }

    const blogMeta = {
      id: file.id,
      creationDate: file.createdTime,
      updatedDate: file.modifiedTime,
      title,
      excerpt,
      tags,
    };

    if (titleImage) {
      blogMeta.titleImage = titleImage;
    }

    output.push(blogMeta);
  }

  fs.writeFileSync('docs-output.json', JSON.stringify(output, null, 2));
  console.log('\n✅ Blog metadata saved to docs-output.json');
  console.log('\n📤 Output Preview:\n');
  console.log(JSON.stringify(output, null, 2));
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
