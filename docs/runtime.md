# Runtime

Cofounder exposes the team to Codex through one MCP server. The primary Codex session coordinates tasks, while delegated members run as Codex subprocesses from the original project working directory.

## MCP Tools

| Tool | Purpose |
| --- | --- |
| `team.list` | Read the roster and responsibility map. |
| `team.capabilities` | Inspect runtime capabilities. |
| `team.delegate` | Start a delegated task. |
| `team.wait` | Wait briefly and return current status, recent logs, and result metadata. |
| `team.result` | Read the final result with explicit empty and truncated flags. |
| `team.status` | Check task status and metadata. |
| `team.logs` | Read task events and logs. |
| `team.diff` | Inspect a worktree task patch. |
| `team.apply` | Apply a worktree task patch to the main tree. |
| `team.cancel` | Cancel a running task. |
| `team.interrupt` | Cancel and resume with steering instructions. |

## Task Files

Each delegated task creates a run directory:

```text
.cofounder/runs/<task_id>/
  task.json
  prompt.md
  events.jsonl
  stdout.log
  stderr.log
  result.md
```

Worktree tasks can also produce an apply patch after completion.

`team.wait` timing out means the task is still running, not failed. Always check `team.status`, `team.logs`, and `team.result` before claiming delegated work is done.

An empty `result.md` means the delegated task did not return a usable final answer. Treat that as incomplete work, even if the subprocess ran commands.

## Nested Delegation

The primary Codex session is the orchestrator. The default team roster contains specialists only; there is no delegated `lead` member.

Delegated members receive explicit nested delegation rules in their task prompt:

- complete the assigned task directly when possible
- delegate only to allowed `can_call` targets
- pass their own member id as `caller` when they call `team.delegate`
- never delegate to themselves
- never delegate back to `primary`; the primary Codex session owns final orchestration
- stop retrying if Cofounder MCP calls fail or are unavailable, then continue the assigned task and report that nested delegation was unavailable if it matters

## Direct Mode

```toml
[write]
mode = "direct"
```

The member runs in the main working tree. Use this for read-only analysis, reviews, or small trusted edits.

## Worktree Mode

```toml
[write]
mode = "worktree"
```

The member runs in `.cofounder/worktrees/<task_id>`. The primary Codex session can inspect the patch with:

```bash
cofounder task diff <task_id>
```

Apply it with:

```bash
cofounder task apply <task_id>
```

Worktree mode requires a Git repository with at least one commit.

## Interruption

Codex `exec` subprocesses do not currently support true live stdin steering. Cofounder uses cancel-resume:

1. identify the running task
2. cancel the process
3. resume with revised instructions

Runtime capabilities report this as:

```json
{
  "live_interrupt": false,
  "interrupt_mode": "cancel-resume"
}
```

## Member Runtime

When a member needs isolated MCP or skills, Cofounder prepares a member runtime home under:

```text
.cofounder/members/<member>/home/
```

This directory can contain generated Codex config, linked skills, and a symlink to the local Codex auth file. It is ignored by `.cofounder/.gitignore`.

`skills.mode = "inherit"` means the member uses the primary Codex skill environment and usually does not need a member home. It does not disable the Cofounder member prompt; delegated prompts are assembled by Cofounder and sent directly to `codex exec`.

For OAuth-backed MCP servers assigned with `mcp.from_main`, prefer:

```toml
[mcp]
mode = "isolated"
from_main = ["your-server"]
oauth_credentials_store = "keyring"
```

This keeps the member home and scoped skills while allowing Codex to read MCP OAuth credentials from the OS keychain. `cofounder mcp assign <server> <member> --source main` sets this automatically.
