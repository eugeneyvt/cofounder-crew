# Development

Local setup:

```bash
npm install
npm run check
npm test
npm run build
```

CI runs on Linux, macOS, and Windows with Node 22. Linux and macOS run the full test suite. Windows runs typecheck, build, package lint, and a CLI smoke test because the runtime target for Codex on Windows is WSL2.

Useful package commands:

```bash
npm create cofounder@latest -- --yes
npx -y --package cofounder-crew -- cofounder start
```

The root package publishes the runtime CLI and MCP server. The `packages/create-cofounder` package publishes the `npm create cofounder` initializer.
