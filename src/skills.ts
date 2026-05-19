import { cp, mkdir, readdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CofounderError } from "./errors.js";
import { pathExists } from "./paths.js";
import type { LoadedProject, MemberSettings } from "./types.js";

export type SkillMode = "inherit" | "none" | "allowlist" | "isolated";

export interface PreparedSkill {
  id: string;
  name: string;
  description: string;
  source: "from_project" | "from_main" | "team";
  path: string;
  materialized_path: string | null;
}

export interface PreparedSkills {
  mode: SkillMode;
  from_project: string[];
  from_main: string[];
  team: string[];
  skills: PreparedSkill[];
  disabled_project_skill_paths: string[];
  requires_member_home: boolean;
  agent_skill_root: string | null;
  codex_skill_root: string | null;
}

interface SkillCandidate {
  id: string;
  name: string;
  description: string;
  path: string;
}

export async function prepareSkills(
  project: LoadedProject,
  settings: MemberSettings,
  memberHomeAbsolutePath: string | null
): Promise<PreparedSkills> {
  const mode = normalizeSkillMode(settings);
  const fromProject = settings.skills?.from_project ?? [];
  const fromMain = settings.skills?.from_main ?? [];
  const team = settings.skills?.team ?? [];
  validateSkillSettings(mode, fromProject, fromMain, team);

  if (mode === "inherit") {
    return {
      mode,
      from_project: [],
      from_main: [],
      team: [],
      skills: [],
      disabled_project_skill_paths: [],
      requires_member_home: false,
      agent_skill_root: null,
      codex_skill_root: null
    };
  }

  if (!memberHomeAbsolutePath) {
    throw new CofounderError(`skills.mode = "${mode}" requires a member home directory`);
  }

  const [projectSkillScope, mainSkills, teamSkills] = await Promise.all([
    loadProjectSkillScope(project, fromProject),
    mode === "none" ? [] : loadMainSkills(project, settings, fromMain),
    loadTeamSkills(project, team)
  ]);
  const skills = [...projectSkillScope.skills, ...mainSkills, ...teamSkills];
  const roots = await materializeSkills(project, memberHomeAbsolutePath, skills);

  return {
    mode,
    from_project: fromProject,
    from_main: fromMain,
    team,
    skills: skills.map((skill) => ({
      ...skill,
      materialized_path: skill.source === "from_project"
        ? null
        : path.relative(project.projectRoot, path.join(roots.agentSkillRoot, safeSkillFolderName(skill.id)))
    })),
    disabled_project_skill_paths: projectSkillScope.disabledSkillPaths,
    requires_member_home: true,
    agent_skill_root: path.relative(project.projectRoot, roots.agentSkillRoot),
    codex_skill_root: path.relative(project.projectRoot, roots.codexSkillRoot)
  };
}

function normalizeSkillMode(settings: MemberSettings): SkillMode {
  if (
    !settings.skills?.mode &&
    (
      (settings.skills?.from_project?.length ?? 0) > 0 ||
      (settings.skills?.from_main?.length ?? 0) > 0 ||
      (settings.skills?.team?.length ?? 0) > 0
    )
  ) {
    return "isolated";
  }
  return settings.skills?.mode ?? "inherit";
}

function validateSkillSettings(mode: SkillMode, fromProject: string[], fromMain: string[], team: string[]): void {
  if (!["inherit", "none", "allowlist", "isolated"].includes(mode)) {
    throw new CofounderError(`Unsupported skill mode: ${mode}`);
  }

  if ((mode === "inherit" || mode === "none") && (fromProject.length > 0 || fromMain.length > 0 || team.length > 0)) {
    throw new CofounderError(`skills.from_project, skills.from_main, and skills.team can only be used when skills.mode = "isolated" or "allowlist"`);
  }

  for (const skill of [...fromProject, ...fromMain, ...team]) {
    if (!/^[A-Za-z0-9_.:-]+$/.test(skill) || skill === "." || skill === "..") {
      throw new CofounderError(`Unsupported skill id: ${skill}`);
    }
  }
}

