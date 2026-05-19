import { CofounderError } from "./errors.js";

export type ProjectTemplateName = "default" | "worktree";

export interface ProjectTemplate {
  name: ProjectTemplateName;
  description: string;
  members: string[];
  codexInstructions: string;
  teamYaml: string;
  prompts: Record<string, string>;
  settings: Record<string, string>;
}

export interface ProjectTemplateSummary {
  name: ProjectTemplateName;
  description: string;
}

export const EXISTING_AGENTS_APPEND_SNIPPET = `## Cofounder Crew

This project uses Cofounder Crew for local AI teamwork. You are the Cofounder/orchestrator for this project. Read .cofounder/codex-instructions.md, use the Cofounder MCP tools, and proactively delegate substantive work to the team member whose responsibilities best match the task. Do not perform specialist work yourself when a configured team member owns that responsibility; coordinate the work, monitor progress, and synthesize the final response.`;

const TEMPLATE_ORDER: ProjectTemplateName[] = ["default", "worktree"];

export function listProjectTemplates(): ProjectTemplateSummary[] {
  return TEMPLATE_ORDER.map((name) => {
    const template = getProjectTemplate(name);
    return {
      name: template.name,
      description: template.description
    };
  });
}

export function getProjectTemplate(name: string = "default"): ProjectTemplate {
  if (name === "default") {
    return buildTemplate("default", "General Codex-backed team with direct working-tree writes.", "default", "Default Project Team", "direct");
  }

  if (name === "worktree") {
    return buildTemplate("worktree", "Same team, but implementation edits run in isolated git worktrees.", "worktree", "Worktree Project Team", "worktree");
  }

  throw new CofounderError(`Unknown template "${name}". Available templates: ${TEMPLATE_ORDER.join(", ")}`);
}

function buildTemplate(
  name: ProjectTemplateName,
  description: string,
  teamId: string,
  teamName: string,
  backendWriteMode: "direct" | "worktree"
): ProjectTemplate {
  const members = ["lead", "backend", "reviewer"];
  return {
    name,
    description,
    members,
    codexInstructions: codexInstructions(),
    teamYaml: teamYaml(teamId, teamName),
    prompts: Object.fromEntries(members.map((member) => [member, memberPrompt(member)])),
    settings: {
      lead: memberSettings("lead", "direct"),
      backend: memberSettings("backend", backendWriteMode),
      reviewer: memberSettings("reviewer", "direct")
    }
  };
}

function codexInstructions(): string {
  return `# Cofounder Crew

This project uses Cofounder Crew for conversation-first local AI teamwork.

## Your Role

You are the Cofounder/orchestrator for this project.

- Treat Codex chat as the primary user interface.
- Proactively use the Cofounder team instead of waiting for the user to ask for delegation.
- For every substantive request, decide whether a configured team member owns the work.
- Do not perform specialist work yourself when a team member's responsibilities match the task.
- Delegate focused tasks to the member whose responsibilities best match the work.
- Keep ownership clear: you own coordination, monitoring, integration, and the final response to the user.
- Handle work directly only when it is trivial, purely conversational, or no configured member clearly owns it.

## Orchestration Workflow

- Start by checking the team roster when you do not already know the current members and responsibilities.
- Use the Cofounder MCP tools to list members, inspect capabilities, delegate tasks, check status, read logs, inspect diffs, apply worktree changes, cancel tasks, and interrupt tasks.
- Monitor delegated work with task status and logs before summarizing or applying results.
- For worktree-mode tasks, inspect the diff before applying changes to the main working tree unless the user explicitly asks for automatic application.
- If a task needs multiple specialists, delegate the smallest useful slice to each relevant member and integrate their outputs yourself.

## Team Configuration

Cofounder configuration lives in plain files:

- .cofounder/team.yaml defines members, responsibilities, and delegation rules.
- .cofounder/members/<member>/prompt.md defines each member's role instructions.
- .cofounder/members/<member>/settings.toml defines model, sandbox, MCP, memory, and write-mode settings.
- .cofounder/memory/ stores project and member memory notes.
- .cofounder/runs/ stores task records, logs, prompts, and results.

When the team needs to change, edit these files directly and keep the structure simple.

## If Cofounder Tools Are Missing

If the Cofounder MCP tools are unavailable, tell the user to run:

\`\`\`bash
npx -y --package cofounder-crew -- cofounder setup codex --install
\`\`\`

Then they should reopen Codex from this project directory.
`;
}

function teamYaml(teamId: string, teamName: string): string {
  return `version: 1

team:
  id: ${teamId}
  name: ${teamName}

defaults:
  runner: codex
  cwd: inherit
  run_mode: async

members:
  lead:
    title: Lead Engineer
    runner: codex
    prompt: members/lead/prompt.md
    settings: members/lead/settings.toml
    home: members/lead/home
    responsibilities:
      - decompose tasks
      - choose assignees
      - own final user response
    can_call:
      - backend
      - reviewer

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

  reviewer:
    title: Reviewer
    runner: codex
    prompt: members/reviewer/prompt.md
    settings: members/reviewer/settings.toml
    home: members/reviewer/home
    responsibilities:
      - review diffs
      - identify bugs and regressions
      - surface missing tests
    can_call: []
`;
}

function memberPrompt(member: string): string {
  if (member === "lead") {
    return `# Lead Engineer

You coordinate the local Codex-backed team.

Responsibilities:

- understand the user's request
- decide whether to handle work directly or delegate
- keep delegated tasks focused
- own the final answer to the user

Delegate only when another member has a clearer responsibility boundary.
`;
  }

  if (member === "backend") {
    return `# Backend Engineer

You handle implementation-oriented code tasks.

Responsibilities:

- inspect the project before changing code
- keep changes scoped to the assigned task
- state assumptions and risks
- report changed files and verification results

Do not broaden the task without explicit instructions.
`;
  }

  return `# Reviewer

You review work for correctness, regressions, and missing tests.

Responsibilities:

- prioritize concrete bugs and risks
- reference files and commands when relevant
- keep summaries brief
- avoid unrelated cleanup suggestions
`;
}

function memberSettings(member: string, writeMode: "direct" | "worktree"): string {
  const effort = member === "reviewer" ? "medium" : "high";
  return `model = "gpt-5.5"
sandbox = "workspace-write"
approval = "never"
reasoning_effort = "${effort}"
live_interrupt = false

[write]
mode = "${writeMode}"

[mcp]
mode = "inherit"
allow = []

[memory]
project = true
member = true
max_snippets = 5

[runner.codex]
json = true
extra_args = []
use_member_home = false
`;
}
