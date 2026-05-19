#!/usr/bin/env node
import { execFile } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { PRIMARY_CALLER, getMember, loadMemberSettings, loadProject } from "./config.js";
import { CofounderError } from "./errors.js";
import { initProject, syncProjectInstructions } from "./init.js";
import {
  addMcpServer,
  addMember,
  addSkill,
  assignMcpServer,
  assignSkill,
  listProjectMcpServers,
  listProjectSkills,
  removeMcpServer,
  removeMember,
  removeSkill,
  setContextMode,
  setMember,
  type McpSource,
  type SkillSource
} from "./manage.js";
import { startMcpServer } from "./mcp.js";
import { CONFIG_DIR, findProjectRoot, pathExists } from "./paths.js";
import { formatCodexSetup, installCodexMcp } from "./setup.js";
import { listProjectTemplates } from "./templates.js";
import {
  applyTaskPatch,
  cancelTask,
  delegateMember,
  formatLogEntry,
  formatTaskStatus,
  formatTeam,
  getCapabilities,
  getTask,
  interruptTask,
  listTeam,
  readTaskEventContent,
  readTaskLogs,
  readTaskPatch,
  readTaskResult,
  runMember,
  runWorkerTask
} from "./runtime.js";

const execFileAsync = promisify(execFile);

interface CommandContext {
  argv: string[];
  commandPath: string[];
}

interface CommandDefinition {
  path: string[];
  summary: string;
  usage: string;
  details?: string;
  hidden?: boolean;
  run: (args: string[], context: CommandContext) => Promise<void> | void;
}

