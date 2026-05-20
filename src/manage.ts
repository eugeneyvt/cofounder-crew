import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { stringify as stringifyToml } from "smol-toml";
import YAML from "yaml";
import { getMember, getMemberPaths, loadMemberSettings, loadProject } from "./config.js";
import { CofounderError } from "./errors.js";
import { pathExists } from "./paths.js";
import type { LoadedProject, MemberDefinition, MemberSettings, ProjectContextMode, TeamFile, WorkMode } from "./types.js";

export type SkillSource = "project" | "main" | "team";
export type McpSource = "main" | "team";

export interface MemberAddOptions {
  id: string;
  title?: string;
  model?: string;
  reasoning_effort?: string;
  sandbox?: MemberSettings["sandbox"];
  approval?: string;
  write_mode?: WorkMode;
  responsibilities?: string[];
  can_call?: string[];
}

export interface MemberSetOptions {
  model?: string;
  reasoning_effort?: string;
  sandbox?: MemberSettings["sandbox"];
  approval?: string;
  write_mode?: WorkMode;
  mcp_mode?: MemberSettings["mcp"] extends infer M ? M extends { mode?: infer T } ? T : never : never;
  mcp_oauth_credentials_store?: string;
  skills_mode?: MemberSettings["skills"] extends infer S ? S extends { mode?: infer T } ? T : never : never;
}

export interface McpAddOptions {
  id: string;
  url?: string;
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  assign?: string[];
}

export interface SkillAddOptions {
  id: string;
  source: SkillSource;
  description?: string;
  instructions?: string;
  assign?: string[];
}

export interface ChangeResult {
  changed: string[];
  skipped: string[];
  notes: string[];
}

export async function addMember(startDir: string, options: MemberAddOptions): Promise<ChangeResult> {
  const project = await loadProject(startDir);
  validateId(options.id, "member id");
  if (project.team.members[options.id]) {
    throw new CofounderError(`Member already exists: ${options.id}`);
  }

  const member: MemberDefinition = {
    id: options.id,
    title: options.title ?? titleFromId(options.id),
    runner: "codex",
    prompt: `members/${options.id}/prompt.md`,
    settings: `members/${options.id}/settings.toml`,
    home: `members/${options.id}/home`,
    responsibilities: options.responsibilities?.length ? options.responsibilities : ["handle assigned work"],
    can_call: options.can_call ?? []
  };

  const nextTeam = cloneTeam(project.team);
  nextTeam.members[options.id] = member;
  await writeTeam(project, nextTeam);

  const memberDir = path.join(project.configRoot, "members", options.id);
  await mkdir(path.join(memberDir, "home"), { recursive: true });
  await writeFile(path.join(memberDir, "prompt.md"), defaultMemberPrompt(member), "utf8");
  await writeFile(path.join(memberDir, "settings.toml"), formatMemberSettings({
    model: options.model ?? "gpt-5.5",
    sandbox: options.sandbox ?? "workspace-write",
    approval: options.approval ?? "never",
    reasoning_effort: options.reasoning_effort ?? "high",
    live_interrupt: false,
    write: { mode: options.write_mode ?? "direct" },
    mcp: { mode: "none", from_main: [], team: [] },
    skills: { mode: "isolated", from_project: [], from_main: [], team: [] },
    memory: { project: true, member: true, max_snippets: 5 },
    runner: {
      codex: {
        json: true,
        extra_args: [],
        use_member_home: false,
        include_project_doc: false
      }
    }
  }), "utf8");
  await writeFile(path.join(project.configRoot, "memory", "members", `${options.id}.md`), `# ${options.id} Memory\n\n`, "utf8");

  return {
    changed: [
      ".cofounder/team.yaml",
      path.relative(project.projectRoot, path.join(memberDir, "prompt.md")),
      path.relative(project.projectRoot, path.join(memberDir, "settings.toml")),
      path.relative(project.projectRoot, path.join(project.configRoot, "memory", "members", `${options.id}.md`))
    ],
    skipped: [],
    notes: [`Added member ${options.id}.`]
  };
}

