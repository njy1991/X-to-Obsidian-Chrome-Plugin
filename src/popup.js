// Popup script: pick the right extractor for the active tab, render a preview,
// and dispatch to the background worker on Save. The popup stays open after
// dispatch so the user sees the save status before closing manually.

const els = {
  badge: document.getElementById("kind-badge"),
  title: document.getElementById("title"),
  url: document.getElementById("url"),
  folder: document.getElementById("folder"),
  tags: document.getElementById("tags"),
  save: document.getElementById("save"),
  options: document.getElementById("open-options"),
  status: document.getElementById("status"),
};

let extracted = null;
let activeTabId = null;
let activeVault = "";

function setStatus(text, cls = "") {
  els.status.textContent = text;
  els.status.className = "status" + (cls ? " " + cls : "");
}

function isTwitter(url) {
  try {
    const u = new URL(url);
    return u.hostname === "x.com" || u.hostname === "twitter.com" ||
           u.hostname.endsWith(".x.com") || u.hostname.endsWith(".twitter.com");
  } catch { return false; }
}

function isGitHub(url) {
  try {
    const u = new URL(url);
    if (u.hostname !== "github.com" && !u.hostname.endsWith(".github.com")) return false;
    // Repo pages match /{owner}/{repo}[/...]. Exclude reserved single-segment paths
    // (settings, marketplace, etc.) and well-known non-repo two-segment paths.
    const segs = u.pathname.split("/").filter(Boolean);
    if (segs.length < 2) return false;
    const reservedOwners = new Set([
      "settings", "marketplace", "notifications", "explore", "topics",
      "trending", "collections", "events", "sponsors", "pulls", "issues",
      "search", "new", "login", "signup", "orgs", "organizations",
    ]);
    return !reservedOwners.has(segs[0]);
  } catch { return false; }
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function runExtractor(tabId, file) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    files: [file],
  });
  return results?.[0]?.result || null;
}

async function fetchArticleMeta(tweetId) {
  // X long-form Articles attached to a tweet expose their title, preview
  // text, and cover image through the same syndication endpoint that
  // powers embedded tweets. The DOM card on the tweet page itself doesn't
  // surface the title with any stable selector, so this is the reliable
  // path. Cross-origin fetch works from the popup because the endpoint
  // is CORS-friendly and the manifest grants <all_urls>.
  const url = `https://cdn.syndication.twitter.com/tweet-result?id=${encodeURIComponent(tweetId)}&token=a`;
  const resp = await fetch(url, { credentials: "omit" });
  if (!resp.ok) return null;
  const data = await resp.json();
  if (!data || !data.article) return null;
  const media = data.article.cover_media?.media_info;
  return {
    title: data.article.title || "",
    previewText: data.article.preview_text || "",
    coverUrl: media?.original_img_url || "",
    articleUrl: data.entities?.urls?.[0]?.expanded_url || "",
  };
}

function renderArticlePreview(meta, fallbackHref) {
  const parts = [];
  if (meta.coverUrl) parts.push(`![](${meta.coverUrl})`);
  if (meta.title) parts.push(`## ${meta.title}`);
  if (meta.previewText) parts.push(meta.previewText);
  const url = meta.articleUrl || fallbackHref;
  if (url) parts.push(`[Read full article on X](${url})`);
  return parts.join("\n\n");
}

async function init() {
  const settings = await chrome.storage.sync.get({
    vault: "",
    folder: "Inbox",
    defaultTags: "",
  });
  activeVault = settings.vault;
  els.folder.value = settings.folder || "";
  els.tags.value = settings.defaultTags || "";

  const tab = await getActiveTab();
  if (!tab) {
    setStatus("No active tab", "err");
    els.save.disabled = true;
    return;
  }
  activeTabId = tab.id;

  const kind = isTwitter(tab.url) ? "twitter"
             : isGitHub(tab.url)  ? "github"
             : "article";
  const badgeLabel = { twitter: "X.com", github: "GitHub", article: "article" }[kind];
  els.badge.textContent = badgeLabel;
  els.badge.className = "badge" + (kind !== "article" ? ` ${kind}` : "");

  const file = kind === "twitter" ? "src/content/twitter.js"
             : kind === "github"  ? "src/content/github.js"
             : "src/content/article.js";

  try {
    extracted = await runExtractor(tab.id, file);
  } catch (err) {
    setStatus("Cannot extract on this page", "err");
    els.save.disabled = true;
    return;
  }

  if (!extracted) {
    setStatus("Extraction returned empty", "err");
    els.save.disabled = true;
    return;
  }

  if (extracted._articlePreview) {
    // Tweet attaches an X long-form Article. Pull the title + preview text
    // from the syndication API and replace the cover-only content the
    // synchronous extractor produced. If the call fails the original
    // content (cover image at minimum) stays in place.
    setStatus("Fetching article…");
    try {
      const meta = await fetchArticleMeta(extracted._articlePreview.tweetId);
      if (meta && (meta.title || meta.previewText)) {
        extracted.content = renderArticlePreview(
          meta,
          extracted._articlePreview.articleHref,
        );
        if (meta.title) extracted.title = meta.title;
      }
    } catch { /* leave fallback content as-is */ }
    delete extracted._articlePreview;
    setStatus("");
  }

  extracted.kind = kind;
  extracted.url = extracted.url || tab.url;
  els.title.value = extracted.title || "";
  els.url.textContent = extracted.url;

  if (!activeVault) {
    setStatus("Set default vault in Settings", "err");
  }
}

els.save.addEventListener("click", async () => {
  if (!extracted) return;
  els.save.disabled = true;
  setStatus("Saving…");
  const editedTitle = els.title.value.trim();
  const payload = { ...extracted, title: editedTitle || extracted.title || "Untitled" };
  const response = await chrome.runtime.sendMessage({
    type: "SAVE_TO_OBSIDIAN",
    extracted: payload,
    folder: els.folder.value.trim(),
    tags: els.tags.value.trim(),
    vault: activeVault,
    tabId: activeTabId,
  });
  if (response?.ok) {
    const where = response.folder ? `${response.vault}/${response.folder}` : response.vault;
    setStatus(`Saved to ${where || "vault"}: ${response.filename}.md`, "ok");
    els.save.textContent = "Saved";
  } else {
    setStatus(response?.error || "Failed", "err");
    els.save.disabled = false;
  }
});

els.options.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

init();
