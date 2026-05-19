# create-cofounder

Initializer for Cofounder Crew projects.

```bash
npm create cofounder@latest -- --setup-codex --yes
codex
```

This creates a `.cofounder/` team skeleton, adds an internal `.cofounder/.gitignore` for run/worktree artifacts, adds Codex-facing project instructions when `AGENTS.md` is not already present, and can install the Codex MCP entry.

If `AGENTS.md` already exists, Cofounder will not modify it. Add the short Cofounder bridge block printed by the initializer so Codex knows to read `.cofounder/codex-instructions.md`.

After initialization, the intended interface is Codex chat:

```text
Use the Cofounder team. Show me who is available.
Ask backend to inspect this repo.
Help me add or adjust a Cofounder teammate.
```

The `worktree` template requires a Git repository with at least one commit before delegated tasks can run in isolated worktrees.
