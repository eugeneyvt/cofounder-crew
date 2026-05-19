<p align="center">
  <h1 align="center">Cofounder Crew</h1>
  <p align="center">
    Conversation-first local AI teams for Codex.
    <br />
    No dashboard. No orchestration server. No new IDE.
  </p>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/create-cofounder"><img alt="create-cofounder npm version" src="https://img.shields.io/npm/v/create-cofounder?label=create-cofounder"></a>
  <a href="https://www.npmjs.com/package/cofounder-crew"><img alt="cofounder-crew npm version" src="https://img.shields.io/npm/v/cofounder-crew?label=cofounder-crew"></a>
  <img alt="Node.js >=22" src="https://img.shields.io/badge/node-%3E%3D22-339933">
  <img alt="Codex first" src="https://img.shields.io/badge/interface-Codex-111827">
  <img alt="MCP enabled" src="https://img.shields.io/badge/MCP-enabled-4f46e5">
</p>

<p align="center">
  <a href="#quickstart">Quickstart</a>
  ·
  <a href="#how-it-feels">How It Feels</a>
  ·
  <a href="#what-codex-does">What Codex Does</a>
  ·
  <a href="#configuration">Configuration</a>
  ·
  <a href="#scriptable-fallback">CLI Fallback</a>
</p>

## Why

Most "AI crew" products start by building a UI, an orchestration framework, and a bunch of abstractions.

Cofounder Crew starts with the thing you already use: Codex in your project directory.

You initialize a project once, open Codex, and talk. Codex becomes the Cofounder/orchestrator for the local team. It reads the team roster, delegates specialist work to configured members, monitors their progress, inspects their outputs, and owns the final response back to you.

## Quickstart

Open Codex in the project you want to configure and paste this:

```text
Install and configure Cofounder Crew for this computer and this project.
Use https://github.com/eugeneyvt/cofounder-crew as the source/reference if you need more context.

First inspect the current state before changing anything:
- Check Node.js and npm are available and Node is >=22.
- Check whether this project already has .cofounder/.
- Check whether this project already has AGENTS.md.
- Check whether cofounder-crew is already installed in this project.
- Check whether the Codex MCP server named "cofounder" is already configured with `codex mcp list` or `codex mcp get cofounder`.
- Check whether this project is a Git repository with at least one commit.

Then decide the smallest correct setup:
- If .cofounder/ already exists, do not reinitialize it. Verify MCP setup and tell me what is already configured.
- If this is a package project with package.json, prefer installing cofounder-crew as a dev dependency and run project-local initialization.
- If this is not a package project, use npm create cofounder@latest for initialization.
- Use the worktree template only if this project is a Git repository with at least one commit; otherwise use the default template.
- Install or repair the Codex MCP entry only if it is missing or points at the wrong command.
- If AGENTS.md already exists, do not overwrite it. Show me the Cofounder bridge block I need to add to AGENTS.md.
- If AGENTS.md does not exist, let Cofounder create it.

After setup, summarize exactly what changed and tell me to reopen Codex from this project directory if MCP configuration changed.
```

Codex should check the machine-level MCP entry and the project-level `.cofounder/` config, then choose the right path.

If you prefer to run the commands yourself, create a team and install the Codex MCP entry:

```bash
cd my-project
npm create cofounder@latest -- --setup-codex --yes
codex
```

For implementation work that should happen in isolated Git worktrees:

```bash
cd my-project
npm create cofounder@latest -- --template worktree --setup-codex --yes
codex
```

Worktree mode requires a Git repository with at least one commit because delegated worktrees are created from `HEAD`.

For an existing package where you want the runtime as a dev dependency:

```bash
npm install --save-dev cofounder-crew
npx cofounder init --template worktree
npx cofounder setup codex --install
codex
```

## How It Feels

After installation, you should not need to remember task commands.

Talk to Codex:

```text
Use the Cofounder team. Show me who is available.
```

```text
Plan this feature, delegate implementation to the right teammate, and keep me posted.
```

```text
Ask backend to inspect this repo and summarize the implementation boundaries.
```

```text
Ask reviewer to review backend's last diff before we apply it.
```

```text
Help me add a database teammate with stricter MCP access.
```

Codex should act as the orchestrator, not as a single do-everything worker.

## What Codex Does

When Cofounder is configured, generated project instructions tell Codex to:

| Rule | Meaning |
| --- | --- |
| Be the Cofounder/orchestrator | Own coordination, monitoring, integration, and the final answer. |
| Delegate proactively | Do not wait for the user to say "delegate" when a teammate owns the work. |
| Respect responsibility boundaries | Do not perform specialist work yourself when a configured member matches the task. |
| Keep tasks focused | Give each teammate the smallest useful slice of work. |
| Inspect before applying | For worktree tasks, review the diff before applying it to the main tree. |

The default generated `AGENTS.md` starts with:

