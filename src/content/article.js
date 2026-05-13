// Generic article extractor. Lightweight heuristic: find the densest text
// container, fall back to <article> or <main>, then convert a subset of HTML
// to Markdown. Iteration 2 should swap in Mozilla Readability + Turndown.

(() => {
  function scoreElement(el) {
    if (!el || el.nodeType !== 1) return 0;
    const tag = el.tagName.toLowerCase();
    if (["script", "style", "nav", "header", "footer", "aside", "form"].includes(tag)) return -1;
    const text = el.innerText || "";
    const links = el.querySelectorAll("a").length;
    const paragraphs = el.querySelectorAll("p").length;
    const linkDensity = text.length === 0 ? 1 : Math.min(1, (links * 30) / text.length);
    return text.length * (1 - linkDensity) + paragraphs * 25;
  }

  function findBestRoot() {
    const candidates = [
      document.querySelector("article"),
      document.querySelector("main"),
      document.querySelector('[role="main"]'),
      ...document.querySelectorAll("div"),
    ].filter(Boolean);

    let best = null;
    let bestScore = 0;
    for (const el of candidates) {
      const s = scoreElement(el);
      if (s > bestScore) {
        best = el;
        bestScore = s;
      }
    }
    return best || document.body;
  }

  function escapeMd(text) {
    return text.replace(/([\\`*_{}\[\]()#+\-.!|])/g, "\\$1");
  }

  function toMarkdown(node, depth = 0) {
    if (!node) return "";
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent.replace(/\s+/g, " ");
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return "";

    const tag = node.tagName.toLowerCase();
    if (["script", "style", "noscript", "iframe", "form", "nav", "aside"].includes(tag)) return "";

    const childrenMd = () => [...node.childNodes].map((c) => toMarkdown(c, depth + 1)).join("");

    switch (tag) {
      case "h1": return `\n\n# ${node.innerText.trim()}\n\n`;
      case "h2": return `\n\n## ${node.innerText.trim()}\n\n`;
      case "h3": return `\n\n### ${node.innerText.trim()}\n\n`;
      case "h4": return `\n\n#### ${node.innerText.trim()}\n\n`;
      case "h5":
      case "h6": return `\n\n##### ${node.innerText.trim()}\n\n`;
      case "p":  return `\n\n${childrenMd().trim()}\n\n`;
      case "br": return "\n";
      case "strong":
      case "b":  return `**${childrenMd().trim()}**`;
      case "em":
      case "i":  return `*${childrenMd().trim()}*`;
      case "code": return `\`${node.innerText}\``;
      case "pre": return `\n\n\`\`\`\n${node.innerText}\n\`\`\`\n\n`;
      case "blockquote": {
        const inner = childrenMd().trim().split("\n").map((l) => `> ${l}`).join("\n");
        return `\n\n${inner}\n\n`;
      }
      case "a": {
        const href = node.getAttribute("href") || "";
        const text = node.innerText.trim();
        if (!href || !text) return text;
        return `[${text}](${href})`;
      }
      case "img": {
        const src = node.getAttribute("src") || "";
        const alt = node.getAttribute("alt") || "";
        return src ? `\n\n![${alt}](${src})\n\n` : "";
      }
      case "ul":
      case "ol": {
        const ordered = tag === "ol";
        const items = [...node.children].filter((c) => c.tagName === "LI");
        return "\n\n" + items.map((li, i) => {
          const marker = ordered ? `${i + 1}.` : "-";
          return `${marker} ${[...li.childNodes].map((c) => toMarkdown(c, depth + 1)).join("").trim()}`;
        }).join("\n") + "\n\n";
      }
      case "hr": return "\n\n---\n\n";
      default:
        return childrenMd();
    }
  }

  const root = findBestRoot();
  const md = toMarkdown(root)
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  function metaContent(name) {
    return document.querySelector(`meta[name="${name}"]`)?.content
        || document.querySelector(`meta[property="${name}"]`)?.content
        || "";
  }

  const title = metaContent("og:title")
    || document.querySelector("h1")?.innerText
    || document.title
    || "Untitled";

  const author = metaContent("author") || metaContent("article:author") || "";

  return {
    title: title.trim(),
    author,
    content: md,
    posted: metaContent("article:published_time") || "",
    url: location.href,
  };
})();
