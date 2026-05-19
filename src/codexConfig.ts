import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { CofounderError } from "./errors.js";
import { pathExists } from "./paths.js";
import type { LoadedProject, MemberDefinition, MemberSettings } from "./types.js";

export type McpMode = "inherit" | "none" | "allowlist" | "isolated";

export interface PreparedCodexConfig {
  mode: McpMode;
  config_path: string | null;
  allowed_servers: string[];
  from_main_servers: string[];
  team_servers: string[];
  isolated: boolean;
  override_args: string[];
}

export async function prepareCodexConfig(
  project: LoadedProject,
  member: MemberDefinition,
  settings: MemberSettings,
  memberHomeAbsolutePath: string | null,
  options: { disabledSkillPaths?: string[] } = {}
): Promise<PreparedCodexConfig> {
  const mode = normalizeMcpMode(settings);
  const fromMainServers = settings.mcp?.from_main ?? settings.mcp?.allow ?? [];
  const teamServers = settings.mcp?.team ?? [];
  validateMcpSettings(mode, settings.mcp?.allow ?? [], fromMainServers, teamServers);

  const mainServers = mode === "allowlist" || mode === "isolated"
    ? await loadSelectedMainMcpServers(project, settings, fromMainServers)
    : {};
  const teamMcpServers = mode === "allowlist" || mode === "isolated"
    ? await loadSelectedTeamMcpServers(project, teamServers)
    : {};
  const selectedServers = mergeMcpServers(mainServers, teamMcpServers);

  const codexConfig = buildCodexConfig(settings, selectedServers, options.disabledSkillPaths ?? []);
  let configPath: string | null = null;
  if (memberHomeAbsolutePath) {
    const configAbsolutePath = path.join(memberHomeAbsolutePath, "config.toml");
    await writeFile(configAbsolutePath, codexConfig, "utf8");
    configPath = path.relative(project.projectRoot, configAbsolutePath);
  }

  return {
    mode,
    config_path: configPath,
    allowed_servers: mode === "allowlist" || mode === "isolated" ? [...fromMainServers, ...teamServers] : [],
    from_main_servers: mode === "allowlist" || mode === "isolated" ? fromMainServers : [],
    team_servers: mode === "allowlist" || mode === "isolated" ? teamServers : [],
    isolated: mode !== "inherit",
    override_args: mode === "allowlist" || mode === "isolated" ? buildMcpOverrideArgs(selectedServers) : []
  };
}

function normalizeMcpMode(settings: MemberSettings): McpMode {
  if (!settings.mcp?.mode && ((settings.mcp?.from_main?.length ?? 0) > 0 || (settings.mcp?.team?.length ?? 0) > 0)) {
    return "isolated";
  }
  return settings.mcp?.mode ?? "inherit";
}

function validateMcpSettings(
  mode: McpMode,
  legacyAllowedServers: string[],
  fromMainServers: string[],
  teamServers: string[]
): void {
  if (!["inherit", "none", "allowlist", "isolated"].includes(mode)) {
    throw new CofounderError(`Unsupported MCP mode: ${mode}`);
  }

  if (mode !== "allowlist" && legacyAllowedServers.length > 0) {
    throw new CofounderError("mcp.allow can only be used when mcp.mode = \"allowlist\"; use mcp.from_main for isolated mode");
  }

  if ((mode === "inherit" || mode === "none") && (fromMainServers.length > 0 || teamServers.length > 0)) {
    throw new CofounderError(`mcp.from_main and mcp.team can only be used when mcp.mode = "isolated"`);
  }

  for (const server of [...fromMainServers, ...teamServers]) {
    if (!/^[A-Za-z0-9_-]+$/.test(server)) {
      throw new CofounderError(`Unsupported MCP server id: ${server}`);
    }
  }
}

async function loadSelectedMainMcpServers(
  project: LoadedProject,
  settings: MemberSettings,
  allowedServers: string[]
): Promise<Record<string, Record<string, unknown>>> {
  const configPath = resolveBaseCodexConfigPath(project, settings);
  if (!(await pathExists(configPath))) {
    throw new CofounderError(`Codex config not found for MCP allowlist: ${configPath}`);
  }

  const raw = await readFile(configPath, "utf8");
  const parsed = parseToml(raw) as unknown;
  const mcpServers = isRecord(parsed) && isRecord(parsed.mcp_servers) ? parsed.mcp_servers : {};
  const selected: Record<string, Record<string, unknown>> = {};
  const missing: string[] = [];

  for (const server of allowedServers) {
    const definition = mcpServers[server];
    if (!isRecord(definition)) {
      missing.push(server);
      continue;
    }
    selected[server] = sanitizeMcpServerDefinition(definition, settings.mcp?.include_inline_env === true);
  }

  if (missing.length > 0) {
    throw new CofounderError(`MCP server(s) not found in Codex config: ${missing.join(", ")}`);
  }

  return selected;
}