```markdown
## Your Role

You are the Cofounder/orchestrator for this project.

- Proactively use the Cofounder team instead of waiting for the user to ask for delegation.
- For every substantive request, decide whether a configured team member owns the work.
- Do not perform specialist work yourself when a team member's responsibilities match the task.
- Delegate focused tasks to the member whose responsibilities best match the work.
- Keep ownership clear: you own coordination, monitoring, integration, and the final response to the user.
```

## What Gets Installed

```text
AGENTS.md
.cofounder/
  codex-instructions.md
  team.yaml
  members/
    lead/
      prompt.md
      settings.toml
      home/
    backend/
      prompt.md
      settings.toml
      home/
    reviewer/
      prompt.md
      settings.toml
      home/
  memory/
  runs/
  worktrees/
```

Everything important is plain files: prompts, settings, memory notes, task records, logs, generated Codex config, diffs, and final results.

## Existing AGENTS.md

If your project already has `AGENTS.md`, Cofounder will not modify it.

Add this bridge block manually so Codex actually adopts the Cofounder role:

```markdown
## Cofounder Crew

This project uses Cofounder Crew for local AI teamwork. You are the Cofounder/orchestrator for this project. Read .cofounder/codex-instructions.md, use the Cofounder MCP tools, and proactively delegate substantive work to the team member whose responsibilities best match the task. Do not perform specialist work yourself when a configured team member owns that responsibility; coordinate the work, monitor progress, and synthesize the final response.
```

The full generated guidance is always written to `.cofounder/codex-instructions.md`.

## Configuration

The roster lives in `.cofounder/team.yaml`:

```yaml
members:
  backend:
    title: Backend Engineer
    responsibilities:
      - inspect and modify code
      - understand implementation boundaries
      - write focused tests
    can_call:
      - reviewer
```

Each teammate has a prompt and settings:

```text
.cofounder/members/backend/
  prompt.md
  settings.toml
  home/
```

Example member settings:

```toml
model = "gpt-5.5"
sandbox = "workspace-write"
approval = "never"
reasoning_effort = "high"

[write]
mode = "worktree"

[mcp]
mode = "inherit"
allow = []

[memory]
project = true
member = true
max_snippets = 5
```

Ask Codex to edit these files when you want to add teammates, change responsibility boundaries, tune model settings, or restrict MCP access.

## Codex MCP Tools

Cofounder exposes the team runtime to Codex through MCP:

| Tool | Purpose |
| --- | --- |
| `team.list` | Read the roster and responsibility map. |
| `team.capabilities` | Inspect what the runtime can do. |
| `team.delegate` | Start a delegated task. |
| `team.status` | Check task status and metadata. |
| `team.logs` | Read task events and logs. |
| `team.diff` | Inspect a worktree task patch. |
| `team.apply` | Apply a worktree task patch to the main tree. |
| `team.cancel` | Cancel a running task. |
| `team.interrupt` | Cancel and resume with steering instructions. |

Manual MCP setup:

```bash
codex mcp add cofounder -- npx -y --package cofounder-crew -- cofounder mcp
```

## Write Modes

| Mode | Behavior | Use when |
| --- | --- | --- |
| `direct` | Runs the teammate in the project working tree. | You want the simplest setup. |
| `worktree` | Runs implementation work in `.cofounder/worktrees/<task_id>`. | You want isolated edits that Codex can inspect before applying. |

Worktree mode creates worktrees from `HEAD`; uncommitted main-tree changes are not copied.

## Scriptable Fallback

The CLI exists for setup, debugging, automation, and CI. It is not the main product surface.

```bash
npx -y --package cofounder-crew -- cofounder setup codex --install
npx -y --package cofounder-crew -- cofounder team
npx -y --package cofounder-crew -- cofounder status <task_id>
npx -y --package cofounder-crew -- cofounder logs <task_id>
npx -y --package cofounder-crew -- cofounder diff <task_id>
npx -y --package cofounder-crew -- cofounder apply <task_id>
```

## Interruption

Codex `exec` does not expose confirmed live mid-turn input. Cofounder Crew uses cancel-and-resume:

1. capture or discover the Codex session id,
2. cancel the running process,
3. start a new task with `codex exec resume <session_id>`.

Capabilities report this honestly:

```json
{
  "live_interrupt": false,
  "interrupt_mode": "cancel-resume"
}
```

## Packages

There are two npm packages because `npm create cofounder` maps to the initializer package `create-cofounder`, while the runtime lives in `cofounder-crew`.

| Package | Role |
| --- | --- |
| `create-cofounder` | Initializer used by `npm create cofounder@latest`. |
| `cofounder-crew` | Runtime package exposing `cofounder` and `cofounder-mcp`. |

The package name `cofounder` is already taken on npm, so the runtime package is published as `cofounder-crew`.

## Development

```bash
npm install
npm run check
npm test
npm run build
```

Local initializer test:

```bash
COFOUNDER_CLI=/absolute/path/to/dist/src/cli.js \
  node packages/create-cofounder/index.js --template worktree --yes
```
