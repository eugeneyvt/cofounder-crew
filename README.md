<div align="center">
  <img src="https://raw.githubusercontent.com/eugeneyvt/cofounder-crew/main/assets/cofounder_crew_social.png" alt="Cofounder Crew - local AI teams for Codex." />
  <br />
  <h1>Cofounder Crew</h1>
  <p>
    Turn one Codex session into a local AI team for your repo.
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
    <a href="#agentsmd-bridge">AGENTS.md</a>
    ·
    <a href="#why-it-exists">Why</a>
    ·
    <a href="#how-it-works">How It Works</a>
    ·
    <a href="#configure-the-team">Configure</a>
    ·
    <a href="#docs">Docs</a>
  </p>
</div>

## What It Is

Cofounder Crew is a plain-file team runtime for Codex.

You keep using Codex as the interface. Cofounder adds a project-local `.cofounder/` folder, a small MCP server, and a roster of teammates that Codex can delegate to. Each teammate can have its own prompt, model, sandbox, write mode, memory, MCP servers, and native Codex skills.

The result is simple: open Codex in a repo, talk normally, and let Codex coordinate focused workers instead of stuffing every role and every tool into one context.

## Quickstart

Fastest path: open Codex in your project and paste the bootstrap prompt.

<details>
<summary><strong>Copy Codex bootstrap prompt</strong></summary>

```text
Set up Cofounder Crew in this project and explain each meaningful action as you go.

Use https://github.com/eugeneyvt/cofounder-crew as the reference if you need more context. Work from the current project cwd. Do not commit, push, publish, or overwrite existing AGENTS.md or .cofounder files without asking.

Goal:
- make the global cofounder command available
- initialize or repair the project-local Cofounder setup
- install or repair the Codex MCP entry
- verify the setup
- tell me exactly how to start using the team from Codex

Process:

1. Inspect the current state first.
   Check:
   - current cwd
   - node --version and npm --version
   - codex --version
   - whether command -v cofounder succeeds
   - whether package.json exists
   - whether package.json already contains cofounder-crew in dependencies or devDependencies
   - whether .cofounder/team.yaml exists
   - whether AGENTS.md exists
   - whether AGENTS.md contains the Cofounder Crew bridge
   - whether this is a Git repo
   - whether Git HEAD exists
   - whether Codex MCP server "cofounder" exists and points to:
     npx -y --package cofounder-crew -- cofounder serve mcp

2. Install the global CLI when needed.
   - If command -v cofounder fails, run:
     npm install -g cofounder-crew@latest
   - Do not add cofounder-crew to package.json unless I explicitly ask for project-local pinning.
   - If global install fails or is not allowed, use the one-off npm runner:
     npx -y --package cofounder-crew@latest -- cofounder <command>
     and substitute that prefix for `cofounder` in the commands below.

3. Initialize or repair with the CLI.
   - If .cofounder/team.yaml is missing, run:
     cofounder start --setup-codex --yes
   - If .cofounder/team.yaml already exists, do not re-run init. Run the safe updater instead:
     cofounder update --yes
   - Use --template worktree only if I explicitly asked for isolated worktrees or this repo clearly already uses that workflow. Worktree mode requires a Git repo with at least one commit.

4. Preserve user-owned files.
   - Do not overwrite AGENTS.md.
   - If AGENTS.md exists but the Cofounder bridge is missing, show me the exact bridge block and explain that I should add it for proactive delegation.
   - Do not overwrite existing member prompts, member settings, memory files, or project-owned MCP files.
   - Do not add root .gitignore entries automatically. Only report recommended ignore entries if they are missing.

5. Verify before claiming success.
   Run:
   - cofounder doctor
   - codex mcp get cofounder, if Codex CLI is available
   - npm ls -g cofounder-crew --depth=0, if global npm installs are available
   - npm ls cofounder-crew --depth=0 only if the project is intentionally pinned

6. Final response format.
   Tell me:
   - whether Cofounder is available globally or via the one-off npm runner
   - which files were created or changed
   - whether AGENTS.md needs a manual bridge block
   - whether I need to restart Codex
   - the first message to send after restart:
     Use the Cofounder team. Show me who is available.
   - the 3 most useful follow-up commands:
     cofounder add
     cofounder doctor
     cofounder team

Do not stop after printing commands unless a command would be unsafe. Actually perform the safe setup steps, then report the result.
If a verification step fails, do not say the setup is complete. Explain the failure and the next command or manual step needed.
```

