# Development

Local setup:

```bash
npm install
npm run check
npm test
npm run build
```

Useful package commands:

```bash
npm create cofounder@latest -- --yes
npx -y --package cofounder-crew -- cofounder start
```

The root package publishes the runtime CLI and MCP server. The `packages/create-cofounder` package publishes the `npm create cofounder` initializer.
