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
  let linkCounter = 1;
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
    if (
      elements.length === 1 &&
      elements[0].textRun?.textStyle?.link?.url &&
      elements[0].textRun?.content?.trim()
    ) {
      return true;
    }
    return false;
  }

  for (const element of content) {
    const para = element.paragraph;
    if (!para) continue;

    const text = para.elements.map(e => e.textRun?.content || "").join("");
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
      } else if (isFullParagraphLink(para)) {
        const url = para.elements[0].textRun.textStyle.link.url;
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
        // Handle inline links
        let hasLinks = false;
        let finalText = "";
        let links = [];

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

        if (hasLinks) {
          currentSection.content.push({
            type: "paragraph",
            data: finalText.trim(),
            links
          });
        } else {
          currentSection.content.push({
            type: "paragraph",
            data: text.trim()
          });
        }
      }
    }
  }

  if (currentSection) {
    result.body.push(currentSection);
  }

  return result;
}
