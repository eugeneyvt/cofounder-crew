# Updating

Updates should be conservative. Do not re-run init over an existing team, and do not overwrite member prompts, settings, memory, MCP config, or `AGENTS.md`.

## Codex Prompt

Paste this into Codex from the project you want to update:

```text
Update Cofounder Crew in this project.

Inspect first:
- latest npm versions for cofounder-crew and create-cofounder
- whether package.json contains cofounder-crew
- installed project version with npm ls cofounder-crew --depth=0 when package.json exists
- whether Codex MCP server "cofounder" exists and points to: npx -y --package cofounder-crew -- cofounder serve mcp
- whether .cofounder/team.yaml, member prompts/settings, memory, MCP config, project_context mode, and AGENTS.md exist
- whether .cofounder/.gitignore ignores runs/, worktrees/, and members/*/home/

Then update safely:
- If cofounder-crew is installed in package.json, update it with npm.
- If MCP is missing or wrong, repair it.
- Do not re-run init over existing .cofounder/.
- Do not overwrite member prompts, settings, memory, MCP config, or AGENTS.md.
- If runtime ignore entries are missing, report the recommended entries but do not add them automatically.
- If project_context.mode is manual, ask before syncing .cofounder/project.md.
- If MCP changed, tell me to restart Codex from this project directory.

Summarize old versions, new versions, changed files, and manual follow-ups.
```

## Command

Run the latest updater from npm:

```bash
npx -y --package cofounder-crew@latest -- cofounder update --setup-codex --yes
```

What it does:

- updates `cofounder-crew` in `package.json` when the project already depends on it
- repairs the Codex MCP entry when `--setup-codex` is passed
- runs `cofounder doctor`
- leaves `.cofounder/`, prompts, settings, memory, MCP files, and `AGENTS.md` untouched

Check npm versions:

```bash
npm view cofounder-crew version
npm view create-cofounder version
npm ls cofounder-crew --depth=0
```

Manual context refresh when using `project_context.mode = "manual"`:

```bash
cofounder context sync
```

Restart Codex after changing the MCP entry.
