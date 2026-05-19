import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { CONFIG_DIR, pathExists } from "./paths.js";
import { EXISTING_AGENTS_APPEND_SNIPPET, getProjectTemplate } from "./templates.js";

export interface InitResult {
  created: string[];
  skipped: string[];
  notices: string[];
  template: string;
}

export async function initProject(projectRoot = process.cwd(), options: { template?: string } = {}): Promise<InitResult> {
  const root = path.resolve(projectRoot);
  const template = getProjectTemplate(options.template);
  const created: string[] = [];
  const skipped: string[] = [];
  const notices: string[] = [];

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

  await ensureFile("AGENTS.md", template.codexInstructions);
  if (skipped.includes("AGENTS.md")) {
    notices.push(formatExistingAgentsNotice());
  }
  await ensureFile(`${CONFIG_DIR}/codex-instructions.md`, template.codexInstructions);
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

function formatExistingAgentsNotice(): string {
  return `AGENTS.md already exists, so Cofounder did not modify it.
For Codex to use Cofounder automatically, add this block to AGENTS.md:

${EXISTING_AGENTS_APPEND_SNIPPET}

Full Cofounder instructions are available at .cofounder/codex-instructions.md.`;
}
