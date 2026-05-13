# Changelog

## 0.1.0 — 2026-05-13

Initial public release.

- Manifest V3 Chrome extension scaffold.
- X.com tweet extractor — text, photos, video posters, and quote cards in document order; handles long-form X "Articles".
- Generic article extractor with lightweight readability heuristic and minimal HTML → Markdown conversion (headings, paragraphs, lists, code, blockquote, links, images).
- `obsidian://new` dispatch via hidden anchor injected into the active tab — no shell tab appears.
- Editable title field in the popup.
- Customisable templates for articles and X.com posts with `{{placeholder}}` and `{{#tags}}…{{/tags}}` conditional blocks.
- URI encoding fix so vault names with spaces (e.g. `Memory Eraser`) resolve correctly.
- `npm run package` produces a zip in `dist/` for sideloading or release.