async function loadProjectSkillScope(
  project: LoadedProject,
  requested: string[]
): Promise<{ skills: PreparedSkill[]; disabledSkillPaths: string[] }> {
  const candidates = await loadSkillCandidates(projectSkillRoots(project));
  const selectedPaths = new Set<string>();
  const skills = requested.map((id) => {
    const candidate = resolveSkillCandidate(candidates, id);
    if (!candidate) {
      throw new CofounderError(`Project skill not found: ${id}`);
    }
    selectedPaths.add(candidate.path);
    return {
      id,
      name: candidate.name,
      description: candidate.description,
      source: "from_project" as const,
      path: candidate.path,
      materialized_path: null
    };
  });

  const disabledSkillPaths = uniqueSkillPaths(candidates)
    .filter((skillPath) => !selectedPaths.has(skillPath));
  return { skills, disabledSkillPaths };
}

async function loadMainSkills(project: LoadedProject, settings: MemberSettings, requested: string[]): Promise<PreparedSkill[]> {
  if (requested.length === 0) {
    return [];
  }

  const roots = (settings.skills?.roots ?? mainSkillRoots()).map((root) => resolveUserPath(root, project.projectRoot));
  const candidates = await loadSkillCandidates(roots);

  return requested.map((id) => {
    const candidate = resolveSkillCandidate(candidates, id);
    if (!candidate) {
      throw new CofounderError(`Main skill not found: ${id}`);
    }
    return {
      id,
      name: candidate.name,
      description: candidate.description,
      source: "from_main" as const,
      path: candidate.path,
      materialized_path: null
    };
  });
}

async function loadSkillCandidates(roots: string[]): Promise<Map<string, SkillCandidate>> {
  const candidates = new Map<string, SkillCandidate>();
  for (const root of roots) {
    if (!(await pathExists(root))) {
      continue;
    }
    for (const candidate of await findSkillCandidates(root)) {
      candidates.set(candidate.id, candidate);
      candidates.set(candidate.name, candidate);
      candidates.set(path.basename(path.dirname(candidate.path)), candidate);
      if (candidate.name.includes(":")) {
        candidates.set(candidate.name.split(":").at(-1) ?? candidate.name, candidate);
      }
    }
  }
  return candidates;
}

function resolveSkillCandidate(candidates: Map<string, SkillCandidate>, id: string): SkillCandidate | undefined {
  return candidates.get(id) ?? candidates.get(id.split(":").at(-1) ?? id);
}

async function loadTeamSkills(project: LoadedProject, requested: string[]): Promise<PreparedSkill[]> {
  const skills: PreparedSkill[] = [];
  for (const id of requested) {
    const skillPath = path.join(project.configRoot, "skills", id, "SKILL.md");
    if (!(await pathExists(skillPath))) {
      throw new CofounderError(`Team skill not found: .cofounder/skills/${id}/SKILL.md`);
    }
    const metadata = await readSkillMetadata(skillPath);
    skills.push({
      id,
      name: metadata.name || id,
      description: metadata.description,
      source: "team" as const,
      path: skillPath,
      materialized_path: null
    });
  }
  return skills;
}

async function materializeSkills(
  project: LoadedProject,
  memberHomeAbsolutePath: string,
  skills: PreparedSkill[]
): Promise<{ agentSkillRoot: string; codexSkillRoot: string }> {
  const agentSkillRoot = path.join(memberHomeAbsolutePath, ".agents", "skills");
  const codexSkillRoot = path.join(memberHomeAbsolutePath, "skills");
  await resetDir(agentSkillRoot);
  await resetDir(codexSkillRoot);

  const seen = new Set<string>();
  for (const skill of skills) {
    if (skill.source === "from_project") {
      continue;
    }

    const folderName = safeSkillFolderName(skill.id);
    if (seen.has(folderName)) {
      throw new CofounderError(`Duplicate materialized skill folder: ${folderName}`);
    }
    seen.add(folderName);

    const sourceDir = path.dirname(skill.path);
    await linkSkillDirectory(sourceDir, path.join(agentSkillRoot, folderName));
    await linkSkillDirectory(sourceDir, path.join(codexSkillRoot, folderName));
  }

  await writeSkillReadme(project, memberHomeAbsolutePath, skills);
  return { agentSkillRoot, codexSkillRoot };
}

