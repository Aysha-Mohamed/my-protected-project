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
  q: `('${folderId}' in parents and mimeType='application/vnd.google-apps.document')`,
  fields: 'files(id, name, createdTime, modifiedTime)',
});

  if (!res.data.files.length) {
    console.log('📭 No Google Docs found in the folder.');
    return;
  }

  const output = [];

  for (const file of res.data.files) {
    console.log(📄 Processing: ${file.name});

    const doc = await docs.documents.get({ documentId: file.id });
    const content = doc.data.body.content;
    console.log(JSON.stringify(doc.data.body.content, null, 2)); 

    let title = '';
    let excerpt = '';
    let tags = [];
    let titleImage = undefined;

    let seenTitle = false;
    let seenExcerpt = false;

    for (const block of content) {
      // Handle inline image (optional)
      if (block.inlineObjectElement && !titleImage) {
        const inlineId = block.inlineObjectElement.inlineObjectId;
        const inlineObj = doc.data.inlineObjects?.[inlineId];
        const sourceUri =
          inlineObj?.inlineObjectProperties?.embeddedObject?.imageProperties
            ?.contentUri;
        if (sourceUri) {
          titleImage = sourceUri;
        }
      }

      if (block.paragraph) {
        const text = block.paragraph.elements
          .map(e => e.textRun?.content || '')
          .join('')
          .trim();

        if (!seenTitle && text) {
          title = text;
          seenTitle = true;
          continue;
        }

        if (seenTitle && !seenExcerpt && text) {
          excerpt = text;
          seenExcerpt = true;
          continue;
        }

        if (text.toLowerCase().startsWith('tags:')) {
          tags = text
            .substring(5)
            .split(',')
            .map(t => t.trim())
            .filter(Boolean);
        }
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
