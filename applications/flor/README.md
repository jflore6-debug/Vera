# Flor

Flor is a standalone PowerPoint editor that runs entirely in your browser — no
server, no account. Build a deck, edit it visually, keep a full edit history,
reuse a library of layouts and images, save your work, and export a real
`.pptx` file whenever you're ready.

## Features (v1)

- **Editor** — add/edit text, shapes, and images on a slide canvas; drag to
  move, drag a corner to resize, double-click text to edit it in place.
- **Library** — built-in slide layouts (title, bullets, two-column, image +
  text, quote, blank) plus an image library you upload once and reuse across
  slides and projects.
- **History** — every edit is tracked automatically with undo/redo, and the
  History panel lets you jump straight to any past point in the deck.
- **Save** — projects are saved to your browser's local storage (via
  IndexedDB) under "Files"; autosave keeps your current project up to date.
- **Import** — open an existing `.pptx` to pull in its text and images as a
  starting point (best-effort: decorative shapes without text aren't
  reconstructed yet).
- **Export** — "Download .pptx" generates a real PowerPoint file client-side
  and downloads it, ready to open in PowerPoint, Keynote, or Google Slides.
- **Installable** — Flor is a PWA. Open it in Chrome/Edge and choose
  "Install Flor…" to add it to your Applications folder / Start menu / dock
  as a standalone app with its own icon and window, no browser chrome.

## Getting started

```bash
npm install
npm run dev       # local dev server
npm run build     # production build -> dist/
npm run preview   # serve the production build
```

Once you're running it (dev or preview), open it in Chrome or Edge and look
for the install icon in the address bar (or the browser menu → "Install
Flor…") to add it as a standalone app.

## Project structure

```
src/
  components/   UI: canvas, panels (Slides/Library/History/Files), toolbar
  store/        Zustand stores — deck state (with undo/redo via zundo),
                the image library
  lib/          Data model, pptx export (pptxgenjs) and import (JSZip),
                IndexedDB persistence (idb-keyval)
public/icons/   App icon source (icon.svg) and generated PWA/favicon assets
```

## Notes on v1 scope

- Everything is local to the browser (IndexedDB + localStorage) — there is
  no backend and no sync between devices.
- Import is best-effort: text and images come through positioned reasonably
  close to the original; complex layouts, animations, and non-text shapes
  are not reconstructed. Round-tripping a deck created *in* Flor is exact.
