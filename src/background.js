// Background service worker. Receives extracted page data from the popup,
// formats a Markdown note, and dispatches it to Obsidian via the obsidian://new
// URI scheme. Dispatch fires from a hidden anchor inside the active tab so
// Chrome's protocol handler triggers without creating a shell tab.

const DEFAULT_ARTICLE_TEMPLATE = `**Source:** {{url}}
**Saved:** {{date}}
{{#tags}}**Tags:** {{tags}}
{{/tags}}
---

{{content}}
`;

const DEFAULT_TWITTER_TEMPLATE = `{{content}}

---
**Author:** {{author}}
**Source:** {{url}}
**Posted:** {{posted}}
**Saved:** {{date}}
{{#tags}}**Tags:** {{tags}}
{{/tags}}`;

const DEFAULT_GITHUB_TEMPLATE = `# {{owner}} / {{repo}}

> {{description}}

| | |
|---|---|
| **Owner** | {{owner}} |
| **Language** | {{language}} |
| **Stars** | {{stars}} |
| **Forks** | {{forks}} |
| **License** | {{license}} |
| **Updated** | {{updated}} |
{{#topics}}
**Topics:** {{topics}}
{{/topics}}

**Source:** {{url}}
**Saved:** {{date}}
{{#tags}}**Tags:** {{tags}}
{{/tags}}

---

## README

{{readme}}
`;

async function getSettings() {
  const defaults = {
    vault: "",
    folder: "Inbox",
    defaultTags: "",
    articleTemplate: DEFAULT_ARTICLE_TEMPLATE,
    twitterTemplate: DEFAULT_TWITTER_TEMPLATE,
    githubTemplate: DEFAULT_GITHUB_TEMPLATE,
  };
  const stored = await chrome.storage.sync.get(defaults);
  return { ...defaults, ...stored };
}

function renderTemplate(template, data) {
  let out = template.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, key, body) =>
    data[key] ? body : "",
  );
  out = out.replace(/\{\{(\w+)\}\}/g, (_, key) => (data[key] ?? "").toString());
  return out;
}

function sanitizeFilename(name) {
  return (
    name
      .replace(/[\\/:*?"<>|#^[\]]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || "Untitled"
  );
}

function buildNote(extracted, settings, userInput) {
  const tags = [settings.defaultTags, userInput.tags].filter(Boolean).join(" ").trim();
  const now = new Date().toISOString().slice(0, 10);
  const kind = extracted.kind;

  if (kind === "github") {
    // " - " separator dodges the `/` strip inside sanitizeFilename which would
    // otherwise collapse owner+repo into a single token.
    const owner = extracted.owner || "";
    const repo = extracted.repo || "";
    const filenameBase = owner && repo ? `${owner} - ${repo}` : (owner || repo || "GitHub Repo");
    const data = {
      owner,
      repo,
      description: extracted.description || "",
      stars: extracted.stars || "",
      forks: extracted.forks || "",
      language: extracted.language || "",
      license: extracted.license || "",
      topics: extracted.topics || "",
      updated: extracted.updated || "",
      readme: extracted.readme || "",
      url: extracted.url,
      date: now,
      tags,
    };
    return {
      filename: sanitizeFilename(filenameBase),
      body: renderTemplate(settings.githubTemplate, data),
    };
  }

  const isTwitter = kind === "twitter";
  const template = isTwitter ? settings.twitterTemplate : settings.articleTemplate;

  const data = {
    title: extracted.title || "Untitled",
    author: extracted.author || "",
    posted: extracted.posted || "",
    id: extracted.id || "",
    url: extracted.url,
    date: now,
    tags,
    content: extracted.content || "",
  };

  return {
    filename: sanitizeFilename(extracted.title || "Untitled"),
    body: renderTemplate(template, data),
  };
}

function obsidianUri({ vault, folder, filename, body }) {
  const params = new URLSearchParams();
  if (vault) params.set("vault", vault);
  const path = folder ? `${folder.replace(/\/$/, "")}/${filename}` : filename;
  params.set("file", path);
  params.set("content", body);
  // Obsidian's URI handler does RFC 3986 percent-decoding, not form-urlencoded,
  // so `+` is treated as a literal `+`, not a space. URLSearchParams encodes
  // spaces as `+`, which breaks vault names like "Memory Eraser". Convert to %20.
  return `obsidian://new?${params.toString().replace(/\+/g, "%20")}`;
}

async function dispatchToObsidian(uri, tabId) {
  // Inject a hidden anchor into the active tab and click it. Chrome intercepts
  // the obsidian:// navigation at the protocol-handler layer before the tab
  // actually navigates, so the page stays put and no shell tab is created.
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (u) => {
      const a = document.createElement("a");
      a.href = u;
      a.style.display = "none";
      (document.body || document.documentElement).appendChild(a);
      a.click();
      a.remove();
    },
    args: [uri],
  });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== "SAVE_TO_OBSIDIAN") return;
  (async () => {
    try {
      const settings = await getSettings();
      const vault = msg.vault || settings.vault;
      const folder = msg.folder ?? settings.folder;
      const note = buildNote(msg.extracted, settings, { tags: msg.tags || "" });
      const uri = obsidianUri({ vault, folder, ...note });
      await dispatchToObsidian(uri, msg.tabId);
      sendResponse({ ok: true, filename: note.filename, vault, folder });
    } catch (err) {
      sendResponse({ ok: false, error: err.message });
    }
  })();
  return true; // keep channel open for async response
});