const commands: CommandDefinition[] = [
  {
    path: ["help"],
    summary: "Show help for Cofounder or a command.",
    usage: "cofounder help [command]",
    run: (args) => printHelp(args)
  },
  {
    path: ["start"],
    summary: "Run the project onboarding and health flow.",
    usage: "cofounder start [--template <default|worktree>] [--setup-codex] [--yes]",
    details: "Initializes missing project files, checks Codex/MCP/project state, and prints next steps.",
    run: commandStart
  },
  {
    path: ["doctor"],
    summary: "Check local project setup.",
    usage: "cofounder doctor [--json]",
    run: commandDoctor
  },
  {
    path: ["add"],
    summary: "Interactive shortcut for adding teammates, MCP servers, or skills.",
    usage: "cofounder add [member|mcp|skill]",
    run: commandAdd
  },
  {
    path: ["init"],
    summary: "Create the .cofounder project skeleton.",
    usage: "cofounder init [--template <default|worktree>] [--setup-codex] [--yes]",
    run: commandInit
  },
  {
    path: ["update"],
    summary: "Update this project and repair Codex MCP.",
    usage: "cofounder update [--yes] [--no-setup-codex]",
    run: commandUpdate
  },
  {
    path: ["pin"],
    summary: "Pin Cofounder as a project-local dev dependency.",
    usage: "cofounder pin [--yes]",
    details: "Optional advanced mode for teams that want cofounder-crew recorded in this project's package.json.",
    run: commandPin
  },
  {
    path: ["self"],
    summary: "Manage the user-level Cofounder installation.",
    usage: "cofounder self <update>",
    run: () => printNamespaceHelp(["self"])
  },
  {
    path: ["self", "update"],
    summary: "Update the globally installed cofounder command.",
    usage: "cofounder self update",
    run: commandSelfUpdate
  },
  {
    path: ["setup", "codex"],
    summary: "Print or install the Codex MCP entry.",
    usage: "cofounder setup codex [--install]",
    run: commandSetupCodex
  },
  {
    path: ["team"],
    summary: "Show the current team roster.",
    usage: "cofounder team",
    run: async () => console.log(formatTeam(await listTeam()))
  },
  {
    path: ["member"],
    summary: "Manage teammates.",
    usage: "cofounder member <list|show|add|set|remove>",
    run: () => printNamespaceHelp(["member"])
  },
  {
    path: ["member", "list"],
    summary: "List team members.",
    usage: "cofounder member list",
    run: commandMemberList
  },
  {
    path: ["member", "show"],
    summary: "Show one member.",
    usage: "cofounder member show <member>",
    run: commandMemberShow
  },
  {
    path: ["member", "add"],
    summary: "Add a teammate.",
    usage: "cofounder member add [id] [--title <title>] [--model <model>] [--write-mode <direct|worktree>] [--responsibility <text>] [--can-call <ids>] [--yes]",
    run: commandMemberAdd
  },
  {
    path: ["member", "set"],
    summary: "Edit model, sandbox, approval, write mode, MCP mode, or skill mode.",
    usage: "cofounder member set <member> [--model <model>] [--reasoning <level>] [--sandbox <mode>] [--approval <policy>] [--write-mode <direct|worktree>] [--mcp-mode <mode>] [--skills-mode <mode>]",
    run: commandMemberSet
  },
  {
    path: ["member", "remove"],
    summary: "Remove a teammate from the roster.",
    usage: "cofounder member remove <member> [--delete-files] [--yes]",
    run: commandMemberRemove
  },
  {
    path: ["mcp", "list"],
    summary: "List project-owned MCP servers and assignments.",
    usage: "cofounder mcp list",
    run: commandMcpList
  },
  {
    path: ["mcp"],
    summary: "Manage MCP servers and assignments.",
    usage: "cofounder mcp <list|add|assign|remove>",
    run: () => printNamespaceHelp(["mcp"])
  },
  {
    path: ["mcp", "add"],
    summary: "Add a project-owned MCP server.",
    usage: "cofounder mcp add [id] [--url <url> | --command <cmd>] [--arg <arg>] [--cwd <cwd>] [--env KEY=VALUE] [--assign <members>] [--yes]",
    run: commandMcpAdd
  },
  {
    path: ["mcp", "assign"],
    summary: "Assign an MCP server to teammates.",
    usage: "cofounder mcp assign <server> <member[,member]> [--source <team|main>]",
    run: commandMcpAssign
  },
  {
    path: ["mcp", "remove"],
    summary: "Remove a project-owned MCP server and all assignments.",
    usage: "cofounder mcp remove <server> [--yes]",
    run: commandMcpRemove
  },
  {
    path: ["skill", "list"],
    summary: "List project and team-only skills.",
    usage: "cofounder skill list",
    run: commandSkillList
  },
  {
    path: ["skill"],
    summary: "Manage skills and assignments.",
    usage: "cofounder skill <list|add|assign|remove>",
    run: () => printNamespaceHelp(["skill"])
  },
  {
    path: ["skill", "add"],
    summary: "Add or register a skill.",
    usage: "cofounder skill add [id] [--scope <project|team|main>] [--description <text>] [--assign <members>] [--yes]",
    run: commandSkillAdd
  },
  {
    path: ["skill", "assign"],
    summary: "Assign a skill to teammates.",
    usage: "cofounder skill assign <skill> <member[,member]> [--scope <project|team|main>]",
    run: commandSkillAssign
  },
  {
    path: ["skill", "remove"],
    summary: "Remove skill assignments, optionally deleting project/team skill files.",
    usage: "cofounder skill remove <skill> [--scope <project|team|main>] [--delete-files] [--yes]",
    run: commandSkillRemove
  },
  {
    path: ["context", "show"],
    summary: "Show worker project context mode and file.",
    usage: "cofounder context show",
    run: commandContextShow
  },
  {
    path: ["context"],
    summary: "Manage worker project context.",
    usage: "cofounder context <show|sync|mode>",
    run: () => printNamespaceHelp(["context"])
  },
  {
    path: ["context", "sync"],
    summary: "Refresh .cofounder/project.md from AGENTS.md.",
    usage: "cofounder context sync",
    run: commandContextSync
  },
  {
    path: ["context", "mode"],
    summary: "Switch worker project context mode.",
    usage: "cofounder context mode <auto|manual>",
    run: commandContextMode
  },
  {
    path: ["task", "run"],
    summary: "Run a member synchronously and stream output.",
    usage: "cofounder task run <member> <task> [--caller <primary|member>]",
    run: commandTaskRun
  },
  {
    path: ["task"],
    summary: "Run and inspect Cofounder tasks.",
    usage: "cofounder task <run|delegate|list|status|logs|watch|result|diff|apply|cancel|interrupt>",
    run: () => printNamespaceHelp(["task"])
  },
  {
    path: ["task", "delegate"],
    summary: "Start an async member task.",
    usage: "cofounder task delegate <member> <task> [--caller <primary|member>]",
    run: commandTaskDelegate
  },
  {
    path: ["task", "list"],
    summary: "List recent Cofounder tasks.",
    usage: "cofounder task list [--limit <n>]",
    run: commandTaskList
  },
  {
    path: ["task", "status"],
    summary: "Show task status.",
    usage: "cofounder task status <task_id>",
    run: async (args) => console.log(formatTaskStatus(await getTask(requiredArg(args[0], "task_id"))))
  },
  {
    path: ["task", "logs"],
    summary: "Show task logs.",
    usage: "cofounder task logs <task_id> [--tail <n>]",
    run: commandTaskLogs
  },
  {
    path: ["task", "watch"],
    summary: "Follow task events until it finishes.",
    usage: "cofounder task watch <task_id>",
    run: commandTaskWatch
  },
  {
    path: ["task", "result"],
    summary: "Print task result.",
    usage: "cofounder task result <task_id>",
    run: commandTaskResult
  },
  {
    path: ["task", "diff"],
    summary: "Print a worktree task patch.",
    usage: "cofounder task diff <task_id>",
    run: async (args) => process.stdout.write(await readTaskPatch(requiredArg(args[0], "task_id")))
  },
  {
    path: ["task", "apply"],
    summary: "Apply a worktree task patch to the main tree.",
    usage: "cofounder task apply <task_id>",
    run: commandTaskApply
  },
  {
    path: ["task", "cancel"],
    summary: "Cancel a running task.",
    usage: "cofounder task cancel <task_id>",
    run: async (args) => console.log(formatTaskStatus(await cancelTask(requiredArg(args[0], "task_id"))))
  },
  {
    path: ["task", "interrupt"],
    summary: "Cancel and resume a running task with steering instructions.",
    usage: "cofounder task interrupt <task_id> <message>",
    run: commandTaskInterrupt
  },
  {
    path: ["capabilities"],
    summary: "Print runner capabilities as JSON.",
    usage: "cofounder capabilities",
    run: () => console.log(JSON.stringify(getCapabilities(), null, 2))
  },
  {
    path: ["serve", "mcp"],
    summary: "Run the Cofounder MCP server over stdio.",
    usage: "cofounder serve mcp",
    hidden: true,
    run: () => startMcpServer()
  },
  {
    path: ["__worker"],
    summary: "Run an internal task worker.",
    usage: "cofounder __worker <task_id>",
    hidden: true,
    run: async (args) => { await runWorkerTask(requiredArg(args[0], "task_id")); }
  }
];

