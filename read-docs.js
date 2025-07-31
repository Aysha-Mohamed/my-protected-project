const fs = require('fs');
const { google } = require('googleapis');
const { JWT } = require('google-auth-library');

function findFirstLinkInParagraph(para) {
  if (!para || !para.elements) return null;
  for (const el of para.elements) {
    const url = el.textRun?.link?.url;
    if (url) return url;
  }
  return null;
}

function parseGoogleDoc(doc) {
  const result = {
    id: doc.documentId || "fileid",
    createdAt: doc.createdTime || "",
    modifiedAt: doc.modifiedTime || "",
    title: "",
    titleImage: "",
    excerpt: "",
    tags: [],
    body: []
  };

  const content = doc.body.content;
  let state = "metadata";
  let currentSection = null;
  const paragraphBuffer = [];

  for (const element of content) {
    const para = element.paragraph;
    if (!para) continue;

    const text = para.elements.map(e => e.textRun?.content || "").join("");
    const namedStyle = para.paragraphStyle?.namedStyleType || "";
    if (text.trim() === "") continue;

    // Find link anywhere in paragraph elements
    const url = findFirstLinkInParagraph(para);

    const isCustomListItem = text.startsWith("●  \t");

    // ===== METADATA =====
    if (state === "metadata") {
      if (namedStyle === "TITLE" && !result.title) {
        result.title = text.trim();
      } else if (text.toLowerCase().startsWith("tags:")) {
        result.tags = text.substring("tags:".length).split(",").map(t => t.trim());
      } else if (url) {
        result.titleImage = url;
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

    // ===== BODY =====
    else if (state === "body") {
      if (namedStyle === "HEADING_1") {
        if (currentSection) {
          result.body.push(currentSection);
        }
        currentSection = {
          heading: text.trim(),
          content: []
        };
      } else if (
        url &&
        text.trim().split(/\s+/).length <= 3
      ) {
        currentSection.content.push({ type: "image", data: url });
      } else if (para.bullet || isCustomListItem) {
        // List item handling
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

  const folderId = 'YOUR_FOLDER_ID_HERE';

  const res = await drive.files.list({
    q: `('${folderId}' in parents and mimeType='application/vnd.google-apps.document')`,
    fields: 'files(id, name, createdTime, modifiedTime)',
  });

  if (!res.data.files.length) {
    console.log('No Google Docs found in the folder.');
    return;
  }

  for (const file of res.data.files) {
    console.log(`📄 Processing: ${file.name}`);

    const doc = await docs.documents.get({ documentId: file.id });
    // Inject metadata timestamps into doc object for parsing
    doc.data.documentId = file.id;
    doc.data.createdTime = file.createdTime;
    doc.data.modifiedTime = file.modifiedTime;

    const parsed = parseGoogleDoc(doc.data);
    console.log(JSON.stringify(parsed, null, 2));
  }
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
