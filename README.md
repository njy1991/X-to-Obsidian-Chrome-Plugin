# Save to Obsidian

A Manifest V3 Chrome extension that saves the active **X.com (Twitter) post** or **web article** to your Obsidian vault as a Markdown note. One click, no Obsidian plugins required — uses the built-in `obsidian://new` URI scheme.

## Support this plugin

If you love this plugin, help me raise $5 to pay the Google developer fee and launch it on the Chrome Web Store. More donation covers the token for new features!

[**Donate with PayPal**](https://www.paypal.com/donate/?hosted_button_id=AYA3ZEQZXX25Y)

<img src="src/icons/paypal-donate-qr.png" alt="PayPal donation QR code" width="128" height="128" />

## Features

- **One-click capture** from the toolbar icon on any web page or X.com status page.
- **X.com extractor** preserves the post in document order: text, images, video posters, and quote-card links interleave the same way they appear in the original tweet. Handles long-form X "Articles" too.
- **Article extractor** uses a lightweight readability heuristic, finds the densest text block, and converts a useful subset of HTML to clean Markdown (headings, paragraphs, lists, code, blockquote, links, images).
- **Editable title** in the popup before saving — the title becomes the Obsidian note filename and the `{{title}}` template variable.
- **Folder + tags** can be set per save, with defaults pulled from settings.
- **Customisable templates** with Mustache-lite placeholders and conditional blocks for tags.
- **No shell tab.** Dispatches via a hidden `<a href="obsidian://...">` click inside the active tab, so Chrome's protocol handler triggers without opening a new tab.
- **Vault names with spaces work** (the URI is properly percent-encoded — `Memory Eraser` rather than `Memory+Eraser`).
- **Zero runtime dependencies.** Plain JS, no bundler, no framework.

## Install

### Option A — packaged zip (recommended for end-users)

1. Download the latest `save-to-obsidian-<version>.zip` from the [Releases](https://github.com/njy1991/X-to-Obsidian-Chrome-Plugin/releases) page (or build your own with `npm run package`).
2. Unzip it somewhere stable — e.g. `~/Applications/save-to-obsidian/`.
3. Open `chrome://extensions` in Chrome.
4. Toggle **Developer mode** on (top-right).
5. Click **Load unpacked** and select the unzipped folder.
6. Pin the extension to the toolbar (puzzle icon → pin).
7. Right-click the toolbar icon → **Options** and set your **Vault name** (exactly as it appears in Obsidian's vault switcher).

### Option B — from source

```bash
git clone https://github.com/njy1991/X-to-Obsidian-Chrome-Plugin.git
cd X-to-Obsidian-Chrome-Plugin
# Optional: regenerate icons (already committed)
npm run icons
```

Then load the repo folder via `chrome://extensions` → **Load unpacked** as in Option A.

## Usage

### Save a web article

1. Open any article.
2. Click the **Save to Obsidian** toolbar icon.
3. Optionally edit the title, set a folder, add tags.
4. Click **Save** → the note lands in your vault.

### Save an X.com post

1. Open the tweet's status page on `x.com` (single-tweet URL).
2. Click the toolbar icon. The badge switches to **X.com** automatically.
3. Edit the title if you like (defaults to the tweet's first line, or the long-form article headline).
4. Click **Save**.

The first save will trigger macOS / Windows to prompt for the `obsidian://` URL handler. Approve once (tick "Always allow") and subsequent saves are silent.

## Settings

Open **Settings** from the popup or from the toolbar icon's right-click menu → **Options**.

| Setting | Description |
| --- | --- |
| **Vault** | Exact vault name as shown in Obsidian's vault switcher. Required. Case-sensitive. |
| **Default folder** | Folder inside the vault where new notes go. Blank = vault root. |
| **Default tags** | Space-separated tags appended to per-note tags entered in the popup. |
| **Article template** | Markdown template rendered for generic articles. |
| **X.com template** | Markdown template rendered for X.com posts. |

### Template placeholders

| Placeholder | Value |
| --- | --- |
| `{{title}}` | Note title (also the filename) |
| `{{author}}` | Article author or X.com display name + handle |
| `{{url}}` | Source URL |
| `{{date}}` | Save date (YYYY-MM-DD) |
| `{{posted}}` | Original publish/post timestamp when available |
| `{{tags}}` | Combined default + per-note tags |
| `{{content}}` | Extracted Markdown body |

Conditional blocks render only when the variable is truthy:

```
{{#tags}}**Tags:** {{tags}}
{{/tags}}
```

## How it works

1. The popup reads the active tab's URL. If the hostname matches `x.com` / `twitter.com`, it injects `src/content/twitter.js`; otherwise `src/content/article.js`.
2. The content script returns an `extracted` object: `{title, author, url, content, posted, ...}`. The X.com extractor walks the focused tweet's `<article>` in document order so the Markdown interleaves text and media in the original sequence.
3. The popup sends `{type: "SAVE_TO_OBSIDIAN", extracted, folder, tags, vault, tabId}` to the background service worker.
4. The service worker renders the template, builds an `obsidian://new?vault=…&file=…&content=…` URI, and dispatches it by injecting a hidden `<a>` into the active tab and clicking it. Chrome catches the `obsidian://` navigation at the protocol-handler layer, so no shell tab appears.
5. Obsidian receives the URI and creates the note. The popup shows a sticky status with the destination filename until dismissed.

## Troubleshooting

- **"Unable to find a vault"** — the vault name in Settings must match Obsidian's vault switcher exactly, including spaces and case. Spaces are URL-encoded as `%20` (not `+`), so this works for names like "Memory Eraser".
- **Nothing happens on click** — confirm the `obsidian://` handler is registered on your OS. Try opening `obsidian://open?vault=YourVault` directly in the address bar; if Chrome offers no handler, reinstall Obsidian or accept the protocol prompt.
- **Extraction returned empty** — the popup falls back to the page `<title>` and the densest text block. Single-page apps that render after load may need a moment before opening the popup.
- **X.com extractor missed media** — selectors track the current X DOM and may need updating after major UI changes. Open an issue with the tweet URL.
- **Status bar stays on "Saving…"** — check `chrome://extensions` → **Errors** for the extension. Most failures show up there.

## Development

```bash
# Sanity-check JS syntax
npm run check

# Regenerate icons (rounded purple square with an O glyph)
npm run icons

# Build the distributable zip (output: dist/save-to-obsidian-<version>.zip)
npm run package
```

Layout:

```
manifest.json              Manifest V3 declaration
scripts/
  make-icons.mjs           Regenerates the placeholder PNG icons
  package.mjs              Bundles a zip for sideloading or release
src/
  background.js            Service worker — builds note + dispatches obsidian:// URI
  popup.html/.css/.js      Toolbar popup UI
  options.html/.css/.js    Settings page
  content/
    twitter.js             X.com tweet extractor (runs via chrome.scripting)
    article.js             Generic article extractor + minimal HTML→Markdown
  icons/                   16/32/128 px PNGs
```

## Roadmap

- Vendor Mozilla Readability + Turndown for stronger article extraction.
- Right-click context menu: "Save link to Obsidian" without opening the page.
- Per-domain template overrides.
- Optional Local REST API path (bypasses the URI handler entirely).
- Keyboard shortcut.

## License

MIT — see [`LICENSE`](LICENSE).