async function main(argv = process.argv.slice(2)): Promise<void> {
  if (argv.length === 0) {
    await commandStart([]);
    return;
  }

  const match = matchCommand(argv);
  if (!match) {
    throw new CofounderError(`Unknown command: ${argv.join(" ")}\n\nRun cofounder help to see available commands.`);
  }
  await match.command.run(match.args, { argv, commandPath: match.command.path });
}

async function commandStart(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const yes = options.flags.has("yes") || options.flags.has("y");
  const interactive = process.stdin.isTTY && process.stdout.isTTY && !yes;
  const root = process.cwd();
  let template = options.values.template ?? "default";
  let setupCodex = options.flags.has("setup-codex");

  printHeader("Cofounder Start");
  if (interactive) {
    template = await choose("Template", ["default", "worktree"], template);
    setupCodex = await confirm("Install or repair the Codex MCP entry now?", setupCodex);
  }

  const hasProject = Boolean(await findProjectRoot(root));
  if (!hasProject) {
    const result = await initProject(root, { template });
    printResult("Initialized project", result.created, result.skipped, result.notices);
  } else {
    printInfo("Project already has .cofounder/team.yaml. Skipping init.");
  }

  if (setupCodex) {
    const command = await installCodexMcp();
    printInfo(`Installed Codex MCP: ${command}`);
  }

  await printDoctor({ json: false, compact: true });
  printNextSteps(setupCodex);
}

async function commandDoctor(args: string[]): Promise<void> {
  const options = parseOptions(args);
  await printDoctor({ json: options.flags.has("json"), compact: false });
}

async function commandAdd(args: string[]): Promise<void> {
  const kind = args[0] ?? await choose("Add", ["member", "mcp", "skill"], "member");
  if (kind === "member") {
    await commandMemberAdd(args.slice(1));
    return;
  }
  if (kind === "mcp") {
    await commandMcpAdd(args.slice(1));
    return;
  }
  if (kind === "skill") {
    await commandSkillAdd(args.slice(1));
    return;
  }
  throw new CofounderError("add target must be member, mcp, or skill");
}

async function commandInit(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const template = options.values.template ?? "default";
  const result = await initProject(process.cwd(), { template });
  printResult(`Initialized ${result.template} template`, result.created, result.skipped, result.notices);
  if (options.flags.has("setup-codex")) {
    const command = await installCodexMcp();
    printInfo(`Installed Codex MCP: ${command}`);
  }
}

async function commandUpdate(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const yes = options.flags.has("yes") || options.flags.has("y");

  let setupCodex = !options.flags.has("no-setup-codex");
  if (options.flags.has("setup-codex")) {
    setupCodex = true;
  }
  const projectRoot = await findProjectRoot(process.cwd()) ?? process.cwd();

  printHeader("Update Cofounder");
  const packageInfo = await readPackageInfo(projectRoot);
  if (!packageInfo) {
    printInfo("No package.json found. Leaving project dependencies unchanged.");
  } else {
    const dependencyType = getCofounderDependencyType(packageInfo.data);
    if (dependencyType) {
      printInfo(`Project has a local cofounder-crew pin in ${dependencyType}. Run cofounder pin --yes to update it.`);
    } else {
      printInfo("No project-local cofounder-crew pin. Global Cofounder is the default runtime.");
    }
  }

  if (setupCodex) {
    if (!yes && process.stdin.isTTY && process.stdout.isTTY) {
      setupCodex = await confirm("Install or repair the Codex MCP entry?", true);
    }
    if (setupCodex) {
      const command = await installCodexMcp();
      printInfo(`Installed Codex MCP: ${command}`);
    } else {
      printInfo("Codex MCP unchanged.");
    }
  } else {
    printInfo("Codex MCP unchanged because --no-setup-codex was passed.");
  }

  console.log("");
  printInfo("Cofounder update does not overwrite .cofounder/, member settings, memory, or AGENTS.md.");
  await printDoctor({ json: false, compact: true });
}

