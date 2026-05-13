// GitHub repository extractor. Runs as a content script via chrome.scripting.
// Pulls owner/repo from the URL, description and topics from the page DOM,
// and stars/forks/language/license/updated from the unauthenticated GitHub
// REST API. The README is fetched as raw markdown via the API so embedded
// images survive — relative image paths get rewritten to absolute
// raw.githubusercontent.com URLs so Obsidian can render them inline. If
// the API call fails (rate limit / offline) the README falls back to a
// DOM walk that also preserves <img> tags.

(async () => {
  const parts = location.pathname.split("/").filter(Boolean);
  const owner = parts[0] || "";
  const repo = parts[1] || "";

  function metaContent(name) {
    return (
      document.querySelector(`meta[property="${name}"]`)?.content ||
      document.querySelector(`meta[name="${name}"]`)?.content ||
      ""
    );
  }

  function extractDescription() {
    const og = metaContent("og:description");
    if (og) return og.trim();
    const aboutP = document.querySelector('[data-pjax="#repo-content-pjax-container"] p.f4');
    return (aboutP?.textContent || "").trim();
  }

  function extractTopics() {
    let nodes = document.querySelectorAll('[data-octo-click="topic_click"]');
    if (nodes.length === 0) {
      nodes = document.querySelectorAll('a.topic-tag[href*="/topics/"]');
    }
    if (nodes.length === 0) {
      nodes = document.querySelectorAll('a[href*="/topics/"]');
    }
    return [...nodes]
      .map((a) => a.textContent.trim())
      .filter(Boolean)
      .join(", ");
  }

  // Rewrite README image URLs to absolute raw.githubusercontent.com paths
  // so Obsidian can resolve them. Handles both markdown image syntax
  // `![alt](src)` and raw `<img src="...">` tags (READMEs commonly mix
  // both). URLs that are already absolute, protocol-relative, data:, or
  // GitHub's own anti-tracking camo proxy are passed through unchanged.
  function absolutizeImages(md, owner, repo, branch) {
    if (!md || !owner || !repo || !branch) return md;
    const rawBase = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/`;
    const isAbsolute = (s) =>
      /^(https?:)?\/\//i.test(s) || s.startsWith("data:") || s.startsWith("#");
    const join = (src) => rawBase + src.replace(/^\.?\/+/, "").replace(/^\/+/, "");

    md = md.replace(/(!\[[^\]]*\]\()([^)\s]+)([^)]*\))/g, (full, pre, src, post) =>
      isAbsolute(src) ? full : `${pre}${join(src)}${post}`,
    );
    md = md.replace(/(<img\b[^>]*?\bsrc\s*=\s*)("|')([^"']+)\2/gi, (full, pre, q, src) =>
      isAbsolute(src) ? full : `${pre}${q}${join(src)}${q}`,
    );
    return md;
  }

  // DOM-walk fallback for when the API readme fetch fails. Preserves
  // headings, paragraphs, lists, code blocks, links, and images — the
  // previous innerText approach dropped images entirely.
  function extractReadmeFromDom() {
    const root = document.querySelector('article.markdown-body[itemprop="text"]')
      || document.querySelector("article.markdown-body");
    if (!root) return "";

    function walk(node) {
      if (node.nodeType === 3) return node.textContent;
      if (node.nodeType !== 1) return "";
      const tag = node.tagName.toLowerCase();
      if (["script", "style", "noscript"].includes(tag)) return "";
      const children = [...node.childNodes].map(walk).join("");
      switch (tag) {
        case "h1": return `\n\n# ${node.textContent.trim()}\n\n`;
        case "h2": return `\n\n## ${node.textContent.trim()}\n\n`;
        case "h3": return `\n\n### ${node.textContent.trim()}\n\n`;
        case "h4": return `\n\n#### ${node.textContent.trim()}\n\n`;
        case "h5":
        case "h6": return `\n\n##### ${node.textContent.trim()}\n\n`;
        case "p":  return `\n\n${children.trim()}\n\n`;
        case "br": return "\n";
        case "strong":
        case "b":  return `**${children.trim()}**`;
        case "em":
        case "i":  return `*${children.trim()}*`;
        case "code": return `\`${node.textContent}\``;
        case "pre": return `\n\n\`\`\`\n${node.textContent}\n\`\`\`\n\n`;
        case "blockquote": {
          const inner = children.trim().split("\n").map((l) => `> ${l}`).join("\n");
          return `\n\n${inner}\n\n`;
        }
        case "img": {
          const src = node.getAttribute("src") || "";
          const alt = node.getAttribute("alt") || "";
          return src ? `\n\n![${alt}](${src})\n\n` : "";
        }
        case "a": {
          const href = node.getAttribute("href") || "";
          const text = node.textContent.trim();
          if (!href || !text) return text;
          return `[${text}](${href})`;
        }
        case "li": return `\n- ${children.trim()}`;
        case "ul":
        case "ol": return `\n${children}\n`;
        case "hr": return "\n\n---\n\n";
        default: return children;
      }
    }

    return walk(root).replace(/\n{3,}/g, "\n\n").trim();
  }

  async function fetchApiSummary() {
    try {
      const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        headers: { Accept: "application/vnd.github+json" },
        credentials: "omit",
      });
      if (!resp.ok) return {};
      const j = await resp.json();
      return {
        stars: j.stargazers_count != null ? String(j.stargazers_count) : "",
        forks: j.forks_count != null ? String(j.forks_count) : "",
        language: j.language || "",
        license: j.license?.name || "",
        updated: (j.updated_at || "").slice(0, 10),
        defaultBranch: j.default_branch || "",
      };
    } catch {
      return {};
    }
  }

  async function fetchReadmeRaw() {
    try {
      const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}/readme`, {
        headers: { Accept: "application/vnd.github.raw" },
        credentials: "omit",
      });
      if (!resp.ok) return "";
      return await resp.text();
    } catch {
      return "";
    }
  }

  const api = await fetchApiSummary();
  let readme = await fetchReadmeRaw();
  if (readme && api.defaultBranch) {
    readme = absolutizeImages(readme, owner, repo, api.defaultBranch);
  }
  if (!readme) {
    readme = extractReadmeFromDom();
  }
  // Cap so a huge README doesn't blow out the obsidian:// URI handler.
  // Raised from 4000 → 12000 because raw markdown is denser than the
  // previous innerText (headings, code fences, image refs all cost chars).
  const MAX = 12000;
  if (readme.length > MAX) readme = readme.slice(0, MAX).trimEnd() + "\n\n…";

  return {
    kind: "github",
    owner,
    repo,
    title: `${owner} / ${repo}`,
    description: extractDescription(),
    stars: api.stars || "",
    forks: api.forks || "",
    language: api.language || "",
    license: api.license || "",
    topics: extractTopics(),
    updated: api.updated || "",
    readme,
    url: location.href,
  };
})();
