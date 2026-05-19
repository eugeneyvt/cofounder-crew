import { readFile } from "node:fs/promises";
import path from "node:path";
import { fromConfigRoot, pathExists } from "./paths.js";
import type { LoadedProject, ProjectContextMode } from "./types.js";

export interface ProjectInstructionsView {
  content: string;
  mode: ProjectContextMode;
  source: string;
  derived: boolean;
}

export async function loadProjectInstructions(project: LoadedProject, fallback: string): Promise<ProjectInstructionsView> {
  const context = project.team.project_context;
  if (context.mode === "manual") {
    return await readProjectContextFile(project, fallback, "manual");
  }

  const derived = await buildProjectInstructions(project.projectRoot, fallback);
  if (derived.derived) {
    return {
      content: derived.content,
      mode: "auto",
      source: derived.source,
      derived: true
    };
  }

  const fileContext = await readProjectContextFile(project, fallback, "auto");
  return {
    ...fileContext,
    mode: "auto"
  };
}

export async function buildProjectInstructions(projectRoot: string, fallback: string): Promise<ProjectInstructionsView> {
  const agentsPath = path.join(projectRoot, "AGENTS.md");
  if (!(await pathExists(agentsPath))) {
    return {
      content: fallback,
      mode: "manual",
      source: "template",
      derived: false
    };
  }

  const agents = await readFile(agentsPath, "utf8");
  const derived = deriveProjectInstructionsFromAgents(agents);
  if (!derived) {
    return {
      content: fallback,
      mode: "manual",
      source: "template",
      derived: false
    };
  }

  return {
    content: derived,
    mode: "auto",
    source: "AGENTS.md",
    derived: true
  };
}

export function deriveProjectInstructionsFromAgents(content: string): string | null {
  const projectDocMarker = "--- project-doc ---";
  const markerIndex = content.indexOf(projectDocMarker);
  const scoped = markerIndex === -1 ? content : content.slice(markerIndex + projectDocMarker.length);
  const stripped = stripMarkdownSection(scoped, "Cofounder Crew")
    .replace(/^<INSTRUCTIONS>\s*/i, "")
    .replace(/\s*<\/INSTRUCTIONS>\s*$/i, "")
    .trim();

  if (stripped.length === 0) {
    return null;
  }

  return `# Shared Project Instructions

Derived from AGENTS.md for delegated workers.

${stripped}
`;
}

async function readProjectContextFile(
  project: LoadedProject,
  fallback: string,
  mode: ProjectContextMode
): Promise<ProjectInstructionsView> {
  const relativePath = project.team.project_context.file;
  const projectContextPath = fromConfigRoot(project.projectRoot, relativePath);
  if (!(await pathExists(projectContextPath))) {
    return {
      content: fallback,
      mode,
      source: "template",
      derived: false
    };
  }

  const content = (await readFile(projectContextPath, "utf8")).trim();
  return {
    content: content || fallback,
    mode,
    source: path.relative(project.projectRoot, projectContextPath),
    derived: false
  };
}

function stripMarkdownSection(content: string, title: string): string {
  const lines = content.split(/\r?\n/);
  const result: string[] = [];
  let skipLevel: number | null = null;

  for (const line of lines) {
    const heading = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const headingTitle = heading[2].trim().toLowerCase();
      if (skipLevel !== null && level <= skipLevel) {
        skipLevel = null;
      }
      if (headingTitle === title.toLowerCase()) {
        skipLevel = level;
        continue;
      }
    }

    if (skipLevel === null) {
      result.push(line);
    }
  }

  return result.join("\n");
}
