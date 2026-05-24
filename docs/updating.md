# Updating

Updates should be conservative. Do not re-run init over an existing team, and do not overwrite member prompts, settings, memory, MCP config, or `AGENTS.md`.

## Codex Prompt

Paste this into Codex from the project you want to update:

```text
Update Cofounder Crew in this project.

Inspect first:
- whether command -v cofounder succeeds
- whether npm ls -g cofounder-crew --depth=0 works
- whether package.json contains cofounder-crew as an intentional project-local pin
- whether Codex MCP server "cofounder" exists and points to: npx -y --package cofounder-crew -- cofounder serve mcp
- whether .cofounder/team.yaml, member prompts/settings, memory, MCP config, project_context mode, and AGENTS.md exist
- whether .cofounder/.gitignore ignores runs/, worktrees/, and members/*/home/

Then update safely:
- If the global cofounder command is missing or behind npm latest, install it with npm install -g cofounder-crew@latest.
- If cofounder-crew is pinned in package.json, report it and only update that pin when I explicitly ask.
- If MCP is missing or wrong, repair it.
- Do not re-run init over existing .cofounder/.
- Do not add cofounder-crew to package.json during update.
- Do not overwrite member prompts, settings, memory, MCP config, or AGENTS.md.
- If runtime ignore entries are missing, report the recommended entries but do not add them automatically.
- If project_context.mode is manual, ask before syncing .cofounder/project.md.
- If MCP changed, tell me to restart Codex from this project directory.

Summarize old versions, new versions, changed files, and manual follow-ups.
```

## Command

Default flow:

```bash
cofounder update
```

Non-interactive:

```bash
cofounder update --yes
```

If the global command is not available, run the latest updater from npm:

```bash
npx -y --package cofounder-crew@latest -- cofounder update --yes
```

What it does:

- checks whether the global CLI is behind npm latest and updates it when confirmed
- repairs the Codex MCP entry by default
- runs `cofounder doctor`
- leaves `.cofounder/`, prompts, settings, memory, MCP files, `package.json`, and `AGENTS.md` untouched

Use `cofounder update --yes` for a non-interactive run that also updates an outdated global CLI automatically.

Skip MCP repair when you only want checks:

```bash
cofounder update --no-setup-codex
```

Update a globally installed `cofounder` command directly:

```bash
cofounder self update
```

Project-local pinning is optional and explicit:

```bash
cofounder pin
```

Check npm versions:

```bash
npm view cofounder-crew version
npm view create-cofounder version
npm ls -g cofounder-crew --depth=0
npm ls cofounder-crew --depth=0 # only for pinned projects
```

Manual context refresh when using `project_context.mode = "manual"`:

```bash
cofounder context sync
```

Restart Codex after changing the MCP entry.
