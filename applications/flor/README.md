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
- **Native macOS app** — `Flor.app`, a real double-clickable app for
  `/Applications` with the Flor icon. See "Desktop app (macOS)" below.

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

## Desktop app (macOS)

`Flor.app` is a real app bundle for `/Applications`: click its icon and it
opens Flor in its own window, no terminal, no dev server. It's built from
`native/main.go` — a tiny (~6 MB) Go binary with the built web app embedded
via `go:embed`. On launch it serves the app on a local port and opens it in
Chrome/Edge/Brave's app mode (`--app=`) for a chromeless, native-looking
window; if none of those are installed it falls back to opening the app in
your default browser as a normal tab. It ships as a universal binary
(Apple Silicon + Intel) at about 5–13 MB, unlike an Electron build of the
same app (which bundles a full Chromium and runs 300+ MB).

Build it:

```bash
./scripts/build-mac-app.sh
```

This produces `release/Flor.app` and `release/Flor-mac.zip`. Unzip (if
needed), drag `Flor.app` into `/Applications`, and click its icon to open
it. Saved projects live in the app-mode browser profile at
`~/Library/Application Support/Flor/chrome-profile`, so they persist
across launches.

Since the app isn't signed/notarized with an Apple Developer certificate,
macOS Gatekeeper will block the first launch ("Flor can't be opened
because Apple cannot check it for malicious software"). Right-click (or
Control-click) `Flor.app` → **Open** → **Open** in the dialog, and macOS
remembers your choice from then on.

There's also a heavier, fully-bundled alternative if you'd rather ship a
self-contained Electron app (no dependency on Chrome/Edge being
installed): `npm run desktop:mac` (or `desktop:win` / `desktop:linux`),
which uses `electron-builder` and the config in `package.json`.

## Project structure

```
src/
  components/   UI: canvas, panels (Slides/Library/History/Files), toolbar
  store/        Zustand stores — deck state (with undo/redo via zundo),
                the image library
  lib/          Data model, pptx export (pptxgenjs) and import (JSZip),
                IndexedDB persistence (idb-keyval)
public/icons/   App icon source (icon.svg) and generated PWA/favicon assets
build/          Generated .icns/.ico/.png app icons (from public/icons/icon.svg)
native/         Go source for the macOS launcher (native/main.go)
scripts/        build-mac-app.sh and the Info.plist/launcher.sh it assembles
electron/       Main process for the optional Electron build (desktop:mac/win/linux)
```

## Notes on v1 scope

- Everything is local to the browser (IndexedDB + localStorage) — there is
  no backend and no sync between devices.
- Import reconstructs, per shape: real font size/bold/italic/font family/
  color (including theme colors, `a:schemeClr`), horizontal and vertical
  text alignment, rotation, decorative shapes (dividers, card backgrounds)
  and their fill/stroke, tables (as a grid of cells), grouped shapes
  (`p:grpSp`, recursively), and placeholder position/size inherited from
  the slide layout/master when a shape doesn't set its own. `fontSize` is
  always real points, matching PowerPoint and the `.pptx` export exactly.
  Not reconstructed: gradients (approximated as a flat color from the
  first stop), shadows/effects, animations, and inline mixed formatting
  within a single paragraph (Flor takes the lead run's style). Round-
  tripping a deck created *in* Flor is exact.