export async function setMember(startDir: string, memberId: string, options: MemberSetOptions): Promise<ChangeResult> {
  const project = await loadProject(startDir);
  const member = getMember(project, memberId);
  const settings = await loadMemberSettings(project, member);

  if (options.model) settings.model = options.model;
  if (options.reasoning_effort) settings.reasoning_effort = options.reasoning_effort;
  if (options.sandbox) settings.sandbox = options.sandbox;
  if (options.approval) settings.approval = options.approval;
  if (options.write_mode) settings.write = { ...(settings.write ?? {}), mode: options.write_mode };
  if (options.mcp_mode) settings.mcp = { ...(settings.mcp ?? {}), mode: options.mcp_mode };
  if (options.mcp_oauth_credentials_store) {
    settings.mcp = { ...(settings.mcp ?? {}) };
    if (options.mcp_oauth_credentials_store === "inherit") {
      delete settings.mcp.oauth_credentials_store;
    } else {
      settings.mcp.oauth_credentials_store = options.mcp_oauth_credentials_store;
    }
  }
  if (options.skills_mode) settings.skills = { ...(settings.skills ?? {}), mode: options.skills_mode };

  const paths = getMemberPaths(project, member);
  await writeFile(paths.settingsAbsolutePath, formatMemberSettings(settings), "utf8");
  return {
    changed: [paths.settingsPath],
    skipped: [],
    notes: [`Updated member ${memberId}.`]
  };
}

export async function removeMember(startDir: string, memberId: string, options: { deleteFiles?: boolean } = {}): Promise<ChangeResult> {
  const project = await loadProject(startDir);
  getMember(project, memberId);
  const nextTeam = cloneTeam(project.team);
  delete nextTeam.members[memberId];
  for (const member of Object.values(nextTeam.members)) {
    member.can_call = member.can_call.filter((id) => id !== memberId);
  }
  await writeTeam(project, nextTeam);

  const changed = [".cofounder/team.yaml"];
  if (options.deleteFiles) {
    await rm(path.join(project.configRoot, "members", memberId), { recursive: true, force: true });
    await rm(path.join(project.configRoot, "memory", "members", `${memberId}.md`), { force: true });
    changed.push(`.cofounder/members/${memberId}`, `.cofounder/memory/members/${memberId}.md`);
  }

  return {
    changed,
    skipped: [],
    notes: [`Removed member ${memberId}.`]
  };
}

export async function addMcpServer(startDir: string, options: McpAddOptions): Promise<ChangeResult> {
  const project = await loadProject(startDir);
  validateId(options.id, "MCP server id");
  if (!options.url && !options.command) {
    throw new CofounderError("MCP add requires --url or --command");
  }
  if (options.url && options.command) {
    throw new CofounderError("MCP add accepts either --url or --command, not both");
  }

  const serverConfig: Record<string, unknown> = options.url
    ? { url: options.url }
    : { command: options.command, args: options.args ?? [] };
  if (options.cwd) serverConfig["cwd"] = options.cwd;
  if (options.env && Object.keys(options.env).length > 0) serverConfig["env"] = options.env;

  const serverPath = path.join(project.configRoot, "mcp", `${options.id}.toml`);
  await mkdir(path.dirname(serverPath), { recursive: true });
  await writeFile(serverPath, `${stringifyToml(serverConfig)}\n`, "utf8");

  const changed = [path.relative(project.projectRoot, serverPath)];
  if (options.assign?.length) {
    const assigned = await assignMcpServer(startDir, options.id, "team", options.assign);
    changed.push(...assigned.changed);
  }

  return {
    changed: unique(changed),
    skipped: [],
    notes: [`Added team MCP server ${options.id}.`]
  };
}

