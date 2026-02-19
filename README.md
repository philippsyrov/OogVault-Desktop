# OogVault Desktop

A companion Electron desktop app for the [OogVault browser extension](https://github.com/PhilT3ch/OogVault).

Browse, search, and manage your saved AI conversations and knowledge nuggets — all local, all private.

## Features

- **Full-window UI** — two-panel layout with conversation list + detail view
- **Search** — same keyword + fuzzy search engine as the extension (`lib/search.js`)
- **Knowledge base** — collapsible Q&A categories extracted from your conversations
- **Import from extension** — one-click import via JSON export from the OogVault browser extension
- **Export** — conversations as Markdown, all data as JSON

## Stack

Vanilla JS/CSS + Electron. No frameworks, no cloud.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) (v18+)
- The [OogVault browser extension](https://github.com/PhilT3ch/OogVault) cloned **next to** this folder (for the `lib/` symlink)

```
CS Projects/
├── OogVault/          ← browser extension
└── OogVault Desktop/  ← this app
```

### Install & run

```bash
npm install
npm start
```

### Build a distributable

```bash
npm run dist
```

## Importing your conversations

1. Open the OogVault browser extension → **Options**
2. Click **Export for Desktop** — saves `oogvault-desktop-export-YYYY-MM-DD.json`
3. In the desktop app → **Settings** → **Import from Extension** → pick that file

## Project structure

```
OogVault Desktop/
├── main.js           # Electron main process (window + IPC)
├── preload.js        # contextBridge → window.electronAPI
├── lib/ → symlink    # ../OogVault/lib (db.js + search.js reused as-is)
└── renderer/
    ├── index.html    # App shell
    ├── app.js        # Entry point, routing, shared utils
    ├── app.css       # Amber glass design system
    └── views/
        ├── ConversationsView.js
        ├── KnowledgeView.js
        └── SettingsView.js
```

> **Note on the `lib/` symlink:** `lib/` points to `../OogVault/lib`. Clone both repos side-by-side as shown above. If you need a standalone copy, run `cp -r ../OogVault/lib ./lib` after cloning.
