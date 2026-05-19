# create-cofounder

Initializer for Cofounder Crew projects.

```bash
npm create cofounder@latest -- --setup-codex
codex
```

This creates a `.cofounder/` team skeleton, adds `.cofounder/.gitignore` for run/worktree artifacts, derives `.cofounder/project.md` from `AGENTS.md` when available, adds Codex-facing project instructions when `AGENTS.md` is not already present, and can install the Codex MCP entry.

Each member can be given focused capabilities through its `settings.toml`: project-owned MCP servers from `.cofounder/mcp/`, selected MCP servers from the primary Codex config, selected project skills from `.agents/skills/`, project-owned member-only skills from `.cofounder/skills/`, or selected existing user/global skills linked into that member's runtime home.

If `AGENTS.md` already exists, Cofounder will not modify it. Add the short Cofounder bridge block printed by the initializer so Codex knows to read `.cofounder/codex-instructions.md`.

After initialization, the intended interface is Codex chat:

```text
Use the Cofounder team. Show me who is available.
Ask backend to inspect this repo.
Help me add or adjust a Cofounder teammate.
```

For CLI onboarding and edits, use:

```bash
npm install -g cofounder-crew@latest
cofounder start
cofounder add
cofounder doctor
```

The `worktree` template requires a Git repository with at least one commit before delegated tasks can run in isolated worktrees.