export async function assignMcpServer(startDir: string, serverId: string, source: McpSource, members: string[]): Promise<ChangeResult> {
  const project = await loadProject(startDir);
  validateId(serverId, "MCP server id");
  const changed: string[] = [];

  for (const memberId of members) {
    const member = getMember(project, memberId);
    const settings = await loadMemberSettings(project, member);
    const previousMcp = settings.mcp;
    const nextMcp: NonNullable<MemberSettings["mcp"]> = {
      mode: "isolated",
      from_main: previousMcp?.from_main ?? [],
      team: previousMcp?.team ?? []
    };
    if (previousMcp?.config_path) nextMcp.config_path = previousMcp.config_path;
    if (previousMcp?.include_inline_env !== undefined) nextMcp.include_inline_env = previousMcp.include_inline_env;
    if (previousMcp?.oauth_credentials_store) nextMcp.oauth_credentials_store = previousMcp.oauth_credentials_store;
    settings.mcp = nextMcp;

    const key = source === "main" ? "from_main" : "team";
    nextMcp[key] = addUnique(nextMcp[key] ?? [], serverId);
    if (source === "main" && !nextMcp.oauth_credentials_store) {
      nextMcp.oauth_credentials_store = "keyring";
    }
    const paths = getMemberPaths(project, member);
    await writeFile(paths.settingsAbsolutePath, formatMemberSettings(settings), "utf8");
    changed.push(paths.settingsPath);
  }

  return {
    changed: unique(changed),
    skipped: [],
    notes: [`Assigned MCP ${serverId} to ${members.join(", ")}.`]
  };
}

export async function removeMcpServer(startDir: string, serverId: string): Promise<ChangeResult> {
  const project = await loadProject(startDir);
  const serverPath = path.join(project.configRoot, "mcp", `${serverId}.toml`);
  await rm(serverPath, { force: true });

  const changed = [path.relative(project.projectRoot, serverPath)];
  for (const member of Object.values(project.team.members)) {
    const settings = await loadMemberSettings(project, member);
    const before = JSON.stringify(settings.mcp ?? {});
    if (settings.mcp?.from_main) settings.mcp.from_main = settings.mcp.from_main.filter((id) => id !== serverId);
    if (settings.mcp?.team) settings.mcp.team = settings.mcp.team.filter((id) => id !== serverId);
    if (before !== JSON.stringify(settings.mcp ?? {})) {
      const paths = getMemberPaths(project, member);
      await writeFile(paths.settingsAbsolutePath, formatMemberSettings(settings), "utf8");
      changed.push(paths.settingsPath);
    }
  }

  return {
    changed: unique(changed),
    skipped: [],
    notes: [`Removed MCP ${serverId}.`]
  };
}

export async function addSkill(startDir: string, options: SkillAddOptions): Promise<ChangeResult> {
  const project = await loadProject(startDir);
  validateId(options.id, "skill id");

  const changed: string[] = [];
  if (options.source === "project" || options.source === "team") {
    const root = options.source === "project"
      ? path.join(project.projectRoot, ".agents", "skills", options.id)
      : path.join(project.configRoot, "skills", options.id);
    const skillPath = path.join(root, "SKILL.md");
    if (!(await pathExists(skillPath))) {
      await mkdir(root, { recursive: true });
      await writeFile(skillPath, formatSkillMarkdown(options.id, options.description, options.instructions), "utf8");
      changed.push(path.relative(project.projectRoot, skillPath));
    }
  }

  if (options.assign?.length) {
    const assigned = await assignSkill(startDir, options.id, options.source, options.assign);
    changed.push(...assigned.changed);
  }

  return {
    changed: unique(changed),
    skipped: [],
    notes: [`Added ${options.source} skill ${options.id}.`]
  };
}

export async function assignSkill(startDir: string, skillId: string, source: SkillSource, members: string[]): Promise<ChangeResult> {
  const project = await loadProject(startDir);
  validateId(skillId, "skill id");
  const changed: string[] = [];

  for (const memberId of members) {
    const member = getMember(project, memberId);
    const settings = await loadMemberSettings(project, member);
    const previousSkills = settings.skills;
    const nextSkills: NonNullable<MemberSettings["skills"]> = {
      mode: "isolated",
      from_project: previousSkills?.from_project ?? [],
      from_main: previousSkills?.from_main ?? [],
      team: previousSkills?.team ?? []
    };
    if (previousSkills?.roots) nextSkills.roots = previousSkills.roots;
    if (previousSkills?.max_bytes !== undefined) nextSkills.max_bytes = previousSkills.max_bytes;
    settings.skills = nextSkills;

    const key = source === "project" ? "from_project" : source === "main" ? "from_main" : "team";
    nextSkills[key] = addUnique(nextSkills[key] ?? [], skillId);
    const paths = getMemberPaths(project, member);
    await writeFile(paths.settingsAbsolutePath, formatMemberSettings(settings), "utf8");
    changed.push(paths.settingsPath);
  }

  return {
    changed: unique(changed),
    skipped: [],
    notes: [`Assigned skill ${skillId} to ${members.join(", ")}.`]
  };
}

