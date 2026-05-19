# Contributing

Thanks for helping improve Cofounder Crew.

## Start Here

1. Read the README to understand the product direction.
2. Search existing issues before opening a new one.
3. Keep proposals small and concrete.
4. For behavior changes, explain the user flow before the implementation details.

## Local Development

```bash
npm install
npm run check
npm test
npm run build
```

Run the CLI from the checkout:

```bash
node dist/src/cli.js help
```

## Pull Requests

- Keep changes scoped to one clear problem.
- Include tests for CLI behavior, runtime behavior, or config derivation changes.
- Update README/docs when user-facing behavior changes.
- Do not commit generated run logs, worktrees, private memory, local credentials, or unpublished planning notes.
- Do not publish npm packages from a pull request.

## Product Principles

- Codex remains the main interface.
- Global `cofounder` is the default user experience.
- Project-local pinning is explicit through `cofounder pin`.
- Plain files and inspectable logs are preferred over hidden orchestration layers.
- Specialist MCP servers and skills should be scoped to the teammates that need them.

## Reporting Bugs

Please include:

- Cofounder version
- Node/npm versions
- Codex CLI version
- operating system
- command or Codex prompt that failed
- relevant output or `.cofounder/runs/<task>/events.jsonl` excerpt
- whether the project uses direct or worktree write mode
