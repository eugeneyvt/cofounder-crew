import { readFile } from "node:fs/promises";
import path from "node:path";
import { PRIMARY_CALLER, summarizeTeam } from "./config.js";
import { fromConfigRoot, pathExists } from "./paths.js";
import { getProjectTemplate } from "./templates.js";
import { loadProjectInstructions as loadConfiguredProjectInstructions, type ProjectInstructionsView } from "./projectContext.js";
import type { LoadedProject, MemberDefinition, MemberSettings } from "./types.js";

export async function assemblePrompt(
  project: LoadedProject,
  member: MemberDefinition,
  settings: MemberSettings,
  caller: string,
  task: string
): Promise<string> {
  const memberPrompt = await readFile(fromConfigRoot(project.projectRoot, member.prompt), "utf8");
  const projectInstructions = await loadProjectInstructions(project);
  const memory = await loadMemory(project, member, settings);

  return `# Cofounder Delegated Task

## Member

You are ${member.id}: ${member.title}.

## Member Instructions

${memberPrompt.trim()}

## Shared Project Instructions

Project context mode: ${projectInstructions.mode}
Project context source: ${projectInstructions.source}

${projectInstructions.content}

## Team Roster

${summarizeTeam(project)}

## Delegation Context

- Caller: ${caller}
- Assignee: ${member.id}
- Project cwd: ${project.projectRoot}
- Allowed delegation targets: ${member.can_call.length > 0 ? member.can_call.join(", ") : "none"}

## Nested Delegation Rules

${nestedDelegationRules(member, caller)}

## Memory

${memory.length > 0 ? memory.join("\n\n") : "No memory was injected."}

## Task

${task}
`;
}

function nestedDelegationRules(member: MemberDefinition, caller: string): string {
  if (member.can_call.length === 0) {
    return `You are already running as delegated work, not the primary Codex chat.

- Complete the assigned task yourself.
- Do not call Cofounder MCP tools to delegate work; this member has no allowed delegation targets.
- If a Cofounder MCP call fails or is unavailable, stop retrying and continue the assigned task with the context you have. Mention that nested delegation was unavailable if it affects confidence.`;
  }

  const callerRule = caller === PRIMARY_CALLER
    ? "- The primary Codex session owns orchestration and final user response; do not delegate back to primary."
    : caller === member.id
    ? "- Never delegate to yourself."
    : `- Never delegate to yourself. Avoid delegating back to ${caller} unless the user explicitly asked for that nested workflow.`;

  return `You are already running as delegated work, not the primary Codex chat.

- Prefer completing the assigned task yourself.
- Use Cofounder MCP delegation only when the task clearly needs one of your allowed targets: ${member.can_call.join(", ")}.
- If you call team.delegate, pass caller: "${member.id}".
${callerRule}
- If a Cofounder MCP call fails or is unavailable, stop retrying and continue the assigned task with the context you have. Mention that nested delegation was unavailable if it affects confidence.`;
}

async function loadProjectInstructions(project: LoadedProject): Promise<ProjectInstructionsView> {
  return await loadConfiguredProjectInstructions(project, getProjectTemplate().projectInstructions);
}

async function loadMemory(project: LoadedProject, member: MemberDefinition, settings: MemberSettings): Promise<string[]> {
  const snippets: string[] = [];
  const maxSnippets = settings.memory?.max_snippets ?? 5;

  if (settings.memory?.project) {
    const projectMemoryPath = path.join(project.configRoot, "memory/project.md");
    if (await pathExists(projectMemoryPath)) {
      snippets.push(await memorySnippet("Project memory", projectMemoryPath));
    }
  }

  if (settings.memory?.member && snippets.length < maxSnippets) {
    const memberMemoryPath = path.join(project.configRoot, `memory/members/${member.id}.md`);
    if (await pathExists(memberMemoryPath)) {
      snippets.push(await memorySnippet(`${member.id} memory`, memberMemoryPath));
    }
  }

  return snippets.slice(0, maxSnippets);
}

async function memorySnippet(label: string, filePath: string): Promise<string> {
  const content = await readFile(filePath, "utf8");
  return `### ${label}\n\n${content.trim() || "(empty)"}`;
}
