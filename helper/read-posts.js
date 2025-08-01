const { google } = require('googleapis');
const { JWT } = require('google-auth-library');

function parseGoogleDoc(jsonData, file) {
  const result = {
    id: file.id || "",
    createdAt: file.createdTime || "",
    modifiedAt: file.modifiedTime || "",
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

  function getUrlFromPara(para) {
    for (const el of para.elements) {
      if (el.textRun?.textStyle?.link?.url) {
        return el.textRun.textStyle.link.url;
      }
    }
    return null;
  }

  for (const element of content) {
    const para = element.paragraph;
    if (!para) continue;

    const text = para.elements
      .map(e => e.textRun?.content || "")
      .join("");
    const namedStyle = para.paragraphStyle?.namedStyleType || "";

    if (text.trim() === "") continue;

    const isListItem = para.bullet || text.startsWith("●  \t");

    if (state === "metadata") {
      if (namedStyle === "TITLE" && !result.title) {
        result.title = text.trim();
      } else if (text.toLowerCase().startsWith("tags:")) {
        result.tags = text
          .substring("tags:".length)
          .split(",")
          .map(tag => tag.trim());
      } else if (getUrlFromPara(para)) {
        result.titleImage = getUrlFromPara(para);
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

    if (state === "body") {
      if (namedStyle === "HEADING_1") {
        if (currentSection) {
          result.body.push(currentSection);
        }
        currentSection = {
          heading: text.trim(),
          content: []
        };
      } else if (getUrlFromPara(para) && text.trim().split(/\s+/).length <= 3) {
        const url = getUrlFromPara(para);
        currentSection.content.push({ type: "image", data: url });
      } else if (isListItem) {
        const itemText = text.startsWith("●  \t") ? text.substring("●  \t".length).trim() : text.trim();
        if (
          currentSection.content.length &&
          currentSection.content[currentSection.content.length - 1].type === "list"
        ) {
          currentSection.content[currentSection.content.length - 1].data.push(itemText);
        } else {
          currentSection.content.push({
            type: "list",
            data: [itemText]
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

async function getBlogPostsJson() {
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
    console.warn('No Google Docs found in the folder.');
    return [];
  }

  const posts = [];

  for (const file of res.data.files) {
    const doc = await docs.documents.get({ documentId: file.id });
    const parsed = parseGoogleDoc(doc.data, file);
    posts.push(parsed);
  }

  return posts;
}

module.exports = { getBlogPostsJson };
