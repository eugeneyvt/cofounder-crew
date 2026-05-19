import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseToml } from "smol-toml";
import YAML from "yaml";
import { assertCondition, CofounderError } from "./errors.js";
import { configRoot, findProjectRoot, fromConfigRoot, pathExists } from "./paths.js";
import type { LoadedProject, MemberDefinition, MemberSettings, RunnerName, TeamFile } from "./types.js";

export async function loadProject(startDir = process.cwd()): Promise<LoadedProject> {
  const projectRoot = await findProjectRoot(startDir);
  assertCondition(projectRoot, `Missing .cofounder/team.yaml in ${path.resolve(startDir)} or its parents`);

  const root = configRoot(projectRoot);
  const teamPath = path.join(root, "team.yaml");
  const raw = await readFile(teamPath, "utf8");
  const parsed = YAML.parse(raw) as unknown;
  const team = normalizeTeamFile(parsed);

  await validateMemberFiles(projectRoot, team);

  return {
    projectRoot,
    configRoot: root,
    team
  };
}

export async function loadMemberSettings(project: LoadedProject, member: MemberDefinition): Promise<MemberSettings> {
  const settingsPath = fromConfigRoot(project.projectRoot, member.settings);
  const raw = await readFile(settingsPath, "utf8");
  return parseToml(raw) as unknown as MemberSettings;
}

export function getMemberPaths(project: LoadedProject, member: MemberDefinition): {
  promptPath: string;
  settingsPath: string;
  homePath: string | null;
  promptAbsolutePath: string;
  settingsAbsolutePath: string;
  homeAbsolutePath: string | null;
} {
  const promptAbsolutePath = fromConfigRoot(project.projectRoot, member.prompt);
  const settingsAbsolutePath = fromConfigRoot(project.projectRoot, member.settings);
  const homeAbsolutePath = member.home ? fromConfigRoot(project.projectRoot, member.home) : null;

  return {
    promptPath: path.relative(project.projectRoot, promptAbsolutePath),
    settingsPath: path.relative(project.projectRoot, settingsAbsolutePath),
    homePath: homeAbsolutePath ? path.relative(project.projectRoot, homeAbsolutePath) : null,
    promptAbsolutePath,
    settingsAbsolutePath,
    homeAbsolutePath
  };
}

export function getMember(project: LoadedProject, memberId: string): MemberDefinition {
  const member = project.team.members[memberId];
  if (!member) {
    throw new CofounderError(`Unknown team member: ${memberId}`);
  }
  return member;
}

export function assertCanCall(project: LoadedProject, callerId: string, assigneeId: string): void {
  if (callerId === assigneeId) {
    return;
  }

  const caller = getMember(project, callerId);
  if (!caller.can_call.includes(assigneeId)) {
    throw new CofounderError(`${callerId} is not allowed to call ${assigneeId}`);
  }
}

export function summarizeTeam(project: LoadedProject): string {
  return Object.entries(project.team.members)
    .map(([id, member]) => {
      const responsibilities = member.responsibilities.map((item) => `    - ${item}`).join("\n");
      const canCall = member.can_call.length > 0 ? member.can_call.join(", ") : "none";
      return `- ${id}: ${member.title}\n  Responsibilities:\n${responsibilities}\n  Can call: ${canCall}`;
    })
    .join("\n\n");
}

function normalizeTeamFile(input: unknown): TeamFile {
  assertCondition(isRecord(input), "team.yaml must be a YAML object");
  assertCondition(input.version === 1, "team.yaml version must be 1");
  assertCondition(isRecord(input.members), "team.yaml must define members");

  const defaults = isRecord(input.defaults) ? input.defaults : {};
  const defaultRunner = normalizeRunner(defaults.runner ?? "codex");
  const members: Record<string, MemberDefinition> = {};

  for (const [id, rawMember] of Object.entries(input.members)) {
    assertCondition(isRecord(rawMember), `Member ${id} must be an object`);
    const runner = normalizeRunner(rawMember.runner ?? defaultRunner);
    const title = stringField(rawMember, "title", id);
    const prompt = stringField(rawMember, "prompt", id);
    const settings = stringField(rawMember, "settings", id);
    const responsibilities = stringListField(rawMember, "responsibilities", id);
    const can_call = optionalStringListField(rawMember, "can_call", id);
    const home = optionalStringField(rawMember, "home", id);

    members[id] = {
      id,
      title,
      runner,
      prompt,
      settings,
      home,
      responsibilities,
      can_call
    };
  }

  return {
    version: 1,
    team: isRecord(input.team) ? {
      id: optionalStringValue(input.team.id),
      name: optionalStringValue(input.team.name)
    } : undefined,
    defaults: {
      runner: defaultRunner,
      cwd: defaults.cwd === "inherit" || defaults.cwd === undefined ? "inherit" : undefined,
      run_mode: defaults.run_mode === "sync" || defaults.run_mode === "async" ? defaults.run_mode : undefined
    },
    members
  };
}

async function validateMemberFiles(projectRoot: string, team: TeamFile): Promise<void> {
  for (const member of Object.values(team.members)) {
    const promptPath = fromConfigRoot(projectRoot, member.prompt);
    const settingsPath = fromConfigRoot(projectRoot, member.settings);
    assertCondition(await pathExists(promptPath), `Prompt file missing for ${member.id}: ${member.prompt}`);
    assertCondition(await pathExists(settingsPath), `Settings file missing for ${member.id}: ${member.settings}`);
  }
}

function normalizeRunner(value: unknown): RunnerName {
  if (value !== "codex") {
    throw new CofounderError(`Unsupported runner "${String(value)}"; MVP supports only "codex"`);
  }
  return "codex";
}

function stringField(record: Record<string, unknown>, field: string, memberId: string): string {
  const value = record[field];
  assertCondition(typeof value === "string" && value.length > 0, `Member ${memberId} must define ${field}`);
  return value;
}

function optionalStringField(record: Record<string, unknown>, field: string, memberId: string): string | undefined {
  const value = record[field];
  if (value === undefined) {
    return undefined;
  }
  assertCondition(typeof value === "string" && value.length > 0, `Member ${memberId} field ${field} must be a string`);
  return value;
}

function stringListField(record: Record<string, unknown>, field: string, memberId: string): string[] {
  const value = record[field];
  assertCondition(Array.isArray(value), `Member ${memberId} must define ${field} as a list`);
  assertCondition(value.every((item) => typeof item === "string"), `Member ${memberId} field ${field} must contain only strings`);
  return value;
}

function optionalStringListField(record: Record<string, unknown>, field: string, memberId: string): string[] {
  const value = record[field];
  if (value === undefined) {
    return [];
  }
  assertCondition(Array.isArray(value), `Member ${memberId} field ${field} must be a list`);
  assertCondition(value.every((item) => typeof item === "string"), `Member ${memberId} field ${field} must contain only strings`);
  return value;
}

function optionalStringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
