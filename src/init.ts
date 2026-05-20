import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { configRoot, CONFIG_DIR, findProjectRoot, pathExists } from "./paths.js";
import { EXISTING_AGENTS_APPEND_SNIPPET, getProjectTemplate } from "./templates.js";
import { assertCondition } from "./errors.js";
import { buildProjectInstructions } from "./projectContext.js";

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
  await ensureDir(`${CONFIG_DIR}/mcp`);
  await ensureDir(`${CONFIG_DIR}/skills`);
  await ensureDir(`${CONFIG_DIR}/memory/members`);

  await ensureFile(`${CONFIG_DIR}/.gitignore`, "runs/\nworktrees/\nmembers/*/home/\n");
  await ensureFile("AGENTS.md", template.codexInstructions);
  if (skipped.includes("AGENTS.md")) {
    notices.push(formatExistingAgentsNotice());
  }
  await ensureFile(`${CONFIG_DIR}/codex-instructions.md`, template.codexInstructions);
  const projectInstructions = hadAgents
    ? (await buildProjectInstructions(root, template.projectInstructions)).content
    : template.projectInstructions;
  await ensureFile(`${CONFIG_DIR}/project.md`, projectInstructions);
  await ensureFile(`${CONFIG_DIR}/team.yaml`, template.teamYaml);
  await ensureFile(`${CONFIG_DIR}/memory/project.md`, "# Project Memory\n\n");
  for (const [server, config] of Object.entries(template.mcp)) {
    await ensureFile(`${CONFIG_DIR}/mcp/${server}.toml`, config);
  }

  for (const member of template.members) {
    const prompt = template.prompts[member];
    const settings = template.settings[member];
    assertCondition(prompt, `Template prompt missing for ${member}`);
    assertCondition(settings, `Template settings missing for ${member}`);
    await ensureDir(`${CONFIG_DIR}/members/${member}/home`);
    await ensureFile(`${CONFIG_DIR}/members/${member}/prompt.md`, prompt);
    await ensureFile(`${CONFIG_DIR}/members/${member}/settings.toml`, settings);
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
  await writeFile(target, result.content, "utf8");
  return {
    path: path.relative(root, target),
    source: result.source,
    derived: result.derived
  };
}

function formatExistingAgentsNotice(): string {
  return `AGENTS.md already exists, so Cofounder did not modify it.
For Codex to use Cofounder automatically, add this block to AGENTS.md:

${EXISTING_AGENTS_APPEND_SNIPPET}

Full Cofounder instructions are available at .cofounder/codex-instructions.md.
Cofounder also derived worker-facing project context in .cofounder/project.md.`;
}
