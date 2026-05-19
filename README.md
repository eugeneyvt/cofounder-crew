<div align="center">
  <h1>Cofounder Crew</h1>
  <p>
    Conversation-first local AI teams for Codex.
    <br />
    No dashboard. No orchestration server. No new IDE.
  </p>
  <p>
    <a href="https://www.npmjs.com/package/create-cofounder"><img src="https://img.shields.io/npm/v/create-cofounder?label=create-cofounder" alt="create-cofounder npm version" /></a>
    <a href="https://www.npmjs.com/package/cofounder-crew"><img src="https://img.shields.io/npm/v/cofounder-crew?label=cofounder-crew" alt="cofounder-crew npm version" /></a>
    <img src="https://img.shields.io/badge/node-22%2B-339933" alt="Node.js 22+" />
    <img src="https://img.shields.io/badge/Codex-first-111827" alt="Codex first" />
    <img src="https://img.shields.io/badge/MCP-enabled-4f46e5" alt="MCP enabled" />
  </p>
  <p>
    <a href="#quickstart">Quickstart</a>
    ·
    <a href="#using-the-team">Using The Team</a>
    ·
    <a href="#configuration">Configuration</a>
    ·
    <a href="#updating">Updating</a>
    ·
    <a href="#cli">CLI</a>
  </p>
</div>

## What It Is

Cofounder Crew gives a project-local team to the Codex session you already use.

You initialize a project once, open Codex in that directory, and talk normally. Codex becomes the Cofounder/orchestrator: it reads the roster, delegates focused work to configured teammates, waits for results, reviews outputs, and owns the final response back to you.

Everything is stored as plain files in the project. There is no web app, hosted control plane, or separate editor.

## Quickstart

Open Codex in the project you want to configure and paste:

```text
Install and configure Cofounder Crew for this computer and this project.
Use https://github.com/eugeneyvt/cofounder-crew as the source/reference if you need more context.

Before changing anything, inspect:
- Node.js and npm are available, and Node is >=22.
- Whether this project already has .cofounder/.
- Whether this project already has AGENTS.md.
- Whether cofounder-crew is already installed in package.json.
- Whether Codex already has an MCP server named "cofounder".
- Whether this is a Git repo with at least one commit.

Then choose the smallest safe setup:
- If .cofounder/ is missing, initialize Cofounder. Use the worktree template only when the repo has at least one commit; otherwise use the default template.
- If .cofounder/ already exists, do not reinitialize it. Verify the files, report the project_context mode, and report whether .cofounder/.gitignore ignores runs/, worktrees/, and members/*/home/. Do not change .cofounder/.gitignore unless I explicitly ask.
- Keep project_context.mode as auto unless I ask for a manually curated .cofounder/project.md.
- If this project has package.json, prefer a dev dependency install. Otherwise use npm create.
- Install or repair the Codex MCP entry only if it is missing or wrong.
- If AGENTS.md already exists, do not overwrite it. Show me the Cofounder bridge block to add.
- If AGENTS.md does not exist, let Cofounder create it.

After setup, summarize exactly what changed and tell me whether I need to restart Codex.
```

Manual setup:

```bash
cd my-project
npm create cofounder@latest -- --setup-codex --yes
codex
```

For isolated implementation work in Git worktrees:

```bash
cd my-project
npm create cofounder@latest -- --template worktree --setup-codex --yes
codex
```

Worktree mode requires a Git repository with at least one commit.

For an existing package where you want the runtime pinned in `devDependencies`:

```bash
npm install --save-dev cofounder-crew
npx cofounder init --template worktree
npx cofounder setup codex --install
codex
```

## Using The Team

After installation, the main interface is Codex chat:

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

Codex should delegate when a configured teammate owns the work. It should also wait for a real result before treating delegated work as complete.

## What Gets Installed

```text
AGENTS.md
.cofounder/
  .gitignore
  codex-instructions.md
  project.md
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

`AGENTS.md` is for the primary Codex session. It tells Codex to act as the Cofounder/orchestrator.

Worker project context has two modes:

```yaml
project_context:
  mode: auto
  file: project.md
```

`auto` is the default. Each delegated worker gets fresh context derived from `AGENTS.md`, with the Cofounder bridge/orchestrator text removed. Project rules after the bridge are preserved even when there is no following heading.

`manual` makes workers read `.cofounder/project.md` instead. Use it when you want a curated worker context that does not change until you edit or sync it.

```yaml
project_context:
  mode: manual
  file: project.md
```

Refresh the manual snapshot with:

```bash
npx cofounder sync project
```

Generated task logs, worktrees, and member runtime home files are ignored by `.cofounder/.gitignore`.

## Existing AGENTS.md

If `AGENTS.md` already exists, Cofounder will not overwrite it.

Add this bridge block so Codex adopts the Cofounder role:

```markdown
## Cofounder Crew

