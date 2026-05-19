import { readFile } from "node:fs/promises";
import path from "node:path";
import { summarizeTeam } from "./config.js";
import { fromConfigRoot, pathExists } from "./paths.js";
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

Project AGENTS.md is not used as delegated-worker context because it may contain Cofounder/orchestrator-only instructions.

${projectInstructions}

## Team Roster

${summarizeTeam(project)}

## Delegation Context

- Caller: ${caller}
- Assignee: ${member.id}
- Project cwd: ${project.projectRoot}
- Allowed delegation targets: ${member.can_call.length > 0 ? member.can_call.join(", ") : "none"}

## Memory

${memory.length > 0 ? memory.join("\n\n") : "No memory was injected."}

## Task

${task}
`;
}

async function loadProjectInstructions(project: LoadedProject): Promise<string> {
  const projectInstructionsPath = path.join(project.configRoot, "project.md");
  if (!(await pathExists(projectInstructionsPath))) {
    return "No shared project instructions were injected. Put worker-relevant project rules in .cofounder/project.md.";
  }

  const content = (await readFile(projectInstructionsPath, "utf8")).trim();
  return content || "(empty)";
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
