# CLI

The CLI has two shapes:

- guided commands for humans
- deterministic commands for Codex, scripts, and CI

Run help:

```bash
cofounder help
cofounder help member
cofounder help mcp
cofounder help skill
cofounder help task
```

The default install is global:

```bash
npm install -g cofounder-crew@latest
```

If the global command is not available, prefix commands with:

```bash
npx -y --package cofounder-crew -- cofounder
```

## Onboarding

```bash
cofounder start
cofounder start --template worktree --setup-codex --yes
cofounder doctor
cofounder update --yes
cofounder pin
cofounder self update
```

`start` initializes missing project files, checks the local setup, optionally installs the Codex MCP entry, and prints next steps.

`doctor` checks the Cofounder CLI version, Node, npm, Codex, Git, `.cofounder/`, `AGENTS.md`, team config, runtime ignores, and the Codex MCP entry.

`update` updates an outdated global Cofounder CLI when confirmed, repairs the Codex MCP entry by default, and runs doctor for the current project. Use `--yes` for non-interactive CLI updates and `--no-setup-codex` to skip MCP repair.

`pin` adds or updates `cofounder-crew` as a project-local dev dependency. This is optional and mainly useful when a repo wants to record a fixed Cofounder runtime.

`self update` updates the globally installed `cofounder` command directly.

## Team

```bash
cofounder team
cofounder member list
cofounder member show backend
cofounder member add designer --title "Product Designer" --model gpt-5.5 --write-mode worktree
cofounder member set designer --model gpt-5.5 --reasoning high --sandbox workspace-write
cofounder member set designer --mcp-oauth-store keyring
cofounder member set designer --mcp-tool-approval approve
cofounder member remove designer
```

## MCP

```bash
cofounder mcp list
cofounder mcp add pencil --url https://example.com/mcp --assign designer
cofounder mcp add local-tool --command node --arg ./mcp/server.js --cwd "{project_root}"
cofounder mcp assign github backend --source main --tool-approval approve
cofounder mcp remove pencil
```

`--source team` assigns a project-owned MCP server from `.cofounder/mcp/`.

`--source main` assigns a selected MCP server from the primary Codex config.

When assigning from `main`, Cofounder sets `mcp.oauth_credentials_store = "keyring"` for that member unless it already has an explicit value. This lets OAuth-backed remote MCP servers work with isolated member `CODEX_HOME` configs and scoped skills while keeping OS keychain access available.

MCP assignments default `mcp.tool_approval = "approve"` because delegated members run through non-interactive `codex exec`; otherwise Codex can prompt for a tool approval that no user can answer. Use `--tool-approval auto` or `cofounder member set <member> --mcp-tool-approval auto` when you want Codex's default approval behavior instead.

## Skills

```bash
cofounder skill list
cofounder skill add api-workflow --scope project --assign backend
cofounder skill add design-review --scope team --assign designer
cofounder skill assign uncodixfy designer --scope main
cofounder skill remove design-review --scope team --delete-files
```

Skill scopes:

| Scope | Location |
| --- | --- |
| `project` | `.agents/skills/` |
| `team` | `.cofounder/skills/` |
| `main` | Existing user/global skill roots |

## Context

```bash
cofounder context show
cofounder context mode auto
cofounder context mode manual
cofounder context sync
```

Use `auto` for derived worker context from `AGENTS.md`. Use `manual` when `.cofounder/project.md` should be curated explicitly.

## Tasks

```bash
cofounder task run backend "inspect this repo"
cofounder task delegate backend "implement the focused change"
cofounder task list
cofounder task status <task_id>
cofounder task logs <task_id> --tail 80
cofounder task watch <task_id>
cofounder task result <task_id>
cofounder task diff <task_id>
cofounder task apply <task_id>
cofounder task cancel <task_id>
cofounder task interrupt <task_id> "new steering instructions"
```

These are CLI fallbacks. The intended daily interface is Codex using the Cofounder MCP tools.

## Codex MCP

Install or repair the MCP entry:

```bash
cofounder setup codex --install
```

Print setup commands:

```bash
cofounder setup codex
```

Restart Codex after changing MCP configuration.
