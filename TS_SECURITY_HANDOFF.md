# OogVault Desktop TS + security pass

## Date

- 2026-04-02

## Scope

- move the app-owned desktop code to TypeScript
- keep the shared `lib/` code in JavaScript
- remove known production npm vulnerabilities without forcing an Electron major upgrade

## Why the migration was staged

This repo uses `lib/` as a symlink to `../OogVault/lib`.

That means the desktop app depends on shared extension code that lives outside this repo.

So the safest move was:

- convert the Electron main process, preload bridge, renderer files, and MCP server to TypeScript
- leave the shared `lib` JS code alone
- add thin type declarations for the shared imports

This avoids splitting the desktop app away from the extension logic.

## What changed

### Build + tooling

- added `typescript`
- added `@types/node`
- added direct `zod` dependency because the MCP server imports it directly
- updated `@modelcontextprotocol/sdk` to the latest allowed minor range
- added `tsconfig.json`
- added `build:ts` and `typecheck` scripts
- updated `start`, `build`, and `dist` scripts so TypeScript compiles first

### New TypeScript source

- `src-desktop/main.ts`
- `src-desktop/preload.cts`
- `src-desktop/renderer/app.ts`
- `src-desktop/renderer/quicksearch.ts`
- `src-desktop/renderer/views/ConversationsView.ts`
- `src-desktop/renderer/views/KnowledgeView.ts`
- `src-desktop/renderer/views/SettingsView.ts`
- `src-desktop/server/mcp-server.ts`
- `src-desktop/types/oogvault.d.ts`

### Generated runtime files

The existing runtime files are still the JS/CJS files at the repo root:

- `main.js`
- `preload.cjs`
- `renderer/**/*.js`
- `server/mcp-server.js`

Those are now generated from the `src-desktop/` TypeScript source by `npm run build:ts`.

## Verification

Commands run:

```bash
npm install
npm run typecheck
npm audit --omit=dev
npm run build
```

Results:

- `npm run typecheck` passes
- `npm audit --omit=dev` shows `0 vulnerabilities`
- `npm run build` passes

## Security result

Production/runtime dependency exposure is now clean:

- `npm audit --omit=dev`
- `0 vulnerabilities`

Remaining audit issues are in the Electron packaging/dev-tool chain:

- `electron`
- `electron-builder`
- transitive packaging deps like `tar`

Those fixes require `npm audit fix --force`, which would jump to breaking major versions.

I intentionally did **not** force that jump in this pass.

## Important design decision

The shared `lib/` folder is still JavaScript and still external to this repo.

If you later want a full end-to-end TypeScript migration, do it in the parent `OogVault` repo first, then update this desktop repo to consume the typed shared modules.

## Practical next step

If you revisit this repo later, the safest next upgrade path is:

1. test the app manually after this TS migration
2. only then consider a controlled `electron` / `electron-builder` major upgrade
3. if the shared `lib` is migrated in the extension repo, remove the temporary ambient module declarations here
