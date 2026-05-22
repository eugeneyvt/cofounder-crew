# FAQ

## Does Cofounder replace Codex?

No. Codex remains the interface. Cofounder adds a local team runtime and MCP tools so Codex can delegate work to focused teammates.

## Should I commit `.cofounder/`?

Commit the team configuration that is part of the project:

- `.cofounder/team.yaml`
- member prompts and settings
- project-owned MCP definitions that do not contain secrets
- team-owned skills
- curated memory if your team wants it shared and it contains no secrets

Do not commit generated runtime state:

- `.cofounder/runs/`
- `.cofounder/worktrees/`
- `.cofounder/members/*/home/`

Cofounder creates `.cofounder/.gitignore` for those runtime folders.

## Can different members have different MCP servers?

Yes. In a member `settings.toml`:

```toml
[mcp]
mode = "isolated"
from_main = ["github"]
team = ["pencil"]
oauth_credentials_store = "keyring"
tool_approval = "approve"
```

`from_main` selects existing MCP servers from the primary Codex config. `team` selects project-owned MCP servers from `.cofounder/mcp/`.

For OAuth-backed remote MCP servers, keep `oauth_credentials_store = "keyring"` so isolated member `CODEX_HOME` configs can reuse the OS keychain instead of requiring a separate login. Cofounder does not redirect `HOME` for member runs, because macOS keychain access depends on the normal user home. `cofounder mcp assign <server> <member> --source main` sets this automatically.

For non-interactive delegated members, use `tool_approval = "approve"` for MCP servers the member is trusted to call. Without it, Codex may ask for MCP tool approval and the worker run can report `user cancelled MCP tool call`.

## Can different members have different skills?

Yes. In a member `settings.toml`:

```toml
[skills]
mode = "isolated"
from_project = ["api-workflow"]
from_main = ["uncodixfy"]
team = ["design-review"]
```

Project skills live in `.agents/skills/`. Team-only skills live in `.cofounder/skills/`. Main skills are selected from the existing user/global Codex skill roots.

`skills.mode = "inherit"` is different: it lets the member use the primary Codex skill environment and does not create an isolated member skill scope. It is not the right fix for MCP OAuth; use `mcp.oauth_credentials_store = "keyring"` for that.

## Why does Cofounder need an AGENTS.md bridge?

The primary Codex session needs to know it should act as the Cofounder/orchestrator. The bridge points Codex to `.cofounder/codex-instructions.md` and tells it to delegate proactively when a teammate owns the work.

In automatic context mode, Cofounder strips that orchestrator text before building worker context, so workers receive project rules without being told they are the orchestrator.

## Why does worktree mode require one commit?

Git worktrees are created from `HEAD`. A repo with no commits has no baseline for a delegated task to branch from.

## Why do worktree task directories disappear after apply?

Cofounder saves the task patch under `.cofounder/runs/<task_id>/` before cleanup. After `cofounder task apply <task_id>` succeeds, the task worktree is removed so completed worktree tasks do not accumulate full project checkouts.

## Does updating npm update everyone automatically?

The MCP entry usually runs:

```bash
npx -y --package cofounder-crew -- cofounder serve mcp
```

That means new Codex sessions resolve the MCP runtime from npm unless your environment has a cache. The global CLI is updated separately:

```bash
cofounder self update
```

Project-local pinning is optional. Add or update it with `cofounder pin` only when the repo should record a Cofounder package dependency.

Restart Codex after changing MCP configuration.

## Is live interrupt supported?

Cofounder supports cancel-resume steering. Codex subprocesses do not currently expose true live stdin steering through this runtime.

```json
{
  "live_interrupt": false,
  "interrupt_mode": "cancel-resume"
}
```