async function commandPin(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const yes = options.flags.has("yes") || options.flags.has("y");
  const projectRoot = await findProjectRoot(process.cwd()) ?? process.cwd();
  const packageInfo = await readPackageInfo(projectRoot);
  if (!packageInfo) {
    throw new CofounderError("cofounder pin requires package.json. Run it from a Node project or use global Cofounder without pinning.");
  }

  const dependencyType = getCofounderDependencyType(packageInfo.data);
  const npmArgs = dependencyType === "dependencies"
    ? ["install", "cofounder-crew@latest"]
    : ["install", "--save-dev", "cofounder-crew@latest"];
  if (!yes) {
    await confirmUnlessYes(options, dependencyType
      ? `Update project-local cofounder-crew pin in ${dependencyType}?`
      : "Add cofounder-crew@latest as a project-local dev dependency?");
  }
  printHeader("Pin Cofounder");
  printInfo(`Running npm ${npmArgs.join(" ")}`);
  await runLoggedCommand("npm", npmArgs, projectRoot);
  printInfo("Pinned project-local cofounder-crew. Daily use can still go through the global cofounder command.");
}

async function commandSelfUpdate(_args: string[]): Promise<void> {
  printHeader("Update Cofounder CLI");
  printInfo("Running npm install -g cofounder-crew@latest");
  await runLoggedCommand("npm", ["install", "-g", "cofounder-crew@latest"], process.cwd());
  printInfo("Updated global cofounder command.");
}

async function commandSetupCodex(args: string[]): Promise<void> {
  const options = parseOptions(args);
  if (options.flags.has("install")) {
    const command = await installCodexMcp();
    console.log(`installed ${command}`);
    return;
  }
  console.log(formatCodexSetup());
}

async function commandMemberList(): Promise<void> {
  const team = await listTeam();
  for (const member of team.members) {
    console.log(`${member.id.padEnd(12)} ${member.title}`);
  }
}

async function commandMemberShow(args: string[]): Promise<void> {
  const memberId = requiredArg(args[0], "member");
  const project = await loadProject();
  const member = getMember(project, memberId);
  const settingsPath = path.join(project.configRoot, member.settings);
  const promptPath = path.join(project.configRoot, member.prompt);
  printHeader(`${member.id}: ${member.title}`);
  console.log(`runner: ${member.runner}`);
  console.log(`prompt: ${path.relative(project.projectRoot, promptPath)}`);
  console.log(`settings: ${path.relative(project.projectRoot, settingsPath)}`);
  console.log(`home: ${member.home ? path.join(CONFIG_DIR, member.home) : "none"}`);
  console.log(`can_call: ${member.can_call.length ? member.can_call.join(", ") : "none"}`);
  console.log("responsibilities:");
  for (const item of member.responsibilities) console.log(`  - ${item}`);
  console.log("");
  console.log((await readFile(settingsPath, "utf8")).trim());
}

async function commandMemberAdd(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const id = options.positionals[0] ?? await askRequired("Member id");
  const result = await addMember(process.cwd(), {
    id,
    title: options.values.title,
    model: options.values.model,
    reasoning_effort: options.values.reasoning,
    sandbox: options.values.sandbox as never,
    approval: options.values.approval,
    write_mode: options.values["write-mode"] as never,
    responsibilities: valuesOrList(options.repeated.responsibility),
    can_call: csv(options.values["can-call"])
  });
  printChangeResult(result);
}

async function commandMemberSet(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const memberId = requiredArg(options.positionals[0], "member");
  const result = await setMember(process.cwd(), memberId, {
    model: options.values.model,
    reasoning_effort: options.values.reasoning,
    sandbox: options.values.sandbox as never,
    approval: options.values.approval,
    write_mode: options.values["write-mode"] as never,
    mcp_mode: options.values["mcp-mode"] as never,
    skills_mode: options.values["skills-mode"] as never
  });
  printChangeResult(result);
}

async function commandMemberRemove(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const memberId = requiredArg(options.positionals[0], "member");
  await confirmUnlessYes(options, `Remove member ${memberId}?`);
  const result = await removeMember(process.cwd(), memberId, { deleteFiles: options.flags.has("delete-files") });
  printChangeResult(result);
}

async function commandMcpList(): Promise<void> {
  const project = await loadProject();
  const servers = await listProjectMcpServers(process.cwd());
  printHeader("Project MCP Servers");
  console.log(servers.length ? servers.map((server) => `- ${server}`).join("\n") : "none");
  console.log("");
  printHeader("Assignments");
  for (const member of Object.values(project.team.members)) {
    const settings = await loadMemberSettings(project, member);
    const team = settings.mcp?.team ?? [];
    const main = settings.mcp?.from_main ?? [];
    console.log(`${member.id}: team=[${team.join(", ")}] main=[${main.join(", ")}] mode=${settings.mcp?.mode ?? "inherit"}`);
  }
}

