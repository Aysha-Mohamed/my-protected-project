const { google } = require('googleapis');
const { JWT } = require('google-auth-library');

const NEW_DOC_COOLDOWN_MS = Number(300000 || 5 * 60 * 1000); // 5 min
const RECENT_EDIT_MS      = Number(180000|| 3  * 60 * 1000);  

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

  const content = jsonData?.body?.content || [];
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

  function isFullParagraphLink(para) {
    const elements = para.elements;
    return (
      elements.length === 1 &&
      elements[0].textRun?.textStyle?.link?.url &&
      elements[0].textRun.content?.trim() === elements[0].textRun.content
    );
  }

  function extractParagraphTextAndLinks(para) {
    let finalText = "";
    const links = [];
    let hasLinks = false;
    let linkCounter = 1;

    for (const el of para.elements) {
      const run = el.textRun;
      if (!run || !run.content) continue;

      const textSegment = run.content.replace(/\n$/, "");
      const link = run.textStyle?.link?.url;

      if (link) {
        const linkId = `link${linkCounter++}`;
        finalText += `{${linkId}}`;
        links.push({
          id: linkId,
          text: textSegment.trim(),
          url: link
        });
        hasLinks = true;
      } else {
        finalText += textSegment;
      }
    }

    return { text: finalText.trim(), links: hasLinks ? links : null };
  }

  for (const element of content) {
    const para = element.paragraph;
    if (!para) continue;

    const namedStyle = para.paragraphStyle?.namedStyleType || "";
    const rawText = para.elements.map(e => e.textRun?.content || "").join("").trim();
    if (!rawText) continue;

    const isListItem = para.bullet || rawText.startsWith("●  \t");

    if (state === "metadata") {
      if (namedStyle === "TITLE" && !result.title) {
        result.title = rawText;
      } else if (rawText.toLowerCase().startsWith("tags:")) {
        result.tags = rawText
          .substring("tags:".length)
          .split(",")
          .map(tag => tag.trim());
      } else if (getUrlFromPara(para)) {
        result.titleImage = getUrlFromPara(para);
      } else {
        paragraphBuffer.push(rawText);
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
          heading: rawText,
          content: []
        };
      } else if (isFullParagraphLink(para)) {
        const url = para.elements[0].textRun.textStyle.link.url;
        currentSection.content.push({ type: "image", data: url });
      } else if (isListItem) {
        const itemText = rawText.startsWith("●  \t") ? rawText.substring("●  \t".length).trim() : rawText;
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
        const { text, links } = extractParagraphTextAndLinks(para);
        
        // Check if this is a single {linkX} placeholder and the link text implies it's an image
        if (
          links &&
          links.length === 1 &&
          text === `{${links[0].id}}`
        ) {
          currentSection.content.push({
            type: "image",
            data: links[0].url
          });
        } else {
          const paragraphObj = { type: "paragraph", data: text };
          if (links) {
            paragraphObj.links = links;
          }
          currentSection.content.push(paragraphObj);
        }
      }
    }
  }

  if (currentSection) {
    result.body.push(currentSection);
  }

  return result;
}

// ---------------- Drive/Docs helpers & guards ----------------
function shouldProcessFile(file, nowMs) {
  const createdMs  = new Date(file.createdTime).getTime();
  const modifiedMs = new Date(file.modifiedTime).getTime();

  if (nowMs - createdMs < NEW_DOC_COOLDOWN_MS) return false; // too new
  if (nowMs - modifiedMs < RECENT_EDIT_MS) return false;      // likely being edited
  return true;
}

async function versionUnchanged(drive, fileId, beforeVersion) {
  const { data } = await drive.files.get({
    fileId,
    fields: 'version',
    supportsAllDrives: true,
  });
  return data.version === beforeVersion;
}

async function listDocFilesInFolder(drive, folderId) {
  const q = [
    `'${folderId}' in parents`,
    `mimeType = 'application/vnd.google-apps.document'`,
    `trashed = false`
  ].join(' and ');

  let files = [];
  let pageToken;
  do {
    const { data } = await drive.files.list({
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
  const nowMs = Date.now();

   // List files
  const files = await listDocFilesInFolder(drive, folderId);
  if (!files.length) {
    console.warn('No Google Docs found in the folder.');
    return [];
  }

  // Apply guards and extract
  const eligible = files.filter(f => shouldProcessFile(f, nowMs));
  const posts = [];

  for (const file of eligible) {
    try {
      const beforeVersion = file.version;

      const { data: doc } = await docs.documents.get({ documentId: file.id });
      const parsed = parseGoogleDoc(doc, file);

      // Race check: ensure it didn't change while reading
      const unchanged = await versionUnchanged(drive, file.id, beforeVersion);
      if (!unchanged) {
        console.log(`🔁 Skipped ${file.name} (${file.id}): changed during extraction.`);
        continue;
      }

      posts.push(parsed);
    } catch (e) {
      console.error(`❌ Failed parsing ${file.name} (${file.id}):`, e.message);
    }
  }

  return posts;
}

module.exports = { getBlogPostsJson };
