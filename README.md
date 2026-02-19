# OogVault Desktop

A companion Electron desktop app for the [OogVault browser extension](https://github.com/PhilT3ch/OogVault).

Browse, search, and manage your saved AI conversations and knowledge nuggets — all local, all private.

---

## ✅ What works (v0.2.0)

### Main App
- **Full-window UI** — two-panel layout with conversation list + detail view
- **Search** — keyword + fuzzy search across all conversations
- **Knowledge base** — collapsible Q&A categories extracted from conversations
- **Import from extension** — one-click import via JSON export
- **Export** — conversations as Markdown, all data as JSON
- **Settings** — import, export, clear vault

### Menu Bar + Quick Search (Sprint 1)
- **System tray icon** — app lives in the menu bar; persists after main window is closed
- **Global hotkey `Cmd+Shift+Space`** — opens a Spotlight-style search overlay from anywhere
- **Quick search overlay** — frosted-glass dark UI, searches the vault in real time (180ms debounce)
- **Arrow key navigation** — `↑↓` moves between results
- **Esc** closes the overlay
- **Click a result** — opens that conversation in the main OogVault window
- **Footer buttons** — Copy / Open / Close buttons in the overlay footer (see known issues below)

---

## ⚠️ Known Issues / Not Yet Working

### Quick Search overlay — footer buttons unreliable
The **Copy**, **Open**, and **Close** buttons in the overlay footer, as well as the `Enter` and `Cmd+Enter` keyboard shortcuts, do not reliably fire on macOS.

**Root cause (diagnosed):** The frameless transparent Electron window loses "key window" status on macOS when any interactive element is clicked or focused. The `blur` event fires before `mousedown`/`click` can complete, hiding the window mid-action. Multiple mitigation attempts (delayed blur, `mousedown` instead of `click`, document-level keydown listener, synchronous clipboard via preload) have been tried without a stable resolution.

**Workaround:** Click a search result directly to open it in the main window. Use `Esc` to close.

**Next approach to try:**
- Set `type: 'panel'` on the quick search BrowserWindow (macOS NSPanel — designed for floating UI that retains key focus)
- Or: replace the frameless window with a non-transparent one with `hiddenInset` title bar

---

## 🗺️ Roadmap

### Sprint 2 — MCP Server *(up next)*
Expose OogVault as an MCP (Model Context Protocol) server so Claude Desktop and other AI agents can search your vault automatically.

**Planned tools:**
- `search_conversations(query)` — search by keyword
- `check_if_asked_before(question)` — find similar past questions (use for complex queries only — see token note below)
- `get_conversation(id)` — fetch full conversation by ID
- `search_knowledge_nuggets(topic)` — search Q&A nuggets
- `list_recent_conversations(limit)` — list most recent chats

**Token economics note:** MCP auto-checking every message costs MORE tokens than it saves on simple questions. The MCP should be opt-in / smart-triggered — only useful for complex research queries where checking history saves significant context-gathering work.

**Files to create:**
- `server/mcp-server.js` — MCP server using `@modelcontextprotocol/sdk` over stdio
- `server/start-mcp.sh` — startup script for Claude Desktop config

**Claude Desktop setup (once built):**
```json
{
  "mcpServers": {
    "oogvault": {
      "command": "/path/to/OogVault-Desktop/server/start-mcp.sh"
    }
  }
}
```

### Sprint 3 — Integration & Polish
- Settings UI toggle to start/stop MCP server with status indicator
- Auto-sync between extension and desktop via localhost WebSocket (currently manual JSON import)
- Dynamic quick search window height (resize to fit results instead of fixed 460px)
- Fix footer button reliability in quick search overlay (see Known Issues above)
- Voice search in menu bar

### Future / Backlog
- Mobile app (iOS/Android)
- Plugins for Obsidian, Notion, VS Code
- Semantic search with local embeddings
- Claude Desktop native app detection (auto-import conversations)

---

## Stack

Vanilla JS/CSS + Electron. No frameworks, no cloud.

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) (v18+)
- The [OogVault browser extension](https://github.com/PhilT3ch/OogVault) cloned **next to** this folder (for the shared `lib/` symlink)

```
your-projects/
├── OogVault/              ← browser extension repo
└── OogVault-Desktop/      ← this app
```

### Install & run

```bash
npm install
npm start
```

The app opens the main window and also places an icon in your menu bar. Press `Cmd+Shift+Space` from anywhere to open the quick search overlay.

### Build a distributable

```bash
npm run dist
```

---

## Importing your conversations

1. Open the OogVault browser extension → **Settings** (gear icon)
2. Click **Export All** — saves a `.json` file
3. In the desktop app → **Settings** → **Import from Extension** → pick that file

---

## Project structure

```
OogVault-Desktop/
├── main.js             # Electron main process — windows, tray, IPC, global shortcut
├── preload.js          # contextBridge → window.electronAPI
├── lib/ → symlink      # Shared code from OogVault extension (db.js + search.js)
├── assets/
│   ├── icon.png
│   └── icon.icns
├── server/             # (Sprint 2) MCP server — not yet built
│   ├── mcp-server.js
│   └── start-mcp.sh
└── renderer/
    ├── index.html          # Main app shell
    ├── app.js              # Entry point, routing, shared utils
    ├── app.css             # Amber glass design system
    ├── quicksearch.html    # Quick search overlay
    ├── quicksearch.css
    ├── quicksearch.js
    └── views/
        ├── ConversationsView.js
        ├── KnowledgeView.js
        └── SettingsView.js
```

> **Note on `lib/`:** This folder is a symlink to `../OogVault/lib`. Clone both repos side-by-side as shown above. If you need a standalone copy, run `cp -r ../OogVault/lib ./lib` after cloning.

---

## Privacy

100% local. No accounts, no network requests, no telemetry. All data lives in:
- `~/Library/Application Support/oogvault-desktop/` (macOS)
- `%APPDATA%\oogvault-desktop\` (Windows)
