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
- install the current Cofounder npm package when this project has package.json
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
   - whether package.json exists
   - whether package.json already contains cofounder-crew in dependencies or devDependencies
   - whether .cofounder/team.yaml exists
   - whether AGENTS.md exists
   - whether AGENTS.md contains the Cofounder Crew bridge
   - whether this is a Git repo
   - whether Git HEAD exists
   - whether Codex MCP server "cofounder" exists and points to:
     npx -y --package cofounder-crew -- cofounder serve mcp

2. Install the package before using the local CLI when package.json exists.
   - If package.json exists, run:
     npm install --save-dev cofounder-crew@latest
   - If package.json does not exist, do not create package.json just for Cofounder. Use npm create or npx with --package instead.
   - Do not install Cofounder globally.
   - If npx cofounder cannot resolve after install, use:
     npx -y --package cofounder-crew@latest -- cofounder <command>

3. Initialize or repair with the CLI.
   - If .cofounder/team.yaml is missing and package.json exists, run:
     npx cofounder start --setup-codex --yes
   - If .cofounder/team.yaml is missing and package.json does not exist, run:
     npm create cofounder@latest -- --setup-codex --yes
   - If .cofounder/team.yaml already exists, do not re-run init. Run the safe updater instead:
     npx cofounder update --setup-codex --yes
     or, without a local dependency:
     npx -y --package cofounder-crew@latest -- cofounder update --setup-codex --yes
   - Use --template worktree only if I explicitly asked for isolated worktrees or this repo clearly already uses that workflow. Worktree mode requires a Git repo with at least one commit.

4. Preserve user-owned files.
   - Do not overwrite AGENTS.md.
   - If AGENTS.md exists but the Cofounder bridge is missing, show me the exact bridge block and explain that I should add it for proactive delegation.
   - Do not overwrite existing member prompts, member settings, memory files, or project-owned MCP files.
   - Do not add root .gitignore entries automatically. Only report recommended ignore entries if they are missing.

5. Verify before claiming success.
   Run:
   - npx cofounder doctor
   - codex mcp get cofounder, if Codex CLI is available
   - npm ls cofounder-crew --depth=0, if package.json exists

6. Final response format.
   Tell me:
   - what package/version is installed or selected
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

Terminal setup is one command, then open Codex:

```bash
cd my-project
npm create cofounder@latest -- --setup-codex
codex
```

For non-interactive setup:

```bash
npm create cofounder@latest -- --setup-codex --yes
```

For isolated implementation tasks, use the worktree template. It requires a Git repo with at least one commit:

```bash
npm create cofounder@latest -- --template worktree --setup-codex
codex
```

Then ask Codex:

```text
Use the Cofounder team. Show me who is available.
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
npx -y --package cofounder-crew -- cofounder start
npx -y --package cofounder-crew -- cofounder add
npx -y --package cofounder-crew -- cofounder doctor
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

If the runtime is not installed locally, prefix commands with `npx -y --package cofounder-crew -- cofounder`.

Project skills live in `.agents/skills/` and can also be assigned to teammates. Team-only skills live in `.cofounder/skills/` and are only linked into selected member runtimes.

Common recipes are in [docs/examples.md](https://github.com/eugeneyvt/cofounder-crew/blob/main/docs/examples.md).

## Updating

Safe project update:

```bash
npx -y --package cofounder-crew@latest -- cofounder update --setup-codex --yes
```

Cofounder update flows should preserve existing `.cofounder/`, member prompts/settings, memory, MCP config, and `AGENTS.md`. If runtime ignore entries are missing, Cofounder should report the recommendation instead of changing your Git ignore rules automatically.

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

## Support

Use [GitHub Issues](https://github.com/eugeneyvt/cofounder-crew/issues) for bugs, broken setup flows, and feature requests.

## License

MIT
