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
  const stripped = stripCofounderOrchestration(scoped)
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

function stripCofounderOrchestration(content: string): string {
  const lines = content.split(/\r?\n/);
  const result: string[] = [];
  const generatedDoc = /^\s*#\s+Cofounder Crew\s*$/im.test(content);
  const generatedSectionTitles = new Set([
    "your role",
    "orchestration workflow",
    "team configuration",
    "if cofounder tools are missing"
  ]);
  let cofounderLevel: number | null = null;
  let stripIntro = false;
  let skipLevel: number | null = null;

  for (const line of lines) {
    const heading = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (skipLevel !== null) {
      if (!heading) {
        continue;
      }

      const level = (heading[1] ?? "").length;
      if (level > skipLevel) {
        continue;
      }

      skipLevel = null;
    }

    if (heading) {
      const level = (heading[1] ?? "").length;
      const headingTitle = (heading[2] ?? "").trim().toLowerCase();

      if (headingTitle === "cofounder crew") {
        cofounderLevel = level;
        stripIntro = true;
        continue;
      }

      if (generatedDoc && cofounderLevel === 1 && level > cofounderLevel && generatedSectionTitles.has(headingTitle)) {
        skipLevel = level;
        stripIntro = false;
        continue;
      }

      if (cofounderLevel !== null && level <= cofounderLevel) {
        cofounderLevel = null;
        stripIntro = false;
      }
    }

    if (stripIntro) {
      if (line.trim().length === 0 || isCofounderBridgeLine(line)) {
        continue;
      }
      stripIntro = false;
    }

    result.push(line);
  }

  return result.join("\n");
}

function isCofounderBridgeLine(line: string): boolean {
  const normalized = line.trim().toLowerCase();
  return (
    normalized.includes("this project uses cofounder crew") ||
    normalized.includes("cofounder/orchestrator") ||
    normalized.includes("cofounder mcp tools") ||
    normalized.includes(".cofounder/codex-instructions.md") ||
    normalized.includes("proactively delegate") ||
    normalized.includes("do not perform specialist work yourself") ||
    normalized.includes("coordinate the work")
  );
}