export async function removeSkill(startDir: string, skillId: string, source: SkillSource, options: { deleteFiles?: boolean } = {}): Promise<ChangeResult> {
  const project = await loadProject(startDir);
  const changed: string[] = [];
  for (const member of Object.values(project.team.members)) {
    const settings = await loadMemberSettings(project, member);
    const before = JSON.stringify(settings.skills ?? {});
    if (settings.skills?.from_project) settings.skills.from_project = settings.skills.from_project.filter((id) => id !== skillId);
    if (settings.skills?.from_main) settings.skills.from_main = settings.skills.from_main.filter((id) => id !== skillId);
    if (settings.skills?.team) settings.skills.team = settings.skills.team.filter((id) => id !== skillId);
    if (before !== JSON.stringify(settings.skills ?? {})) {
      const paths = getMemberPaths(project, member);
      await writeFile(paths.settingsAbsolutePath, formatMemberSettings(settings), "utf8");
      changed.push(paths.settingsPath);
    }
  }

  if (options.deleteFiles && source !== "main") {
    const root = source === "project"
      ? path.join(project.projectRoot, ".agents", "skills", skillId)
      : path.join(project.configRoot, "skills", skillId);
    await rm(root, { recursive: true, force: true });
    changed.push(path.relative(project.projectRoot, root));
  }

  return {
    changed: unique(changed),
    skipped: [],
    notes: [`Removed skill ${skillId} from assignments.`]
  };
}

export async function setContextMode(startDir: string, mode: ProjectContextMode): Promise<ChangeResult> {
  const project = await loadProject(startDir);
  const nextTeam = cloneTeam(project.team);
  nextTeam.project_context = {
    ...(nextTeam.project_context ?? { file: "project.md" }),
    mode
  };
  await writeTeam(project, nextTeam);
  return {
    changed: [".cofounder/team.yaml"],
    skipped: [],
    notes: [`Set project context mode to ${mode}.`]
  };
}

export async function listProjectMcpServers(startDir: string): Promise<string[]> {
  const project = await loadProject(startDir);
  const dir = path.join(project.configRoot, "mcp");
  if (!(await pathExists(dir))) return [];
  return (await readdir(dir))
    .filter((file) => file.endsWith(".toml"))
    .map((file) => file.replace(/\.toml$/, ""))
    .sort();
}

export async function listProjectSkills(startDir: string, source: "project" | "team"): Promise<string[]> {
  const project = await loadProject(startDir);
  const dir = source === "project"
    ? path.join(project.projectRoot, ".agents", "skills")
    : path.join(project.configRoot, "skills");
  if (!(await pathExists(dir))) return [];
  return (await readdir(dir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function defaultMemberPrompt(member: MemberDefinition): string {
  return `# ${member.title}

You are ${member.id}, a Cofounder teammate.

Responsibilities:

${member.responsibilities.map((item) => `- ${item}`).join("\n")}

Keep work scoped to the assigned task, report changed files, and include verification results.
`;
}

function formatMemberSettings(settings: MemberSettings): string {
  return `${stringifyToml(settings)}\n`;
}

function formatSkillMarkdown(id: string, description = "Describe when this skill should be used.", instructions = "Write skill instructions here."): string {
  return `---
name: ${id}
description: ${description}
---

${instructions}
`;
}

async function writeTeam(project: LoadedProject, team: TeamFile): Promise<void> {
  await writeFile(path.join(project.configRoot, "team.yaml"), YAML.stringify(team), "utf8");
}

function cloneTeam(team: TeamFile): TeamFile {
  return JSON.parse(JSON.stringify(team)) as TeamFile;
}

function titleFromId(id: string): string {
  return id
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ") || id;
}

function validateId(id: string, label: string): void {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new CofounderError(`Invalid ${label}: ${id}. Use letters, numbers, "_" or "-".`);
  }
}

function addUnique(values: string[], next: string): string[] {
  return values.includes(next) ? values : [...values, next];
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
