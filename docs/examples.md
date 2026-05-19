# Examples

These examples are meant to be run from a project that already has Cofounder Crew initialized.

## Add A Designer With Pencil MCP

Use this when a specialist needs a tool that should not be exposed to the primary Codex session.

```bash
cofounder member add designer --title "Product Designer" --model gpt-5.5 --write-mode worktree
cofounder mcp add pencil --url https://example.com/mcp --assign designer
cofounder skill add design-review --scope team --assign designer
```

Then ask Codex:

```text
Use the Cofounder team. Ask designer to inspect the product flow and propose UI fixes.
```

## Reuse A Project Skill For One Member

Project skills live in `.agents/skills/`. They can be visible to the primary Codex session and selectively assigned to members.

```bash
cofounder skill add api-workflow --scope project --assign backend
```

Then ask Codex:

```text
Ask backend to use the api-workflow skill while inspecting the API boundary.
```

## Reuse A Main Codex Skill

Use this when a skill is already installed for your main Codex runtime and you want one member to inherit it.

```bash
cofounder skill assign uncodixfy designer --scope main
```

## Give A Member One Main MCP Server

Use `--source main` when the MCP server already exists in the primary Codex config.

```bash
cofounder mcp assign github reviewer --source main
```

The reviewer gets only the selected server when its MCP mode is `isolated`.

## Run A Worktree Task

Worktree mode requires a Git repo with at least one commit.

```bash
cofounder task delegate backend "implement the smallest safe version of this change"
cofounder task watch <task_id>
cofounder task diff <task_id>
cofounder task apply <task_id>
```

The daily path is still Codex chat:

```text
Delegate this implementation to backend in a worktree, then review the diff before applying it.
```

## Switch To Manual Project Context

Automatic context derives worker instructions from `AGENTS.md`. Manual context uses `.cofounder/project.md`.

```bash
cofounder context mode manual
cofounder context sync
```

Edit `.cofounder/project.md` when you want workers to see a curated project brief.
