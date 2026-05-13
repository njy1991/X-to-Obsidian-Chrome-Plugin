// Twitter / X.com tweet extractor. Runs as a content script via chrome.scripting.
// Walks the focused tweet's article in document order so text blocks and media
// appear in the same sequence as the original post.

(() => {
  const TWEET_BLOCK_SELECTOR = [
    '[data-testid="tweetText"]',
    '[data-testid="tweetPhoto"]',
    '[data-testid="videoPlayer"]',
    '[data-testid="card.wrapper"]',
  ].join(",");

  function findFocusedArticle() {
    const articles = document.querySelectorAll('article[data-testid="tweet"]');
    if (articles.length === 0) return null;
    const path = location.pathname;
    for (const a of articles) {
      const links = a.querySelectorAll('a[href*="/status/"]');
      for (const l of links) {
        const href = l.getAttribute("href") || "";
        if (href === path || href.endsWith(path)) return a;
      }
    }
    return articles[0];
  }

  function renderTextBlock(el) {
    const parts = [];
    el.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        parts.push(node.textContent);
      } else if (node.nodeName === "BR") {
        parts.push("\n");
      } else if (node.nodeName === "IMG") {
        parts.push(node.getAttribute("alt") || "");
      } else if (node.nodeName === "A") {
        const href = node.getAttribute("href") || "";
        const text = node.textContent || "";
        if (href.startsWith("/") || href.startsWith("http")) {
          const url = href.startsWith("/") ? `https://x.com${href}` : href;
          parts.push(text.startsWith("@") || text.startsWith("#") ? text : `[${text}](${url})`);
        } else {
          parts.push(text);
        }
      } else {
        parts.push(node.textContent || "");
      }
    });
    return parts.join("").trim();
  }

  function renderPhotoBlock(el) {
    const img = el.querySelector("img");
    const src = img?.src || "";
    const alt = img?.getAttribute("alt") || "";
    return src ? `![${alt}](${src})` : "";
  }

  function renderVideoBlock(el) {
    // Obsidian can't play X.com video inline — use the poster as a still.
    const video = el.querySelector("video");
    const poster = video?.getAttribute("poster") || "";
    return poster ? `![](${poster})` : "";
  }

  function renderCardBlock(el) {
    const a = el.querySelector("a[href]");
    const href = a?.href || "";
    if (!href) return "";
    const title = el.querySelector('[data-testid^="card.layoutLarge.detail"]')?.innerText
      || el.querySelector('[data-testid="card.layoutSmall.detail"]')?.innerText
      || a?.innerText
      || href;
    return `[${(title || href).trim()}](${href})`;
  }

  function renderBlock(el) {
    const testid = el.getAttribute("data-testid") || "";
    if (testid === "tweetText") return renderTextBlock(el);
    if (testid === "tweetPhoto") return renderPhotoBlock(el);
    if (testid === "videoPlayer") return renderVideoBlock(el);
    if (testid === "card.wrapper") return renderCardBlock(el);
    return "";
  }

  function extractContent(article) {
    // querySelectorAll returns matches in document order — that's the original
    // post order. Drop blocks nested inside another match (e.g. a photo whose
    // <img> is also a descendant of a card.wrapper).
    const blocks = [...article.querySelectorAll(TWEET_BLOCK_SELECTOR)];
    const top = blocks.filter(
      (b) => !blocks.some((p) => p !== b && p.contains(b)),
    );
    return top
      .map(renderBlock)
      .filter(Boolean)
      .join("\n\n");
  }

  function renderInlineNodes(el) {
    // Walk inline children preserving links, BRs, and inline images. Used for
    // article paragraphs and list items where the body isn't a tweetText block.
    const parts = [];
    el.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        parts.push(node.textContent);
      } else if (node.nodeName === "BR") {
        parts.push("\n");
      } else if (node.nodeName === "IMG") {
        const src = node.getAttribute("src") || "";
        const alt = node.getAttribute("alt") || "";
        if (src && !src.startsWith("data:")) parts.push(`![${alt}](${src})`);
        else parts.push(alt);
      } else if (node.nodeName === "A") {
        const href = node.getAttribute("href") || "";
        const text = node.textContent || "";
        if (href.startsWith("/") || href.startsWith("http")) {
          const url = href.startsWith("/") ? `https://x.com${href}` : href;
          parts.push(text.startsWith("@") || text.startsWith("#") ? text : `[${text}](${url})`);
        } else {
          parts.push(text);
        }
      } else {
        parts.push(renderInlineNodes(node));
      }
    });
    return parts.join("").trim();
  }

  function renderArticleBlock(el) {
    const testid = el.getAttribute("data-testid") || "";
    if (testid === "tweetPhoto") return renderPhotoBlock(el);
    if (testid === "videoPlayer") return renderVideoBlock(el);
    const tag = el.tagName.toLowerCase();
    if (tag === "h1") return "# " + (el.innerText || "").trim();
    if (tag === "h2") return "## " + (el.innerText || "").trim();
    if (tag === "h3") return "### " + (el.innerText || "").trim();
    if (tag === "h4") return "#### " + (el.innerText || "").trim();
    if (tag === "h5") return "##### " + (el.innerText || "").trim();
    if (tag === "h6") return "###### " + (el.innerText || "").trim();
    if (tag === "ul" || tag === "ol") {
      const prefix = tag === "ol" ? (i) => `${i + 1}. ` : () => "- ";
      const items = [...el.querySelectorAll(":scope > li")];
      return items
        .map((li, i) => {
          const inline = renderInlineNodes(li);
          return inline ? prefix(i) + inline : "";
        })
        .filter(Boolean)
        .join("\n");
    }
    if (tag === "li") {
      return "- " + renderInlineNodes(el);
    }
    return renderInlineNodes(el);
  }

  function extractArticleContent(titleEl) {
    // X long-form Articles render the body in [data-testid="twitterArticleRichTextView"]
    // (the cover image lives one level up in [data-testid="twitterArticleReadView"],
    // outside that body). Body paragraphs are Draft.js <div> blocks with class
    // .public-DraftStyleDefault-block or .longform-unstyled — NOT <p> tags — which
    // is why the previous TWEET_BLOCK_SELECTOR picked up only the cover image.
    const readView = document.querySelector('[data-testid="twitterArticleReadView"]');
    const richTextView = document.querySelector('[data-testid="twitterArticleRichTextView"]');
    const out = [];

    if (readView) {
      const cover = readView.querySelector('[data-testid="tweetPhoto"]');
      if (cover && !richTextView?.contains(cover)) {
        const md = renderPhotoBlock(cover);
        if (md) out.push(md);
      }
    }

    if (richTextView) {
      const candidates = [
        ...richTextView.querySelectorAll(
          'h1, h2, h3, h4, h5, h6, ul, ol, ' +
            ".public-DraftStyleDefault-block, .longform-unstyled, " +
            '[data-testid="tweetPhoto"], [data-testid="videoPlayer"]',
        ),
      ];
      const filtered = candidates.filter((b) => {
        if (b === titleEl) return false;
        return !candidates.some((p) => p !== b && p.contains(b));
      });
      for (const el of filtered) {
        const md = renderArticleBlock(el);
        if (md) out.push(md);
      }
    }

    return out.join("\n\n");
  }

  function extractAuthor(article) {
    const userName = article.querySelector('[data-testid="User-Name"]');
    if (!userName) return { name: "", handle: "" };
    const spans = userName.querySelectorAll("span");
    let name = "";
    let handle = "";
    spans.forEach((s) => {
      const t = s.textContent.trim();
      if (!handle && t.startsWith("@")) handle = t;
      else if (!name && t && !t.startsWith("@") && t !== "·") name = t;
    });
    return { name, handle };
  }

  function extractTimestamp(article) {
    const time = article.querySelector("time");
    return time?.getAttribute("datetime") || "";
  }

  function extractId() {
    const m = location.pathname.match(/\/status\/(\d+)/);
    return m ? m[1] : "";
  }

  function findArticleTitleEl(article) {
    return (
      article?.querySelector('[data-testid="twitter-article-title"]') ||
      document.querySelector('[data-testid="twitter-article-title"]') ||
      null
    );
  }

  function extractArticleTitle(titleEl) {
    // X long-form "Articles" expose the headline at this testid. When present
    // it's the canonical title and beats any heuristic over the post body.
    return (titleEl?.innerText || titleEl?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function buildTitle(author, content, articleTitle) {
    // Filename → Obsidian note title. Prefer the explicit X-article headline
    // when the page is a long-form Article; otherwise use the first line of
    // the post itself; fall back to the author for image- or video-only posts.
    if (articleTitle) return articleTitle.slice(0, 80).trim();
    const firstLine = content
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length > 0) || "";
    const snippet = firstLine.replace(/\s+/g, " ").slice(0, 80).trim();
    if (snippet) return snippet;
    return author.name || author.handle || "Tweet";
  }

  const article = findFocusedArticle();
  if (!article) {
    return {
      title: document.title,
      author: "",
      content: "Could not locate tweet on this page.",
      posted: "",
      id: extractId(),
      url: location.href,
    };
  }

  const author = extractAuthor(article);
  const articleTitleEl = findArticleTitleEl(article);
  const articleTitle = extractArticleTitle(articleTitleEl);
  const isLongFormArticle = !!document.querySelector(
    '[data-testid="twitterArticleRichTextView"]',
  );
  const content = isLongFormArticle
    ? extractArticleContent(articleTitleEl)
    : extractContent(article);

  return {
    title: buildTitle(author, content, articleTitle),
    author: `${author.name} ${author.handle}`.trim(),
    content,
    posted: extractTimestamp(article),
    id: extractId(),
    url: location.href,
  };
})();
