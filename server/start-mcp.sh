#!/bin/bash
# Launches the OogVault MCP server over stdio.
# Inside the packaged app, use the bundled Electron runtime so no system Node is needed.
cd "$(dirname "$0")/.."
APP_BIN="$(pwd)/../../MacOS/OogVault"
if [ -x "$APP_BIN" ]; then
  ELECTRON_RUN_AS_NODE=1 exec "$APP_BIN" server/mcp-server.js
fi
exec node server/mcp-server.js
