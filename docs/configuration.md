# Configuration

Cofounder Crew is configured with plain files in the project.

```text
.cofounder/
  team.yaml
  codex-instructions.md
  project.md
  members/<member>/prompt.md
  members/<member>/settings.toml
  members/<member>/home/
  mcp/<server>.toml
  skills/<skill>/SKILL.md
  memory/project.md
  memory/members/<member>.md
```

## AGENTS.md

`AGENTS.md` is for the primary Codex session. It should tell Codex to act as the Cofounder/orchestrator and to use the Cofounder MCP tools.

If `AGENTS.md` already exists, Cofounder does not overwrite it. Add this bridge block manually:

```markdown
## Cofounder Crew

This project uses Cofounder Crew for local AI teamwork. You are the Cofounder/orchestrator for this project. Read .cofounder/codex-instructions.md, use the Cofounder MCP tools, and proactively delegate substantive work to the team member whose responsibilities best match the task. Do not perform specialist work yourself when a configured team member owns that responsibility; coordinate the work, monitor progress, and synthesize the final response.
```

Keep the bridge text stable unless you know why you are changing it. In automatic context mode, Cofounder removes this orchestrator block before building worker context, so delegated workers receive project rules without being told they are the primary orchestrator.

## Project Context

Worker project context supports two modes:

```yaml
project_context:
  mode: auto
  file: project.md
```

`auto` derives worker-safe context from `AGENTS.md` and strips the Cofounder orchestrator block.

`manual` makes workers read `.cofounder/project.md` as the curated project context:

```yaml
project_context:
  mode: manual
  file: project.md
```

Refresh the manual file with:

```bash
cofounder context sync
```

## Team Roster

The roster lives in `.cofounder/team.yaml`.

```yaml
members:
  backend:
    title: Backend Engineer
    runner: codex
    prompt: members/backend/prompt.md
    settings: members/backend/settings.toml
    home: members/backend/home
    responsibilities:
      - inspect and modify code
      - understand implementation boundaries
      - write focused tests
    can_call:
      - reviewer
```

`responsibilities` are how the orchestrator decides who should receive work. `can_call` controls which teammates a member may delegate to.

## Member Settings

Each member has a `settings.toml` file:

```toml
model = "gpt-5.5"
sandbox = "workspace-write"
approval = "never"
reasoning_effort = "high"
live_interrupt = false

[write]
mode = "worktree"

[mcp]
mode = "isolated"
from_main = []
team = ["cofounder"]

[skills]
mode = "isolated"
from_project = []
from_main = []
team = []

[memory]
project = true
member = true
max_snippets = 5

[runner.codex]
json = true
extra_args = []
use_member_home = false
include_project_doc = false
```

Common settings:

| Setting | Purpose |
| --- | --- |
| `model` | Codex model for this teammate. |
| `reasoning_effort` | Codex reasoning setting for this teammate. |
| `sandbox` | Codex sandbox mode. |
| `approval` | Codex approval policy. |
| `write.mode = "direct"` | Run in the main working tree. |
| `write.mode = "worktree"` | Run in `.cofounder/worktrees/<task_id>` and review before apply. |
| `include_project_doc = false` | Let Cofounder provide worker-safe project context instead of raw `AGENTS.md`. |

## MCP Scoping

MCP is scoped per member.

```toml
[mcp]
mode = "isolated"
from_main = ["github"]
team = ["pencil"]
```

`from_main` selects MCP servers from the primary Codex config. By default Cofounder reads `$CODEX_HOME/config.toml`, or `mcp.config_path` if you set it.

`team` selects project-owned MCP servers from `.cofounder/mcp/<server>.toml`.

Modes:

| Mode | Behavior |
| --- | --- |
| `isolated` | Give the member only `from_main` and `team` servers. |
| `none` | Give the member no MCP servers. |
| `inherit` | Give the member the primary Codex MCP environment. Use sparingly. |

Example project-owned MCP server:

```toml
# .cofounder/mcp/pencil.toml
url = "https://example.com/mcp"
startup_timeout_sec = 20
tool_timeout_sec = 120
```

Assign it:

```bash
cofounder mcp add pencil --url https://example.com/mcp --assign designer
cofounder mcp assign github backend --source main
```

## Skill Scoping

Skills are not loaded by pasting paths into prompts. Codex discovers skills at process startup from skill folders, so Cofounder prepares the member runtime before launching Codex.

```toml
[skills]
mode = "isolated"
from_project = ["api-workflow"]
from_main = ["uncodixfy"]
team = ["design-review"]
```

Sources:

| Source | Location | Use it when |
| --- | --- | --- |
| `from_project` | `.agents/skills/<skill>/SKILL.md` | The skill is normal project surface and may also be visible to primary Codex. |
| `from_main` | Existing user/global Codex skill roots | The member should reuse a skill already installed for the main user. |
| `team` | `.cofounder/skills/<skill>/SKILL.md` | The skill should exist only for selected teammates. |

When `skills.mode = "isolated"`, Cofounder launches the member with a member-specific `HOME` and `CODEX_HOME`, links selected skills into that runtime home, and disables unselected project skills for that member.

## Memory

Memory is explicit local text:

```text
.cofounder/memory/project.md
.cofounder/memory/members/<member>.md
```

Keep durable project facts in project memory and role-specific notes in member memory.
