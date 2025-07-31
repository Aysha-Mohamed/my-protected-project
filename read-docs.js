const fs = require('fs');
const { google } = require('googleapis');
const { JWT } = require('google-auth-library');

function parseGoogleDoc(jsonData) {
  const result = {
    id: "fileid", // fill in separately
    createdAt: "",
    modifiedAt: "",
    title: "",
    titleImage: "",
    excerpt: "",
    tags: [],
    body: []
  };

  const content = jsonData.body.content;
  let state = "metadata";
  let currentSection = null;
  const paragraphBuffer = [];

  for (const element of content) {
    const para = element.paragraph;
    if (!para) continue;

    const text = para.elements
      .map(e => e.textRun?.content || "")
      .join("");
    const namedStyle = para.paragraphStyle?.namedStyleType || "";

    if (text.trim() === "") continue;

    // ===== METADATA SECTION =====
    if (state === "metadata") {
      if (namedStyle === "TITLE" && !result.title) {
        result.title = text.trim();
      } else if (text.toLowerCase().startsWith("tags:")) {
        result.tags = text
          .substring("tags:".length)
          .split(",")
          .map(tag => tag.trim());
      } else if (para.elements[0].textRun?.link) {
        result.titleImage = para.elements[0].textRun.link.url;
      } else {
        paragraphBuffer.push(text.trim());
      }

      if (namedStyle === "HEADING_1") {
        if (paragraphBuffer.length) {
          result.excerpt = paragraphBuffer.join(" ");
        }
        state = "body";
      }
    }

    // ===== BODY SECTION =====
    if (state === "body") {
      if (namedStyle === "HEADING_1") {
        if (currentSection) {
          result.body.push(currentSection);
        }
        currentSection = {
          heading: text.trim(),
          content: []
        };
      } else if (
        para.elements[0].textRun?.link &&
        text.trim().split(/\s+/).length <= 3
      ) {
        const url = para.elements[0].textRun.link.url;
        currentSection.content.push({ type: "image", data: url });
      } else if (para.bullet) {
        if (
          currentSection.content.length &&
          currentSection.content[currentSection.content.length - 1].type === "list"
        ) {
          currentSection.content[currentSection.content.length - 1].data.push(text.trim());
        } else {
          currentSection.content.push({
            type: "list",
            data: [text.trim()]
          });
        }
      } else {
        currentSection.content.push({ type: "paragraph", data: text.trim() });
      }
    }
  }

  if (currentSection) {
    result.body.push(currentSection);
  }

  return result;
}

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
    console.log('No Google Docs found in the folder.');
    return;
  }

  const output = [];

  for (const file of res.data.files) {
    console.log(`📄 Processing: ${file.name}`);

    const doc = await docs.documents.get({ documentId: file.id });
    const content = doc.data.body.content;
    console.log(JSON.stringify(doc.data.body.content, null, 2));

    const v = parseGoogleDoc(doc.data);
    console.log('DEBUG', JSON.stringify(v));
  }
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