function uniqueSkillPaths(candidates: Map<string, SkillCandidate>): string[] {
  return Array.from(new Set(Array.from(candidates.values()).map((candidate) => candidate.path)));
}

async function resetDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
}

async function linkSkillDirectory(sourceDir: string, targetDir: string): Promise<void> {
  try {
    await symlink(sourceDir, targetDir, "dir");
  } catch {
    await cp(sourceDir, targetDir, { recursive: true });
  }
}

async function writeSkillReadme(project: LoadedProject, memberHomeAbsolutePath: string, skills: PreparedSkill[]): Promise<void> {
  const lines = [
    "# Cofounder Skill Scope",
    "",
    "Generated by Cofounder for this member runtime.",
    "Codex discovers these skills natively from this member home at startup.",
    ""
  ];

  if (skills.length === 0) {
    lines.push("No Cofounder-managed skills are assigned to this member.");
  } else {
    for (const skill of skills) {
      lines.push(`- ${skill.id} (${skill.source}): ${path.relative(project.projectRoot, skill.path)}`);
    }
  }

  const readmePath = path.join(memberHomeAbsolutePath, "skills.README.md");
  await mkdir(path.dirname(readmePath), { recursive: true });
  await writeFile(readmePath, `${lines.join("\n")}\n`, "utf8");
}

async function findSkillCandidates(root: string): Promise<SkillCandidate[]> {
  const found: SkillCandidate[] = [];
  await walk(root, async (filePath) => {
    if (path.basename(filePath) !== "SKILL.md") {
      return;
    }
    const metadata = await readSkillMetadata(filePath);
    found.push({
      id: metadata.name || path.basename(path.dirname(filePath)),
      name: metadata.name || path.basename(path.dirname(filePath)),
      description: metadata.description,
      path: filePath
    });
  });
  return found;
}

async function walk(dir: string, onFile: (filePath: string) => Promise<void>): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory() || await isDirectorySymlink(filePath, entry.isSymbolicLink())) {
      await walk(filePath, onFile);
    } else if (entry.isFile()) {
      await onFile(filePath);
    }
  }
}

async function isDirectorySymlink(filePath: string, isSymlink: boolean): Promise<boolean> {
  if (!isSymlink) {
    return false;
  }
  try {
    return (await stat(filePath)).isDirectory();
  } catch {
    return false;
  }
}

async function readSkillMetadata(skillPath: string): Promise<{ name: string; description: string }> {
  const raw = await readFile(skillPath, "utf8");
  const frontmatter = /^---\s*\n([\s\S]*?)\n---/.exec(raw)?.[1] ?? raw.slice(0, 1200);
  return {
    name: frontmatter.match(/^name:\s*(.+)$/m)?.[1]?.trim() ?? "",
    description: frontmatter.match(/^description:\s*(.+)$/m)?.[1]?.trim() ?? ""
  };
}

function projectSkillRoots(project: LoadedProject): string[] {
  return [path.join(project.projectRoot, ".agents", "skills")];
}

function mainSkillRoots(): string[] {
  return [
    path.join(os.homedir(), ".agents", "skills"),
    "/etc/codex/skills",
    path.join(os.homedir(), ".codex", "skills"),
    path.join(os.homedir(), ".codex", "plugins", "cache")
  ];
}

function safeSkillFolderName(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]/g, "_");
}

function resolveUserPath(filePath: string, baseDir: string): string {
  if (filePath === "~") {
    return os.homedir();
  }
  if (filePath.startsWith("~/")) {
    return path.join(os.homedir(), filePath.slice(2));
  }
  return path.isAbsolute(filePath) ? filePath : path.resolve(baseDir, filePath);
}
