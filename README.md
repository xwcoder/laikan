# emo
[Download](https://github.com/xwcoder/emo/releases) | [Issue](https://github.com/xwcoder/emo/issues/new)

I wish to develop **emo** as an **all in one** desktop application. Now, it includes the following apps:
  - **Reader** - A rss reader.

## Features
- Support dark mode.
- Support i18n (English and Simplified).
- Support data sharing and synchronization between devices using cloud storage.

## Development

Use Node.js 24 LTS (`nvm use`) and npm. Install the locked dependencies:

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
npm run build      # Type-check and build all three processes into dist/
npm start          # Build and preview the production application
npm run test:smoke # Build and verify startup, SQLite, IPC and renderer isolation
```

Electron is upgraded to the npm `latest` stable release, 45.3.3, as checked on
2026-11-17. Commit `package-lock.json` when updating dependencies so local builds
and CI use the same versions.

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
