# emo
[Download](https://github.com/xwcoder/emo/releases) | [Issue](https://github.com/xwcoder/emo/issues/new)

I wish to develop **emo** as an **all in one** desktop application. Now, it includes the following apps:
  - **Reader** - A rss reader.

## Features
- Support dark mode.
- Support i18n (English and Simplified).
- Support data sharing and synchronization between devices using cloud storage.

## Development

Use Node.js 24 LTS (24.15.0 or later, via `nvm use`) and npm. Install the locked dependencies:

```sh
npm ci
npm run dev
```

The application uses [electron-vite](https://electron-vite.org/) with Vite 8 and
React Fast Refresh. `npm run dev` starts Electron and the renderer server together,
restarts the main process when it changes, and reloads preload changes.
`electron.vite.config.mts` configures all three builds and the `@/` source alias.

```sh
npm run lint       # ESLint and TypeScript checks
npm test           # RSS/Atom, HTTP, concurrency and SQLite regression tests
npm run build      # Type-check and build all three processes into dist/
npm start          # Preview the built production application
npm run test:smoke # Build and verify startup, SQLite, IPC and renderer isolation
```

Electron is upgraded to the npm `latest` stable release, 45.3.3, as checked on
2026-11-17. Commit `package-lock.json` when updating dependencies so local builds
and CI use the same versions.

## UI architecture

The renderer uses local [shadcn/ui](https://ui.shadcn.com/) components backed by
Radix primitives, Lucide icons, and Tailwind CSS **4.3.5** (npm `latest`, checked on
2026-11-17). Tailwind runs through `@tailwindcss/vite`; its configuration lives in
CSS rather than a JavaScript Tailwind or PostCSS configuration. `components.json`
configures shadcn's source aliases for adding more components.

- Reusable controls live in `src/ui/components/ui/`. Application styles use
  Tailwind utilities; `src/ui/style.css` defines semantic colors and radii for
  both themes. Change those variables to update the application theme.
- Component forms, dialogs and other private UI state use React `useState`.
  Zustand stores in `src/ui/store/` contain shared client state such as the
  reader tab, page, focused article and selected article IDs.
- All IPC-backed feeds, article lists/details, feed previews and saved settings
  use TanStack Query in `src/ui/query/`. Writes use mutations and invalidate
  affected queries after success. Background feed and settings IPC events also
  invalidate the cache; server data is never copied into Zustand.

Open Settings using the gear fixed at the bottom of the subscription sidebar.
Settings appear in a centered modal; select Light, Dark or System there. The
system option follows OS theme changes. Theme and language changes save
immediately through the existing Electron settings service, as does reader font
size. Closing the modal with its close button, Escape or an outside click keeps
your reading position. An unapplied data-directory draft is discarded on close;
changing the active directory still requires Restart & Apply.

Internationalization uses `react-i18next` with one bundled JSON resource per
language: `src/i18n/en-US.json` and `src/i18n/zh-CN.json`. Keep their keys aligned
and use `useTranslation()` for UI text. Dates and pagination use the active
language; unsupported system locales fall back to English. All resources work
offline in packaged builds.

`npm run test:smoke` additionally exercises the production UI with a local RSS
fixture: theme/language persistence and system theme changes, feed previews and
subscriptions, pagination, read/star mutations, font size, bulk keyboard
shortcuts, push-driven cache updates, feed deletion and failed mutations. It also
checks settings-modal dismissal, focus return, small-window scrolling, discarded
directory drafts and preservation of reader state while changing settings. It
uses an isolated temporary data directory. Set `EMO_SMOKE_SCREENSHOTS` to an
output directory to capture representative screens.

## Packaging and releases

[electron-builder](https://www.electron.build/) builds the application and installers:

```sh
npm run package  # Build an unpacked application in release/
npm run make     # Build installers for the current platform in release/
```

| Platform | Installers |
| --- | --- |
| macOS | DMG and ZIP |
| Windows | NSIS EXE |
| Linux | AppImage, DEB and RPM |

Build on the target operating system. Linux RPM packaging requires `rpm`.
SQLite remains a runtime dependency: the install step rebuilds native dependencies
for Electron, and its binaries are unpacked from ASAR when packaging. Renderer-only
dependencies are bundled by Vite and excluded from the shipped `node_modules`.

Windows installers now use NSIS instead of Squirrel. Existing Squirrel installations
should be uninstalled before installing the new NSIS package.

The smoke test uses a temporary data directory and removes it afterwards. It requires
a graphical session; use `xvfb-run --auto-servernum npm run test:smoke` on headless Linux.

CI checks types, lint, unpacked packaging and startup on all three platforms. Pushing a `v*`
tag builds installers and uploads them to a draft GitHub release. To publish from
your machine, set `GH_TOKEN` and run `npm run publish`. Signing and notarization
credentials can be supplied through electron-builder's environment variables;
the included GitHub workflow produces unsigned builds.

## Reader
RSS 2.0, RSS 1.0/RDF and Atom feeds are normalized before storage. Atom text,
HTML and XHTML content retain their semantics, summary-only feeds are supported,
and namespace prefixes do not affect format detection. Links and media resources
are resolved using redirect URLs and inherited `xml:base` values. Response bytes
are decoded using BOM, HTTP charset or XML declarations, with UTF-8 as the default.
The reader uses its own typography and colors for feed and extracted content.
It preserves semantic formatting, local anchors, and images, including supported
lazy image attributes and image attachments. A body that exceeds the HTML limits
can fall back to its own summary while the remaining entries are imported.

Feed requests have a 20-second deadline and a 10 MiB body limit. XML/HTML depth and
node counts and the 5,000-article feed limit bound parsing work; parsing yields
between chunks so it does not monopolize the main process. Up to four feeds
refresh concurrently. ETag and Last-Modified validators are saved only after a
successful import; unchanged feeds can return HTTP 304. A bounded 30-second
cache lets preview and initial subscription share the same parsed result.

Article identity uses RSS GUID / Atom ID, with URL and content-hash fallbacks.
Articles without browser links remain readable. Existing databases migrate
transactionally while preserving article IDs, read/star state and timestamps;
legacy rows are adopted by URL when their source next refreshes. Imports are
atomic, database operations cannot interleave with another transaction, and a
failed migration rolls back to the original tables. Data already overwritten by
older versions can only be recovered if the feed still supplies those articles.
The article list loads metadata. Opening an article loads its body. Refreshing
a feed retains stored full content when a later entry only supplies a summary.
For entries with a summary or missing body and a source URL, **Load full article**
extracts and caches the original page on demand. The request has a 20-second
deadline and a 3 MiB body limit. The feed content stays available.

![Reader screenshot](./docs/images/screenshot.png)

### Keyboard shortcus
- ?: Toggle keyboard shortcus help
- g then i: Go to Unread items
- g then s: Go to Starred items
- g then a: Go to All items
- \* then a: Select all items
- \* then n: Deselect all items
- x: Select/Deselect item
- s: Toggle star
- j: Next item
- k: Previous item
- o: Open item
- u: Close item
- v: Open item in browser
