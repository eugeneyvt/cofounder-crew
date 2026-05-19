import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { configRoot, CONFIG_DIR, findProjectRoot, pathExists } from "./paths.js";
import { EXISTING_AGENTS_APPEND_SNIPPET, getProjectTemplate } from "./templates.js";
import { assertCondition } from "./errors.js";

export interface InitResult {
  created: string[];
  skipped: string[];
  notices: string[];
  template: string;
}

export interface SyncProjectInstructionsResult {
  path: string;
  source: string;
  derived: boolean;
}

export async function initProject(projectRoot = process.cwd(), options: { template?: string } = {}): Promise<InitResult> {
  const root = path.resolve(projectRoot);
  const template = getProjectTemplate(options.template);
  const created: string[] = [];
  const skipped: string[] = [];
  const notices: string[] = [];
  const hadAgents = await pathExists(path.join(root, "AGENTS.md"));

  async function ensureDir(relativePath: string): Promise<void> {
    const absolutePath = path.join(root, relativePath);
    if (await pathExists(absolutePath)) {
      skipped.push(relativePath);
      return;
    }
    await mkdir(absolutePath, { recursive: true });
    created.push(relativePath);
  }

  async function ensureFile(relativePath: string, content: string): Promise<void> {
    const absolutePath = path.join(root, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    if (await pathExists(absolutePath)) {
      skipped.push(relativePath);
      return;
    }
    await writeFile(absolutePath, content, "utf8");
    created.push(relativePath);
  }

  await ensureDir(CONFIG_DIR);
  await ensureDir(`${CONFIG_DIR}/runs`);
  await ensureDir(`${CONFIG_DIR}/worktrees`);
  await ensureDir(`${CONFIG_DIR}/memory/members`);

  await ensureFile(`${CONFIG_DIR}/.gitignore`, "runs/\nworktrees/\n");
  await ensureFile("AGENTS.md", template.codexInstructions);
  if (skipped.includes("AGENTS.md")) {
    notices.push(formatExistingAgentsNotice());
  }
  await ensureFile(`${CONFIG_DIR}/codex-instructions.md`, template.codexInstructions);
  await ensureFile(`${CONFIG_DIR}/project.md`, hadAgents
    ? await buildProjectInstructions(root, template.projectInstructions)
    : template.projectInstructions);
  await ensureFile(`${CONFIG_DIR}/team.yaml`, template.teamYaml);
  await ensureFile(`${CONFIG_DIR}/memory/project.md`, "# Project Memory\n\n");

  for (const member of template.members) {
    await ensureDir(`${CONFIG_DIR}/members/${member}/home`);
    await ensureFile(`${CONFIG_DIR}/members/${member}/prompt.md`, template.prompts[member]);
    await ensureFile(`${CONFIG_DIR}/members/${member}/settings.toml`, template.settings[member]);
    await ensureFile(`${CONFIG_DIR}/memory/members/${member}.md`, `# ${member} Memory\n\n`);
  }

  return { created, skipped, notices, template: template.name };
}

export async function syncProjectInstructions(startDir = process.cwd()): Promise<SyncProjectInstructionsResult> {
  const root = await findProjectRoot(startDir);
  assertCondition(root, `Missing .cofounder/team.yaml in ${path.resolve(startDir)} or its parents`);

  const template = getProjectTemplate();
  const result = await buildProjectInstructions(root, template.projectInstructions);
  const target = path.join(configRoot(root), "project.md");
  await writeFile(target, result, "utf8");
  return {
    path: path.relative(root, target),
    source: await pathExists(path.join(root, "AGENTS.md")) ? "AGENTS.md" : "template",
    derived: result !== template.projectInstructions
  };
}

export async function buildProjectInstructions(projectRoot: string, fallback: string): Promise<string> {
  const agentsPath = path.join(projectRoot, "AGENTS.md");
  if (!(await pathExists(agentsPath))) {
    return fallback;
  }

  const agents = await readFile(agentsPath, "utf8");
  const derived = deriveProjectInstructionsFromAgents(agents);
  return derived ?? fallback;
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

function formatExistingAgentsNotice(): string {
  return `AGENTS.md already exists, so Cofounder did not modify it.
For Codex to use Cofounder automatically, add this block to AGENTS.md:

${EXISTING_AGENTS_APPEND_SNIPPET}

Full Cofounder instructions are available at .cofounder/codex-instructions.md.
Cofounder also derived worker-facing project context in .cofounder/project.md.`;
}
