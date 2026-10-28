# Claude Desktop MCP setup

OogVault Desktop exposes your local vault as a [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server over stdio. Claude Desktop can search past conversations, fetch full threads, and query distilled knowledge nuggets — without sending your vault to the cloud.

## Prerequisites

1. Install and open **OogVault Desktop** at least once so it writes `vault-snapshot.json` to disk.
2. Import conversations from the [OogVault browser extension](https://github.com/philippsyrov/OogVault) if your vault is empty.

Snapshot location:

- **macOS:** `~/Library/Application Support/oogvault-desktop/vault-snapshot.json`
- **Windows:** `%APPDATA%\oogvault-desktop\vault-snapshot.json`
- **Linux:** `~/.config/oogvault-desktop/vault-snapshot.json`

## Configure Claude Desktop

Edit your Claude Desktop config:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

Add the OogVault MCP entry. Point `command` at the **`start-mcp.sh`** script inside your OogVault Desktop clone (use the path where you cloned the repo):

```json
{
  "mcpServers": {
    "oogvault": {
      "command": "/path/to/OogVault-Desktop/server/start-mcp.sh"
    }
  }
}
```

The launcher script runs `node server/mcp-server.js` from the app directory. If you installed from a packaged `.app`, use the copy of `server/start-mcp.sh` inside the application bundle (see the [packaging PR](https://github.com/philippsyrov/OogVault-Desktop/pulls) for bundle layout).

Restart Claude Desktop after saving the config.

## Try it

Example prompts:

- *"Search my vault for machine learning discussions"*
- *"Have I asked about blockchain before?"*
- *"List my recent saved conversations"*

## Available tools

| Tool | Description |
|------|-------------|
| `search_conversations(query)` | Keyword and fuzzy search across all conversations |
| `check_if_asked_before(question)` | Find similar questions from your history |
| `get_conversation(id)` | Fetch a full conversation by ID |
| `search_knowledge_nuggets(topic)` | Search auto-extracted Q&A pairs by topic |
| `list_recent_conversations(limit?)` | List the most recent conversations |

## Troubleshooting

- **Empty results:** Open the desktop app and confirm you have imported conversations; the snapshot updates when the app runs.
- **Server won't start:** Ensure Node.js is on your `PATH` (the script uses `node`). Check Claude Desktop MCP logs for errors.
- **Permission denied on `start-mcp.sh`:** Run `chmod +x server/start-mcp.sh` in your clone.