</details>

The same prompt is available at [docs/prompts/bootstrap-codex.md](https://github.com/eugeneyvt/cofounder-crew/blob/main/docs/prompts/bootstrap-codex.md).

Terminal setup:

```bash
npm install -g cofounder-crew@latest
cd my-project
cofounder start --setup-codex
codex
```

For non-interactive setup:

```bash
cofounder start --setup-codex --yes
```

For isolated implementation tasks, use the worktree template. It requires a Git repo with at least one commit:

```bash
cofounder start --template worktree --setup-codex
codex
```

Then ask Codex:

```text
Use the Cofounder team. Show me who is available.
```

## AGENTS.md Bridge

Codex will not reliably act as the Cofounder orchestrator unless `AGENTS.md` tells it to load the project Cofounder instructions.

If the project does not have `AGENTS.md`, `cofounder start` creates one. If `AGENTS.md` already exists, Cofounder will not overwrite it; add this block manually:

```markdown
## Cofounder Crew

This project uses Cofounder Crew for local AI teamwork. You are the Cofounder/orchestrator for this project. Read .cofounder/codex-instructions.md, use the Cofounder MCP tools, and proactively delegate substantive work to the team member whose responsibilities best match the task. Do not perform specialist work yourself when a configured team member owns that responsibility; coordinate the work, monitor progress, and synthesize the final response.
```

Keep this block stable. In automatic context mode, Cofounder strips the orchestrator block before building worker context, so teammates receive project rules without being told they are the main orchestrator.

Check it with:

```bash
cofounder doctor
```

## How It Feels

You keep talking to Codex. Cofounder turns the background work into delegated, inspectable tasks.

```text
You: Plan this billing change and use the team.

Codex: I will ask backend to inspect the implementation boundary, then ask reviewer to check the patch.

Cofounder:
- backend runs in an isolated worktree
- reviewer checks the diff
- Codex reads the results, applies only what you approve, and gives you the final summary
```

## Why It Exists

Most "AI crew" tools start with a UI, a server, or a framework. Cofounder starts with the thing you already use: Codex in your repo.

| What you get | Why it matters |
| --- | --- |
| Codex stays the interface | No new app to learn. Chat with Codex and let it orchestrate. |
| Local plain files | Team config, prompts, memory, runs, and worktrees are inspectable in the repo. |
| Focused teammates | Backend, reviewer, designer, or any custom role can have its own instructions and settings. |
| Scoped MCP | Give Pencil to a designer, GitHub to a reviewer, or no tools to a strict review agent. |
| Scoped skills | Assign selected project skills, selected user skills, or team-only skills per teammate. |
| Worktree execution | Let workers make patches in isolated Git worktrees before you apply them. |
| Observable delegation | Codex can list the team, delegate, wait, inspect logs, read results, review diffs, cancel, and interrupt. |

Good fit:

- repos where Codex already does useful work, but needs clearer role boundaries
- teams that want local, inspectable configuration instead of a hosted agent dashboard
- projects with specialist tools that should not be exposed to every agent

Not the goal:

- replacing Codex
- running a hosted orchestration platform
- hiding prompts, logs, memory, or task output behind a private control plane

## How It Works

Cofounder installs one MCP server into Codex:

```bash
codex mcp add cofounder -- npx -y --package cofounder-crew -- cofounder serve mcp
```

Inside each project, Cofounder creates:

```text
.cofounder/
  team.yaml                 # roster, responsibilities, context mode
  codex-instructions.md     # orchestrator instructions for the primary Codex session
  project.md                # worker-safe project context
  members/<member>/         # prompt, settings, runtime home
  mcp/                      # project-owned MCP servers
  skills/                   # team-only skills
  memory/                   # project and member memory notes
  runs/                     # task records, logs, results
  worktrees/                # optional isolated task worktrees
```

The primary Codex session reads the Cofounder instructions and uses MCP tools to coordinate the team. Delegated teammates still run from the original project cwd, but with their own Codex settings and runtime home when isolation is needed.

## Configure The Team

The guided flow covers the common edits:

```bash
cofounder start
cofounder add
cofounder doctor
```

Deterministic commands are available for agents and scripts:

```bash
cofounder member add designer --title "Product Designer" --model gpt-5.5 --write-mode worktree
cofounder mcp add pencil --url https://example.com/mcp --assign designer
cofounder skill add design-review --scope team --assign designer
cofounder skill assign api-workflow backend --scope project
cofounder context mode manual
cofounder context sync
```

If the global command is not available, prefix commands with `npx -y --package cofounder-crew -- cofounder`.

Project skills live in `.agents/skills/` and can also be assigned to teammates. Team-only skills live in `.cofounder/skills/` and are only linked into selected member runtimes.

Common recipes are in [docs/examples.md](https://github.com/eugeneyvt/cofounder-crew/blob/main/docs/examples.md).

## Updating

Safe project update:

```bash
cofounder update
```

If the global command is not available, use the one-off npm runner:

```bash
npx -y --package cofounder-crew@latest -- cofounder update --yes
```

`cofounder update` repairs the Codex MCP entry, runs doctor, and preserves existing `.cofounder/`, member prompts/settings, memory, MCP config, `package.json`, and `AGENTS.md`. Skip MCP repair with `cofounder update --no-setup-codex`.

Update the global CLI itself:

```bash
cofounder self update
```

Project-local pinning is optional:

```bash
cofounder pin
```

## Docs

| Topic | Link |
| --- | --- |
| Docs home | [docs/README.md](https://github.com/eugeneyvt/cofounder-crew/blob/main/docs/README.md) |
| Codex bootstrap prompt | [docs/prompts/bootstrap-codex.md](https://github.com/eugeneyvt/cofounder-crew/blob/main/docs/prompts/bootstrap-codex.md) |
| Team configuration, AGENTS.md, context, MCP, and skills | [docs/configuration.md](https://github.com/eugeneyvt/cofounder-crew/blob/main/docs/configuration.md) |
| CLI commands | [docs/cli.md](https://github.com/eugeneyvt/cofounder-crew/blob/main/docs/cli.md) |
| Delegation runtime, worktrees, logs, and interrupts | [docs/runtime.md](https://github.com/eugeneyvt/cofounder-crew/blob/main/docs/runtime.md) |
| Practical examples | [docs/examples.md](https://github.com/eugeneyvt/cofounder-crew/blob/main/docs/examples.md) |
| FAQ | [docs/faq.md](https://github.com/eugeneyvt/cofounder-crew/blob/main/docs/faq.md) |
| Updating an existing project | [docs/updating.md](https://github.com/eugeneyvt/cofounder-crew/blob/main/docs/updating.md) |

## Packages

`create-cofounder` initializes a project with `npm create cofounder@latest`.

`cofounder-crew` provides the `cofounder` CLI and MCP runtime.

## Requirements

- Node.js 22+
- npm
- Codex CLI
- Git with at least one commit when using worktree mode

## Contributing

Local development quick start:

```bash
npm install
npm run check
npm test
npm run build
```

Before opening a pull request, read [CONTRIBUTING.md](https://github.com/eugeneyvt/cofounder-crew/blob/main/CONTRIBUTING.md) and the [Code of Conduct](https://github.com/eugeneyvt/cofounder-crew/blob/main/CODE_OF_CONDUCT.md). Report vulnerabilities through the [Security Policy](https://github.com/eugeneyvt/cofounder-crew/blob/main/SECURITY.md), not public issues.

## Support

Use [GitHub Issues](https://github.com/eugeneyvt/cofounder-crew/issues) for bugs, broken setup flows, and feature requests.

## License

MIT
