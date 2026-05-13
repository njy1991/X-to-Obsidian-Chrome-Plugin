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

  const kind = isTwitter(tab.url) ? "twitter" : "article";
  els.badge.textContent = kind === "twitter" ? "X.com" : "article";
  els.badge.className = "badge" + (kind === "twitter" ? " twitter" : "");

  const file = kind === "twitter"
    ? "src/content/twitter.js"
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