async function commandMcpAdd(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const id = options.positionals[0] ?? await askRequired("MCP server id");
  const url = options.values.url ?? (!options.values.command ? await askOptional("MCP URL (leave empty for command transport)") : undefined);
  const command = options.values.command ?? (!url ? await askRequired("Command") : undefined);
  const result = await addMcpServer(process.cwd(), {
    id,
    url: url || undefined,
    command,
    args: options.repeated.arg ?? [],
    cwd: options.values.cwd,
    env: parseEnv(options.repeated.env ?? []),
    assign: csv(options.values.assign)
  });
  printChangeResult(result);
}

async function commandMcpAssign(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const server = requiredArg(options.positionals[0], "server");
  const members = csv(requiredArg(options.positionals[1], "member[,member]"));
  const source = (options.values.source ?? "team") as McpSource;
  const result = await assignMcpServer(process.cwd(), server, source, members);
  printChangeResult(result);
}

async function commandMcpRemove(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const server = requiredArg(options.positionals[0], "server");
  await confirmUnlessYes(options, `Remove MCP ${server}?`);
  printChangeResult(await removeMcpServer(process.cwd(), server));
}

async function commandSkillList(): Promise<void> {
  printHeader("Project Skills (.agents/skills)");
  const projectSkills = await listProjectSkills(process.cwd(), "project");
  console.log(projectSkills.length ? projectSkills.map((skill) => `- ${skill}`).join("\n") : "none");
  console.log("");
  printHeader("Team-Only Skills (.cofounder/skills)");
  const teamSkills = await listProjectSkills(process.cwd(), "team");
  console.log(teamSkills.length ? teamSkills.map((skill) => `- ${skill}`).join("\n") : "none");
}

async function commandSkillAdd(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const id = options.positionals[0] ?? await askRequired("Skill id");
  const source = normalizeSkillSource(options.values.scope ?? await choose("Skill scope", ["project", "team", "main"], "project"));
  const result = await addSkill(process.cwd(), {
    id,
    source,
    description: options.values.description,
    assign: csv(options.values.assign)
  });
  printChangeResult(result);
}

async function commandSkillAssign(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const skill = requiredArg(options.positionals[0], "skill");
  const members = csv(requiredArg(options.positionals[1], "member[,member]"));
  const source = normalizeSkillSource(options.values.scope ?? "project");
  printChangeResult(await assignSkill(process.cwd(), skill, source, members));
}

async function commandSkillRemove(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const skill = requiredArg(options.positionals[0], "skill");
  const source = normalizeSkillSource(options.values.scope ?? "project");
  await confirmUnlessYes(options, `Remove skill ${skill} assignments?`);
  printChangeResult(await removeSkill(process.cwd(), skill, source, { deleteFiles: options.flags.has("delete-files") }));
}

async function commandContextShow(): Promise<void> {
  const project = await loadProject();
  console.log(`mode: ${project.team.project_context.mode}`);
  console.log(`file: .cofounder/${project.team.project_context.file}`);
  const contextPath = path.join(project.configRoot, project.team.project_context.file);
  if (await pathExists(contextPath)) {
    console.log("");
    console.log((await readFile(contextPath, "utf8")).trim());
  }
}

async function commandContextSync(): Promise<void> {
  const result = await syncProjectInstructions();
  console.log(`updated ${result.path}`);
  console.log(`source ${result.source}`);
  console.log(`derived ${result.derived ? "yes" : "no"}`);
}

async function commandContextMode(args: string[]): Promise<void> {
  const mode = requiredArg(args[0], "auto|manual");
  if (mode !== "auto" && mode !== "manual") {
    throw new CofounderError("context mode must be auto or manual");
  }
  printChangeResult(await setContextMode(process.cwd(), mode));
}

async function commandTaskRun(args: string[]): Promise<void> {
  const { memberId, task, caller } = parseMemberTask(args);
  const finalRecord = await runMember(memberId, task, { caller, streamToConsole: true });
  await printTaskResult(finalRecord.id);
}

async function commandTaskDelegate(args: string[]): Promise<void> {
  const { memberId, task, caller } = parseMemberTask(args);
  const record = await delegateMember(memberId, task, { caller });
  console.log(record.id);
}

