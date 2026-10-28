# Architecture

## Data flow

```
OogVault extension (browser)
        │
        │  JSON export
        ▼
OogVault Desktop (Electron)
  ├── IndexedDB          ← conversations & messages (local)
  ├── Quick Search       ← global hotkey overlay
  ├── Knowledge base     ← auto-extracted Q&A nuggets
  └── vault-snapshot.json ──► MCP server ──► Claude Desktop
```

The MCP server reads `vault-snapshot.json`; setup is in [MCP.md](MCP.md).

## Stack

Electron 34, TypeScript (strict), vanilla DOM, IndexedDB, MCP over stdio.

The repo is self-contained: `lib/` holds a copy of the extension's storage and search code (`db.js`, `search.js`), so you don't need the [OogVault](https://github.com/philippsyrov/OogVault) repo next to it.

## Data locations

| Platform | Path |
| --- | --- |
| macOS | `~/Library/Application Support/oogvault-desktop/` |
| Windows | `%APPDATA%\oogvault-desktop\` |
| Linux | `~/.config/oogvault-desktop/` |

## Import flow

Extension **Settings → Export All** → Desktop **Settings → Import from Extension**.

## Known issues

- **macOS:** Copy/Open buttons in the Quick Search overlay can miss clicks on frameless transparent windows; click a result row to open in the main window, or press `Esc` to dismiss.
