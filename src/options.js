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

const DEFAULT_GITHUB_TEMPLATE = `# {{repo}} / {{owner}}

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

const els = {
  vault: document.getElementById("vault"),
  folder: document.getElementById("folder"),
  defaultTags: document.getElementById("defaultTags"),
  articleTemplate: document.getElementById("articleTemplate"),
  twitterTemplate: document.getElementById("twitterTemplate"),
  githubTemplate: document.getElementById("githubTemplate"),
  save: document.getElementById("save"),
  reset: document.getElementById("reset"),
  status: document.getElementById("status"),
};

async function load() {
  const stored = await chrome.storage.sync.get({
    vault: "",
    folder: "Inbox",
    defaultTags: "",
    articleTemplate: DEFAULT_ARTICLE_TEMPLATE,
    twitterTemplate: DEFAULT_TWITTER_TEMPLATE,
    githubTemplate: DEFAULT_GITHUB_TEMPLATE,
  });
  els.vault.value = stored.vault;
  els.folder.value = stored.folder;
  els.defaultTags.value = stored.defaultTags;
  els.articleTemplate.value = stored.articleTemplate;
  els.twitterTemplate.value = stored.twitterTemplate;
  els.githubTemplate.value = stored.githubTemplate;
}

els.save.addEventListener("click", async () => {
  await chrome.storage.sync.set({
    vault: els.vault.value.trim(),
    folder: els.folder.value.trim(),
    defaultTags: els.defaultTags.value.trim(),
    articleTemplate: els.articleTemplate.value,
    twitterTemplate: els.twitterTemplate.value,
    githubTemplate: els.githubTemplate.value,
  });
  els.status.textContent = "Saved";
  els.status.className = "status ok";
  setTimeout(() => { els.status.textContent = ""; els.status.className = "status"; }, 1500);
});

els.reset.addEventListener("click", () => {
  els.articleTemplate.value = DEFAULT_ARTICLE_TEMPLATE;
  els.twitterTemplate.value = DEFAULT_TWITTER_TEMPLATE;
  els.githubTemplate.value = DEFAULT_GITHUB_TEMPLATE;
});

load();