async function commandTaskList(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const projectRoot = await findProjectRoot(process.cwd());
  if (!projectRoot) throw new CofounderError("Missing .cofounder/team.yaml");
  const runsDir = path.join(projectRoot, ".cofounder", "runs");
  if (!(await pathExists(runsDir))) {
    console.log("No tasks yet.");
    return;
  }
  const limit = Number(options.values.limit ?? "20");
  const tasks = (await readdir(runsDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse()
    .slice(0, limit);
  for (const taskId of tasks) {
    const task = await getTask(taskId, projectRoot);
    console.log(`${task.id} ${task.status} ${task.assignee} ${task.created_at}`);
  }
}

async function commandTaskLogs(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const taskId = requiredArg(options.positionals[0], "task_id");
  const tail = Number(options.values.tail ?? "50");
  const entries = await readTaskLogs(taskId, { tail });
  for (const entry of entries) console.log(formatLogEntry(entry));
}

async function commandTaskWatch(args: string[]): Promise<void> {
  const taskId = requiredArg(args[0], "task_id");
  let offset = 0;
  while (true) {
    const task = await getTask(taskId);
    const content = await readTaskEventContent(taskId);
    const next = content.slice(offset);
    offset = content.length;
    for (const line of next.split("\n").filter(Boolean)) console.log(formatLogEntry(JSON.parse(line)));
    if (["succeeded", "failed", "cancelled"].includes(task.status)) break;
    await sleep(750);
  }
}

async function commandTaskResult(args: string[]): Promise<void> {
  const result = await readTaskResult(requiredArg(args[0], "task_id"));
  console.log(result.trim());
}

async function commandTaskApply(args: string[]): Promise<void> {
  const taskId = requiredArg(args[0], "task_id");
  const result = await applyTaskPatch(taskId);
  console.log(`applied ${result.files.length} file(s) from ${taskId}`);
  console.log(`patch: ${result.patch_path}`);
  if (result.files.length > 0) console.log(`files: ${result.files.join(", ")}`);
}

async function commandTaskInterrupt(args: string[]): Promise<void> {
  const taskId = requiredArg(args[0], "task_id");
  const message = args.slice(1).join(" ").trim();
  if (!message) throw new CofounderError("Missing interrupt message");
  const record = await interruptTask(taskId, message);
  console.log(record.id);
}

async function printTaskResult(taskId: string): Promise<void> {
  const result = await readTaskResult(taskId);
  if (result.trim().length > 0) {
    console.log("");
    printHeader("Result");
    console.log(result.trim());
  }
}

async function printDoctor(options: { json: boolean; compact: boolean }): Promise<void> {
  const checks = await collectDoctorChecks();
  if (options.json) {
    console.log(JSON.stringify(checks, null, 2));
    return;
  }

  printHeader("Doctor");
  for (const check of checks) {
    console.log(`${check.ok ? "OK " : "ERR"} ${check.name}${check.detail ? ` - ${check.detail}` : ""}`);
  }
  if (!options.compact) {
    const failing = checks.filter((check) => !check.ok);
    if (failing.length > 0) {
      console.log("");
      console.log("Fix failing checks, then run cofounder doctor again.");
    }
  }
}

async function collectDoctorChecks(): Promise<Array<{ name: string; ok: boolean; detail?: string }>> {
  const checks: Array<{ name: string; ok: boolean; detail?: string }> = [];
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  checks.push({ name: "Node.js >=22", ok: nodeMajor >= 22, detail: process.version });
  checks.push(await commandCheck("npm", ["--version"], "npm available"));
  checks.push(await commandCheck("codex", ["--version"], "Codex CLI available"));

  const root = await findProjectRoot(process.cwd());
  checks.push({ name: ".cofounder/team.yaml", ok: Boolean(root), detail: root ?? "not found" });
  const projectRoot = root ?? process.cwd();
  checks.push({ name: "AGENTS.md", ok: await pathExists(path.join(projectRoot, "AGENTS.md")) });
  if (await pathExists(path.join(projectRoot, "AGENTS.md"))) {
    const agents = await readFile(path.join(projectRoot, "AGENTS.md"), "utf8");
    checks.push({ name: "Cofounder AGENTS bridge", ok: agents.includes("Cofounder Crew") && agents.includes("Cofounder/orchestrator") });
  }
  checks.push(await commandCheck("git", ["rev-parse", "--is-inside-work-tree"], "Git repository"));
  checks.push(await commandCheck("git", ["rev-parse", "--verify", "HEAD"], "Git HEAD exists"));
  checks.push(await codexMcpCheck());

  if (root) {
    try {
      const project = await loadProject(root);
      checks.push({ name: "Team config loads", ok: true, detail: `${Object.keys(project.team.members).length} members` });
      const ignorePath = path.join(project.configRoot, ".gitignore");
      const ignore = await pathExists(ignorePath) ? await readFile(ignorePath, "utf8") : "";
      for (const entry of ["runs/", "worktrees/", "members/*/home/"]) {
        checks.push({ name: `.cofounder/.gitignore ${entry}`, ok: ignore.includes(entry) });
      }
    } catch (error) {
      checks.push({ name: "Team config loads", ok: false, detail: error instanceof Error ? error.message : String(error) });
    }
  }

  return checks;
}

async function readPackageInfo(projectRoot: string): Promise<{ path: string; data: Record<string, unknown> } | null> {
  const packagePath = path.join(projectRoot, "package.json");
  if (!(await pathExists(packagePath))) {
    return null;
  }

  try {
    const data = JSON.parse(await readFile(packagePath, "utf8")) as Record<string, unknown>;
    return { path: packagePath, data };
  } catch (error) {
    throw new CofounderError(`Could not read package.json: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function getCofounderDependencyType(packageJson: Record<string, unknown>): "dependencies" | "devDependencies" | null {
  if (hasPackageDependency(packageJson.devDependencies)) {
    return "devDependencies";
  }
  if (hasPackageDependency(packageJson.dependencies)) {
    return "dependencies";
  }
  return null;
}

function hasPackageDependency(value: unknown): boolean {
  return typeof value === "object" && value !== null && Object.prototype.hasOwnProperty.call(value, "cofounder-crew");
}

async function runLoggedCommand(command: string, args: string[], cwd: string): Promise<void> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd,
      env: process.env,
      maxBuffer: 20 * 1024 * 1024
    });
    if (stdout.trim()) {
      console.log(stdout.trim());
    }
    if (stderr.trim()) {
      console.error(stderr.trim());
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CofounderError(`${command} ${args.join(" ")} failed: ${message}`);
  }
}

async function commandCheck(command: string, args: string[], name: string): Promise<{ name: string; ok: boolean; detail?: string }> {
  try {
    const { stdout } = await execFileAsync(command, args, { timeout: 5_000 });
    return { name, ok: true, detail: stdout.trim().split("\n")[0] };
  } catch (error) {
    return { name, ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

async function codexMcpCheck(): Promise<{ name: string; ok: boolean; detail?: string }> {
  try {
    const { stdout } = await execFileAsync("codex", ["mcp", "get", "cofounder"], { timeout: 5_000 });
    const normalized = stdout.replace(/\s+/g, " ");
    const ok = normalized.includes("cofounder serve mcp");
    return {
      name: "Codex MCP cofounder",
      ok,
      detail: ok ? "cofounder serve mcp" : "run cofounder setup codex --install"
    };
  } catch (error) {
    return { name: "Codex MCP cofounder", ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

function parseMemberTask(args: string[]): { memberId: string; task: string; caller: string } {
  const options = parseOptions(args);
  const memberId = requiredArg(options.positionals[0], "member");
  const task = options.positionals.slice(1).join(" ").trim();
  if (!task) throw new CofounderError("Missing task text");
  return { memberId, task, caller: options.values.caller ?? PRIMARY_CALLER };
}

function matchCommand(argv: string[]): { command: CommandDefinition; args: string[] } | null {
  const matches = commands
    .filter((command) => command.path.every((part, index) => argv[index] === part))
    .sort((a, b) => b.path.length - a.path.length);
  const match = matches[0];
  return match ? { command: match, args: argv.slice(match.path.length) } : null;
}

function printHelp(args: string[] = []): void {
  if (args.length > 0) {
    const match = matchCommand(args);
    if (!match) throw new CofounderError(`Unknown help topic: ${args.join(" ")}`);
    const hasChildren = commands.some((command) => isChildCommand(command.path, match.command.path));
    if (hasChildren && args.length === match.command.path.length) {
      printNamespaceHelp(match.command.path);
      return;
    }
    printCommandHelp(match.command);
    return;
  }

  printHeader("Cofounder Crew");
  console.log("Conversation-first local AI teams for Codex.");
  console.log("");
  console.log("Usage:");
  console.log("  cofounder start");
  console.log("  cofounder help <command>");
  console.log("");
  printCommandGroup("Setup", ["start", "doctor", "init", "update", "pin", "self update", "setup codex"]);
  printCommandGroup("Team", ["team", "add", "member list", "member add", "member set", "mcp add", "skill add", "context show"]);
  printCommandGroup("Tasks", ["task delegate", "task run", "task list", "task status", "task logs", "task diff", "task apply"]);
}

function printNamespaceHelp(prefix: string[]): void {
  const namespace = commands.find((command) => samePath(command.path, prefix));
  if (namespace) {
    printCommandHelp(namespace);
    console.log("");
  } else {
    printHeader(prefix.join(" "));
  }

  const children = commands
    .filter((command) => isChildCommand(command.path, prefix) && !command.hidden)
    .sort((a, b) => a.path.join(" ").localeCompare(b.path.join(" ")));

  if (children.length > 0) {
    console.log("Commands:");
    for (const command of children) {
      console.log(`  ${`cofounder ${command.path.join(" ")}`.padEnd(30)} ${command.summary}`);
    }
  }
}

function printCommandHelp(command: CommandDefinition): void {
  printHeader(command.path.join(" "));
  console.log(command.summary);
  console.log("");
  console.log("Usage:");
  console.log(`  ${command.usage}`);
  if (command.details) {
    console.log("");
    console.log(command.details);
  }
}

function printCommandGroup(title: string, names: string[]): void {
  console.log(`${title}:`);
  for (const name of names) {
    const command = commands.find((item) => item.path.join(" ") === name);
    if (command && !command.hidden) {
      console.log(`  ${`cofounder ${command.path.join(" ")}`.padEnd(30)} ${command.summary}`);
    }
  }
  console.log("");
}

function samePath(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((part, index) => part === right[index]);
}

function isChildCommand(pathParts: string[], prefix: string[]): boolean {
  return pathParts.length > prefix.length && prefix.every((part, index) => pathParts[index] === part);
}

function parseOptions(args: string[]): { positionals: string[]; values: Record<string, string>; repeated: Record<string, string[]>; flags: Set<string> } {
  const positionals: string[] = [];
  const values: Record<string, string> = {};
  const repeated: Record<string, string[]> = {};
  const flags = new Set<string>();

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "-y") {
      flags.add("y");
      continue;
    }
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    const optionText = arg.slice(2);
    const equalsIndex = optionText.indexOf("=");
    const rawName = equalsIndex === -1 ? optionText : optionText.slice(0, equalsIndex);
    const inlineValue = equalsIndex === -1 ? undefined : optionText.slice(equalsIndex + 1);
    if (isBooleanFlag(rawName)) {
      flags.add(rawName);
      continue;
    }
    const value = inlineValue ?? args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new CofounderError(`Missing --${rawName} value`);
    }
    index += inlineValue === undefined ? 1 : 0;
    if (["arg", "env", "responsibility"].includes(rawName)) {
      repeated[rawName] = [...(repeated[rawName] ?? []), value];
    } else {
      values[rawName] = value;
    }
  }

  return { positionals, values, repeated, flags };
}

function isBooleanFlag(name: string): boolean {
  return ["yes", "y", "install", "setup-codex", "no-setup-codex", "delete-files", "json"].includes(name);
}

function requiredArg(value: string | undefined, name: string): string {
  if (!value) throw new CofounderError(`Missing ${name}`);
  return value;
}

function normalizeSkillSource(value: string): SkillSource {
  if (value !== "project" && value !== "main" && value !== "team") {
    throw new CofounderError("skill scope must be project, team, or main");
  }
  return value;
}

function csv(value: string | undefined): string[] {
  return value ? value.split(",").map((item) => item.trim()).filter(Boolean) : [];
}

function valuesOrList(values: string[] | undefined): string[] | undefined {
  return values?.flatMap((item) => csv(item).length ? csv(item) : [item]);
}

function parseEnv(values: string[]): Record<string, string> {
  const env: Record<string, string> = {};
  for (const value of values) {
    const index = value.indexOf("=");
    if (index === -1) throw new CofounderError(`Invalid --env ${value}; expected KEY=VALUE`);
    env[value.slice(0, index)] = value.slice(index + 1);
  }
  return env;
}

async function askRequired(label: string): Promise<string> {
  const value = await askOptional(label);
  if (!value) throw new CofounderError(`Missing ${label}`);
  return value;
}

async function askOptional(label: string): Promise<string> {
  const reader = createInterface({ input, output });
  try {
    return (await reader.question(`${label}: `)).trim();
  } finally {
    reader.close();
  }
}

async function choose(label: string, choices: string[], fallback: string): Promise<string> {
  const answer = await askOptional(`${label} (${choices.join("/")}) [${fallback}]`);
  const value = answer || fallback;
  if (!choices.includes(value)) throw new CofounderError(`${label} must be one of: ${choices.join(", ")}`);
  return value;
}

async function confirm(message: string, fallback: boolean): Promise<boolean> {
  const answer = (await askOptional(`${message} (${fallback ? "Y/n" : "y/N"})`)).toLowerCase();
  return answer ? ["y", "yes"].includes(answer) : fallback;
}

async function confirmUnlessYes(options: ReturnType<typeof parseOptions>, message: string): Promise<void> {
  if (options.flags.has("yes") || options.flags.has("y")) return;
  if (process.stdin.isTTY && process.stdout.isTTY) {
    if (await confirm(message, false)) return;
  }
  throw new CofounderError(`${message} Re-run with --yes to confirm.`);
}

function printChangeResult(result: { changed: string[]; skipped: string[]; notes: string[] }): void {
  for (const note of result.notes) console.log(note);
  for (const item of result.changed) console.log(`changed ${item}`);
  for (const item of result.skipped) console.log(`skipped ${item}`);
}

function printResult(title: string, created: string[], skipped: string[], notices: string[]): void {
  printHeader(title);
  for (const item of created) console.log(`created ${item}`);
  for (const item of skipped) console.log(`skipped ${item}`);
  for (const notice of notices) {
    console.log("");
    console.log("Notice:");
    console.log(notice);
  }
}

function printNextSteps(setupCodex: boolean): void {
  printHeader("Next");
  if (!setupCodex) console.log("1. Run cofounder setup codex --install");
  console.log(`${setupCodex ? "1" : "2"}. Open Codex from this project directory.`);
  console.log(`${setupCodex ? "2" : "3"}. Ask: Use the Cofounder team. Show me who is available.`);
}

function printHeader(title: string): void {
  console.log(title);
  console.log("-".repeat(title.length));
}

function printInfo(message: string): void {
  console.log(message);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error: unknown) => {
  if (error instanceof CofounderError) {
    console.error(`error: ${error.message}`);
    process.exitCode = 1;
    return;
  }
  throw error;
});