This project uses Cofounder Crew for local AI teamwork. You are the Cofounder/orchestrator for this project. Read .cofounder/codex-instructions.md, use the Cofounder MCP tools, and proactively delegate substantive work to the team member whose responsibilities best match the task. Do not perform specialist work yourself when a configured team member owns that responsibility; coordinate the work, monitor progress, and synthesize the final response.
```

When `project_context.mode` is `auto`, keep this bridge text unchanged unless you know why you are changing it. Cofounder recognizes this orchestrator text and removes it from delegated worker context, so workers receive project rules without being told that they are the main orchestrator.

Cofounder keeps the full generated guidance in `.cofounder/codex-instructions.md`.

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

Example settings:

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

[runner.codex]
include_project_doc = false
json = true
extra_args = []
use_member_home = false
```

Useful settings:

| Setting | Purpose |
| --- | --- |
| `write.mode = "direct"` | Run the teammate in the main working tree. |
| `write.mode = "worktree"` | Run implementation in `.cofounder/worktrees/<task_id>` for review before apply. |
| `mcp.mode = "inherit"` | Give the teammate the same Codex MCP environment. |
| `mcp.mode = "none"` | Keep the teammate local-only. The generated reviewer uses this default. |
| `mcp.mode = "allowlist"` | Give the teammate only selected MCP servers. |
| `include_project_doc = false` | Prevent raw `AGENTS.md` from being injected by Codex. Cofounder supplies worker-safe project context itself. |

## MCP Tools

Cofounder exposes the team runtime to Codex through MCP:

| Tool | Purpose |
| --- | --- |
| `team.list` | Read the roster and responsibility map. |
| `team.capabilities` | Inspect runtime capabilities. |
| `team.delegate` | Start a delegated task. |
| `team.wait` | Wait for a task and return status, result, and recent logs. |
| `team.result` | Read a task result with explicit empty/truncated flags. |
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

Restart Codex after changing MCP configuration.

## Updating

Paste this into Codex from the project you want to update:

```text
Update Cofounder Crew for this computer and this project.

Inspect first:
- Latest npm versions for cofounder-crew and create-cofounder.
- Whether this project has cofounder-crew in package.json.
- The installed project version with `npm ls cofounder-crew --depth=0` when package.json exists.
- Whether Codex MCP server "cofounder" exists and points at `npx -y --package cofounder-crew -- cofounder mcp`.
- Whether .cofounder/team.yaml, project_context mode, member prompts/settings, .cofounder/project.md, and .cofounder/.gitignore exist.
- Whether .cofounder/.gitignore ignores runs/, worktrees/, and members/*/home/.
- Whether AGENTS.md contains the Cofounder bridge block.

Then update safely:
- If cofounder-crew is installed in package.json, update it with npm.
- If MCP is missing or wrong, repair it.
- Do not re-run init over an existing .cofounder/.
- Do not overwrite team prompts, settings, memory, or AGENTS.md.
- If .cofounder/.gitignore is missing entries, report the recommended entries but do not add them without explicit approval.
- If project_context mode is manual, run `cofounder sync project` if you want to refresh .cofounder/project.md from AGENTS.md.
- If generated instructions changed, show me any bridge/config changes to apply manually.
- If MCP changed, tell me to restart Codex from this project directory.

Summarize old versions, new versions, changed files, and manual follow-ups.
```

Manual update commands:

```bash
npm install --save-dev cofounder-crew@latest

# Optional: inspect recommended runtime ignore entries without changing files.
printf "runs/\nworktrees/\nmembers/*/home/\n"

# Optional when project_context.mode is manual:
npx cofounder sync project

codex mcp remove cofounder
codex mcp add cofounder -- npx -y --package cofounder-crew -- cofounder mcp

npm view cofounder-crew version
npm ls cofounder-crew --depth=0
codex mcp get cofounder
```

## CLI

The CLI is for setup, debugging, automation, and fallback workflows.

```bash
npx -y --package cofounder-crew -- cofounder setup codex --install
npx -y --package cofounder-crew -- cofounder sync project
npx -y --package cofounder-crew -- cofounder team
npx -y --package cofounder-crew -- cofounder status <task_id>
npx -y --package cofounder-crew -- cofounder logs <task_id>
npx -y --package cofounder-crew -- cofounder diff <task_id>
npx -y --package cofounder-crew -- cofounder apply <task_id>
```

## Interruption

Codex `exec` currently runs delegated tasks as subprocesses. Cofounder supports cancellation and resume-based steering:

1. discover the Codex session id,
2. cancel the running process,
3. start a resumed task with revised instructions.

The runtime reports this as:

```json
{
  "live_interrupt": false,
  "interrupt_mode": "cancel-resume"
}
```

## Development

```bash
npm install
npm run check
npm test
npm run build
```

## Publishing

Publishing runs through GitHub Actions and npm Trusted Publishing.

One-time npm setup for both packages:

| Package | Trusted publisher |
| --- | --- |
| `cofounder-crew` | GitHub Actions, `eugeneyvt/cofounder-crew`, workflow `publish-npm.yml` |
| `create-cofounder` | GitHub Actions, `eugeneyvt/cofounder-crew`, workflow `publish-npm.yml` |

Release flow:

```bash
npm version <new-version> --no-git-tag-version
npm version <new-version> --workspace create-cofounder --no-git-tag-version
git add package.json package-lock.json packages/create-cofounder/package.json
git commit -m "chore: release v<new-version>"
git tag v<new-version>
git push origin main --tags
```

Then publish the GitHub release for the new `vX.Y.Z` tag. The workflow checks, builds, tests, and publishes both npm packages.