async function loadSelectedTeamMcpServers(
  project: LoadedProject,
  allowedServers: string[]
): Promise<Record<string, Record<string, unknown>>> {
  const selected: Record<string, Record<string, unknown>> = {};
  const missing: string[] = [];

  for (const server of allowedServers) {
    const serverPath = path.join(project.configRoot, "mcp", `${server}.toml`);
    if (!(await pathExists(serverPath))) {
      missing.push(server);
      continue;
    }

    const raw = await readFile(serverPath, "utf8");
    const parsed = parseToml(raw) as unknown;
    if (!isRecord(parsed)) {
      throw new CofounderError(`Team MCP server ${server} must be a TOML object`);
    }
    selected[server] = expandProjectPlaceholders(sanitizeMcpServerDefinition(parsed, true), project);
  }

  if (missing.length > 0) {
    throw new CofounderError(`Team MCP server file(s) not found: ${missing.map((server) => `.cofounder/mcp/${server}.toml`).join(", ")}`);
  }

  return selected;
}

function mergeMcpServers(
  mainServers: Record<string, Record<string, unknown>>,
  teamServers: Record<string, Record<string, unknown>>
): Record<string, Record<string, unknown>> {
  const duplicate = Object.keys(teamServers).find((server) => mainServers[server] !== undefined);
  if (duplicate) {
    throw new CofounderError(`MCP server "${duplicate}" is configured in both mcp.from_main and mcp.team`);
  }
  return { ...mainServers, ...teamServers };
}

function resolveBaseCodexConfigPath(project: LoadedProject, settings: MemberSettings): string {
  if (settings.mcp?.config_path) {
    return resolveUserPath(settings.mcp.config_path, project.projectRoot);
  }

  const codexHome = process.env.CODEX_HOME ? path.resolve(process.env.CODEX_HOME) : path.join(os.homedir(), ".codex");
  return path.join(codexHome, "config.toml");
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

function sanitizeMcpServerDefinition(definition: Record<string, unknown>, includeInlineEnv: boolean): Record<string, unknown> {
  const allowedKeys = [
    "url",
    "command",
    "args",
    "cwd",
    "bearer_token_env_var",
    "startup_timeout_sec",
    "tool_timeout_sec"
  ];
  const sanitized: Record<string, unknown> = {};

  for (const key of allowedKeys) {
    if (definition[key] !== undefined) {
      sanitized[key] = definition[key];
    }
  }

  if (includeInlineEnv && isRecord(definition.env)) {
    sanitized.env = definition.env;
  }

  return sanitized;
}

function buildCodexConfig(
  settings: MemberSettings,
  selectedServers: Record<string, Record<string, unknown>>,
  disabledSkillPaths: string[]
): string {
  const config: Record<string, unknown> = {};
  if (settings.model) {
    config.model = settings.model;
  }
  if (settings.reasoning_effort) {
    config.model_reasoning_effort = settings.reasoning_effort;
  }
  if (Object.keys(selectedServers).length > 0) {
    config.mcp_servers = selectedServers;
  }
  if (disabledSkillPaths.length > 0) {
    config.skills = {
      config: disabledSkillPaths.map((skillPath) => ({
        path: skillPath,
        enabled: false
      }))
    };
  }

  return `# Generated by Cofounder. Do not put auth secrets here.\n${stringifyToml(config)}\n`;
}

function buildMcpOverrideArgs(selectedServers: Record<string, Record<string, unknown>>): string[] {
  const args: string[] = [];
  for (const [serverName, definition] of Object.entries(selectedServers)) {
    for (const [key, value] of Object.entries(definition)) {
      args.push("-c", `mcp_servers.${serverName}.${key}=${tomlValue(value)}`);
    }
  }
  return args;
}

function expandProjectPlaceholders(value: Record<string, unknown>, project: LoadedProject): Record<string, unknown> {
  return expandValue(value, project) as Record<string, unknown>;
}

function expandValue(value: unknown, project: LoadedProject): unknown {
  if (typeof value === "string") {
    return value
      .replaceAll("{project_root}", project.projectRoot)
      .replaceAll("{config_root}", project.configRoot);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => expandValue(entry, project));
  }
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, entryValue]) => [key, expandValue(entryValue, project)]));
  }
  return value;
}

function tomlValue(value: unknown): string {
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(tomlValue).join(", ")}]`;
  }
  if (isRecord(value)) {
    const entries = Object.entries(value).map(([key, entryValue]) => `${key} = ${tomlValue(entryValue)}`);
    return `{ ${entries.join(", ")} }`;
  }
  throw new CofounderError(`Unsupported MCP config value: ${String(value)}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
